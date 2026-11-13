"""Fetch public sources with bounded concurrency and an on-disk raw cache."""
import concurrent.futures
import gzip
import json
import os
from pathlib import Path
import re
import threading
import time
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
CACHE.mkdir(exist_ok=True)
LOCK = threading.Lock()
NEXT_SEC = 0.0
AGENT = os.getenv("SEC_USER_AGENT", "IndustryLab Local Financial Research")
SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json"
ISIC = "https://unstats.un.org/unsd/classifications/Econ/Download/In%20Text/ISIC_Rev_4_english_structure.txt"
FX = "https://api.worldbank.org/v2/country/all/indicator/PA.NUS.FCRF"
EM = "https://datacenter-web.eastmoney.com/api/data/v1/get"
NYU = "https://pages.stern.nyu.edu/~adamodar/pc/"
AMA = "https://unstats.un.org/unsd/amaapi/api/file/4"
UNIDO = "https://stat.unido.org/portal"
START = 2016
END = 2025

LARGE_JSON = re.compile(r"(?:sec-\d+|esef-index-\d{4}|[A-Z0-9]{20}-.*-ESEF-.*|profile-.+)\.json")

def cached_file(path):
    return path if path.is_file() else path.with_suffix(path.suffix + ".gz")

def read_cached(path):
    stored = cached_file(path)
    if stored.suffix == ".gz":
        with gzip.open(stored, "rb") as stream:
            return stream.read()
    return stored.read_bytes()

def fetch(name, url, params=None, payload=None, headers=None):
    global NEXT_SEC
    path = CACHE / name
    if cached_file(path).is_file() and os.getenv("INDUSTRYLAB_REFRESH") != "1":
        return read_cached(path)
    target = path.with_suffix(".json.gz") if LARGE_JSON.fullmatch(name) and not path.exists() else path
    last = None
    for attempt in range(3):
        try:
            if urlparse(url).hostname in ("data.sec.gov", "www.sec.gov"):
                with LOCK:
                    now = time.monotonic()
                    planned = max(now, NEXT_SEC)
                    NEXT_SEC = planned + 0.23
                time.sleep(max(0, planned - time.monotonic()))
            response = requests.request("POST" if payload is not None else "GET", url,
                params=params, json=payload, headers={"User-Agent": AGENT, **(headers or {})},
                timeout=(9, 36))
            response.raise_for_status()
            temp = target.with_suffix(target.suffix + ".tmp")
            if target.suffix == ".gz":
                with gzip.open(temp, "wb", compresslevel=3) as stream:
                    stream.write(response.content)
            else:
                temp.write_bytes(response.content)
            temp.replace(target)
            return response.content
        except requests.RequestException as e:
            last = e
            if getattr(e.response, "status_code", None) in (400, 404):
                break
            time.sleep(0.6 * (attempt + 1))
    if cached_file(path).is_file():
        print(f"Keeping previous {name}: {last}", flush=True)
        return read_cached(path)
    raise RuntimeError(str(last))

def get_json(*args, **kwargs):
    return json.loads(fetch(*args, **kwargs))

def run_jobs(jobs, limit=10):
    errors = []
    with concurrent.futures.ThreadPoolExecutor(limit) as pool:
        tasks = {pool.submit(task): name for name, task in jobs.items()}
        for future in concurrent.futures.as_completed(tasks):
            name = tasks[future]
            try:
                future.result()
            except Exception as error:
                errors.append((name, str(error)))
                print(f"{name}: {error}", flush=True)
    return errors

EXTRA_SEC = {
    "XOM": (34088,"Exxon Mobil Corporation"),
    "CHL": (1117795,"China Mobile"),
    "CEA": (1030475,"China Eastern Airlines"),
    "ZNH": (1041668,"China Southern Airlines"),
    "SAFM": (812128,"Sanderson Farms"),
    "ARCH": (1037676,"Arch Resources"),
    "CTB": (24491,"Cooper Tire & Rubber"),
    "NSRGY": (769309,"Nestlé"),
    "ABB": (1091587,"ABB"),
    "SKX": (1065837,"Skechers"),
    "JNPR": (1043604,"Juniper Networks"),
    "IPG": (51644,"Interpublic Group"),
    "MBT": (1115837,"Mobile TeleSystems"),
    "GOLD": (756894,"Barrick Mining"),
    "PCH": (1338749,"PotlatchDeltic"),
    "LGN": (2052959,"Lionsgate Studios"),
    "USM": (821130,"United States Cellular"),
    "CHX": (1723089,"ChampionX"),
}
# Aliases for renamed or delisted series are checked against SEC company names.
SEC_SKIP = {"SAPUTO","IKEA","PSKY","ERJ","DRL","CBD","CHX","LGN","CMC","SCI","RGS","DDL","ARCH","USM","CTB","MBT","SAFM","SKX","JNPR","IPG"}
REPORTS = {"income":"RPT_DMSK_FN_INCOME", "balance":"RPT_DMSK_FN_BALANCE"}
CURRENCY = {"US":"USD","CN":"CNY","HK":"HKD","MO":"MOP","CA":"CAD","GB":"GBP",
    "FR":"EUR","DE":"EUR","LU":"EUR","NL":"EUR","IE":"EUR","IT":"EUR","ES":"EUR","FI":"EUR",
    "BE":"EUR","GR":"EUR","CY":"EUR","DK":"DKK","NO":"NOK","SE":"SEK","CH":"CHF",
    "JP":"JPY","KR":"KRW","TW":"TWD","CL":"CLP","BR":"BRL","CO":"COP","PE":"PEN",
    "AR":"ARS","MX":"MXN","PA":"USD","UY":"UYU","IN":"INR","AU":"AUD","IL":"ILS",
    "ZA":"ZAR","SG":"SGD","PH":"PHP","ID":"IDR","RU":"RUB"}
def catalog():
    tickers = get_json("sec-tickers.json", SEC_TICKERS)
    lookup = {v["ticker"]:(v["cik_str"],v["title"]) for v in tickers.values()}
    lookup.update({k:v for k,v in EXTRA_SEC.items() if k not in lookup or k in {"GOLD","XOM"}})
    records = {}
    files = ("companies.txt", "companies-expansion.txt")
    lines = [line for name in files for line in (ROOT / "config" / name).read_text(encoding="utf-8").splitlines()]
    for line in lines:
        if not line.strip() or line.startswith("#"):
            continue
        group, benchmark, sec, cn = line.split("|")
        for entry in sec.split():
            if "-REMOVE" in entry or ":" not in entry:
                continue
            sym, country = entry.split(":")
            if sym in SEC_SKIP:
                continue
            if sym not in lookup:
                print(f"SEC symbol unavailable: {sym}")
                continue
            cik, name = lookup[sym]
            records[f"sec-{cik}"] = dict(id=f"sec-{cik}", code=sym, country=country,
                parent=group, benchmark=benchmark, name=name, cik=cik, provider="sec")
        for sym in cn.split():
            if "-REMOVE" in sym:
                continue
            records["cn-" + sym] = dict(id="cn-" + sym, code=sym, country="CN",
                parent=group, benchmark=benchmark, name=sym, provider="cn")
    return list(records.values())

def sec_url(cik):
    return f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"

def cn_params(symbol, report):
    dates = ",".join(f"'{y}-12-31'" for y in range(START-1, END+1))
    return dict(reportName=report, columns="ALL", filter=f'(SECUCODE="{symbol}")(REPORT_DATE in ({dates}))',
        sortColumns="REPORT_DATE", sortTypes="-1", pageSize=50)

def download_companies(company_list):
    jobs = {}
    for c in company_list:
        key = c["id"]
        if c["provider"] == "sec":
            jobs[key] = lambda cik=c["cik"], key=key: fetch(key + ".json", sec_url(cik))
        else:
            for table, report in REPORTS.items():
                job = key + "-" + table
                jobs[job] = lambda symbol=c["code"], report=report, job=job: fetch(
                    job + ".json", EM, cn_params(symbol, report))
    return run_jobs(jobs, limit=14)

if __name__ == "__main__":
    companies = catalog()
    print(f"Downloading {len(companies)} company filing histories", flush=True)
    errs = download_companies(companies)
    (CACHE / "company-errors.json").write_text(json.dumps(errs, indent=2), encoding="utf-8")
    print(f"Company downloads complete, {len(errs)} failed", flush=True)
