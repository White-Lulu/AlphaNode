"""Default chart analysis and daily allowances for the hosted site."""

from contextlib import closing
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import compare_digest, digest
from http.cookies import CookieError, SimpleCookie
from ipaddress import ip_address, ip_network
import os
from pathlib import Path
import re
import secrets
import sqlite3
from threading import BoundedSemaphore

from server.local_services import ARK_MODEL, ServiceError, analyze


COOKIE = "__Host-alphanode-visitor"
DAILY_LIMIT = 10
NETWORK_LIMIT = 60
BEIJING = timezone(timedelta(hours=8))


class WebAnalysis:
    def __init__(self, directory, key):
        self.key = key
        self.signing_key = digest(key.encode(), b"AlphaNode web visitor v1", sha256)
        directory = Path(directory)
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.database = directory / "usage.sqlite3"
        self.slots = BoundedSemaphore(4)
        with closing(self.connect()) as db, db:
            db.execute("""CREATE TABLE IF NOT EXISTS usage (
                day TEXT, subject TEXT, used INTEGER NOT NULL,
                PRIMARY KEY (day, subject)
            )""")
        os.chmod(self.database, 0o600)

    def connect(self):
        return sqlite3.connect(self.database, timeout=5)

    def hash(self, value):
        return digest(self.signing_key, value.encode(), sha256).hex()

    def visitor(self, header):
        try:
            cookie = SimpleCookie(header).get(COOKIE)
        except CookieError:
            cookie = None
        if cookie:
            visitor, _, signature = cookie.value.partition(".")
            if re.fullmatch(r"[a-f0-9]{32}", visitor) and re.fullmatch(r"[a-f0-9]{64}", signature):
                if compare_digest(signature, self.hash(visitor)):
                    return visitor, None
        visitor = secrets.token_hex(16)
        return visitor, f"{COOKIE}={visitor}.{self.hash(visitor)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000"

    @staticmethod
    def day():
        return datetime.now(BEIJING).date().isoformat()

    @staticmethod
    def used(db, day, subject):
        row = db.execute("SELECT used FROM usage WHERE day=? AND subject=?", (day, subject)).fetchone()
        return row[0] if row else 0

    def allowance(self, visitor):
        with closing(self.connect()) as db:
            remaining = DAILY_LIMIT - self.used(db, self.day(), self.hash("visitor:" + visitor))
        return {"dailyLimit": DAILY_LIMIT, "remaining": remaining}

    def settings(self, visitor):
        return {"publicWeb": True, "provider": "default", "defaultModel": ARK_MODEL, **self.allowance(visitor)}

    def reserve(self, day, visitor, address):
        # Limit attempts on one network even when the browser identity is recreated.
        ip = ip_address(address)
        network = str(ip_network(f"{ip}/64", strict=False)) if ip.version == 6 else str(ip)
        visitor_key, network_key = self.hash("visitor:" + visitor), self.hash("network:" + network)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if self.used(db, day, visitor_key) >= DAILY_LIMIT:
                raise ServiceError(429, "AI_DAILY_LIMIT")
            if self.used(db, day, network_key) >= NETWORK_LIMIT:
                raise ServiceError(429, "AI_NETWORK_LIMIT")
            db.execute("DELETE FROM usage WHERE day < ?", (day,))
            db.executemany("""INSERT INTO usage VALUES (?, ?, 1)
                ON CONFLICT (day, subject) DO UPDATE SET used=used+1""",
                [(day, visitor_key), (day, network_key)])
        return visitor_key

    def run(self, data, visitor, address):
        if not self.slots.acquire(blocking=False):
            raise ServiceError(503, "AI_WEB_BUSY")
        day, reservation = self.day(), None

        def reserve():
            nonlocal reservation
            reservation = self.reserve(day, visitor, address)

        try:
            config = {"provider": "default", "arkKey": self.key}
            result = analyze(data, config=config, before_generate=reserve)
        except Exception:
            if reservation:
                with closing(self.connect()) as db, db:
                    db.execute("UPDATE usage SET used=used-1 WHERE day=? AND subject=?", (day, reservation))
            raise
        finally:
            self.slots.release()
        return {**result, **self.allowance(visitor)}
