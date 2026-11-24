"""Download and build the macro atlas independently of company financials."""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import date, datetime
import hashlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import tempfile
import zipfile
import requests

from fetch import ROOT, CACHE, fetch as fetch_source, cached_file, read_cached
from macro_catalog import BIS, CATEGORIES, ECONOMIES, FRED, IMF, SOURCES, WB

START = 2000
TODAY = date.today()
END = TODAY.year - 1
USE_CACHE_ONLY = False

def fetch(name, *args, **kwargs):
    if USE_CACHE_ONLY:
        if not cached_file(CACHE/name).is_file():
            raise RuntimeError("Missing macro cache: " + name)
        return read_cached(CACHE/name)
    return fetch_source(name, *args, **kwargs)

def numeric(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None

def load_json(name, url, params=None):
    body = fetch("macro-atlas-" + name + ".json", url, params,
        headers={"User-Agent": requests.utils.default_user_agent()})
    return json.loads(body)

def period_allowed(period):
    if len(period) == 4:
        return START <= int(period) <= END
    if "-Q" in period:
        return str(START) <= period and (int(period[:4]), int(period[-1])) < (TODAY.year, (TODAY.month-1)//3+1)
    return str(START) <= period < TODAY.isoformat()[:7]

def series_row(economy):
    return {"economy": economy, "values": {}, "notes": {}}

def set_value(rows, economy, period, value, unit, notes=None):
    value = numeric(value)
    if economy not in ECONOMIES or value is None or not period_allowed(period):
        return
    row = rows.setdefault(economy, series_row(economy))
    row["values"][period] = value / 100 if unit == "pct" else value
    if notes:
        row["notes"].update({key: text for key, text in notes.items() if text})

def build_wb(countries):
    codes = ";".join(c["id"] for c in countries if c["id"] != "TWN")
    definitions = load_json("wb-wdi-definitions", "https://api.worldbank.org/v2/indicator",
        {"source": 2, "format": "json", "per_page": 20000})[1]
    definitions = {row["id"]: row for row in definitions}
    output = {}
    for offset in range(0, len(WB), 10):
        chunk = WB[offset:offset+10]
        endpoint = "https://api.worldbank.org/v2/country/" + codes + "/indicator/" + ";".join(m["code"] for m in chunk)
        pages = load_json("wb-" + str(offset), endpoint, {
            "source": 2, "format": "json", "date": f"{START}:{END}", "per_page": 20000})
        if not isinstance(pages, list) or len(pages) != 2 or "pages" not in pages[0]:
            raise ValueError("World Bank returned an invalid data response")
        records = pages[1] or []
        for page in range(2, int(pages[0]["pages"])+1):
            records.extend(load_json(f"wb-{offset}-{page}", endpoint, {
                "source": 2, "format": "json", "date": f"{START}:{END}", "per_page": 20000, "page": page})[1] or [])
        for metric in chunk:
            rows = {}
            for record in records:
                if record["indicator"]["id"] == metric["code"]:
                    set_value(rows, record["countryiso3code"], record["date"], record["value"], metric["unit"])
            info = definitions.get(metric["code"], {})
            output[metric["id"]] = {
                **metric, "rows": list(rows.values()), "definition": info.get("sourceNote", ""),
                "publisher": info.get("sourceOrganization", "World Bank"),
                "url": "https://data.worldbank.org/indicator/" + metric["code"],
                "updated": pages[0].get("lastupdated"),
            }
    return output

def build_imf():
    output = {}
    for metric in IMF:
        endpoint = "https://www.imf.org/external/datamapper/api/v2/" + metric["code"]
        data = load_json(metric["code"], endpoint)
        info = data["indicators"][metric["code"]]
        rows = {}
        for economy, history in data["values"][metric["code"]].items():
            for period, value in history.items():
                set_value(rows, economy, period, value, metric["unit"])
        output[metric["id"]] = {
            **metric, "rows": list(rows.values()), "definition": info.get("description", ""),
            "publisher": info.get("source", "IMF WEO"), "updated": info.get("last-modified", "")[:10],
            "url": "https://www.imf.org/external/datamapper/" + metric["code"],
            "note": "IMF WEO 历史序列可能含工作人员估计，展示至最近完整历年。",
            "noteEn": "Historical WEO observations can include IMF staff estimates. Only completed calendar years are shown.",
        }
    return output

def build_bis(countries):
    areas = {c["iso2"]: c["id"] for c in countries if len(c["iso2"]) == 2}
    areas["XM"] = "EMU"
    area = "+".join(areas)
    flows = {
        "WS_CBPOL": "M." + area,
        "WS_LONG_CPI": "M." + area,
        "WS_SPP": "Q." + area,
        "WS_TC": "Q." + area + ".P+H+N.A.M.770.A",
        "WS_DSR": "Q." + area + ".P",
        "WS_EER": "M.R.B." + area,
    }
    output = {}
    for flow, key in flows.items():
        body = fetch("macro-atlas-" + flow + ".csv", "https://stats.bis.org/api/v1/data/" + flow + "/" + key,
            {"startPeriod": str(START), "format": "csv"}, headers={"Accept": "text/csv"})
        records = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
        if not records or "OBS_VALUE" not in records[0]:
            raise ValueError("BIS returned invalid " + flow)
        for metric in [item for item in BIS if item["code"] == flow]:
            rows = {}
            for record in records:
                if flow == "WS_LONG_CPI" and record["UNIT_MEASURE"] != ("771" if metric["id"] == "cpiMonthly" else "628"):
                    continue
                if flow == "WS_SPP":
                    wanted = ("N", "628") if metric["id"] == "nominalHousePrices" else ("R", "771" if metric["id"] == "housePricesYoy" else "628")
                    if (record["VALUE"], record["UNIT_MEASURE"]) != wanted:
                        continue
                if flow == "WS_TC" and record["TC_BORROWERS"] != {"totalCredit": "P", "householdCredit": "H", "corporateCredit": "N"}[metric["id"]]:
                    continue
                country = areas.get(record.get("REF_AREA", record.get("BORROWERS_CTY")))
                value = numeric(record["OBS_VALUE"])
                if value is None:
                    continue
                value *= 10 ** int(record.get("UNIT_MULT") or 0)
                set_value(rows, country, record["TIME_PERIOD"], value, metric["unit"], {
                    "standard": record.get("COMPILATION"), "publisher": record.get("SOURCE_REF"),
                    "breaks": record.get("SUPP_INFO_BREAKS") or record.get("BREAKS")})
            output[metric["id"]] = {**metric, "rows": list(rows.values()),
                "url": "https://data.bis.org/topics/" + {
                    "WS_CBPOL": "CBPOL", "WS_LONG_CPI": "CPI", "WS_SPP": "RPP",
                    "WS_TC": "TOTAL_CREDIT", "WS_DSR": "DSR", "WS_EER": "EER"}[flow],
                "publisher": "Bank for International Settlements / national authorities",
                "definition": {
                    "WS_CBPOL": "End-of-month rate selected with the national central bank. Rate definitions and historical breaks differ by economy; see the series standard.",
                    "WS_LONG_CPI": "National consumer price statistics. Monthly year-on-year changes or index, 2010 = 100.",
                    "WS_SPP": "BIS selected residential property prices. Real series deflated by consumer prices. Index, 2010 = 100, or published annual percentage change.",
                    "WS_TC": "Credit from all lending sectors to the selected non-financial borrower sector, market value, percentage of GDP, adjusted for breaks.",
                    "WS_DSR": "Debt service payments relative to income of the private non-financial sector. BIS estimates.",
                    "WS_EER": "Broad real effective exchange rate index, 2020 = 100. An increase indicates real appreciation.",
                }[flow],
            }
    return output

def build_fred():
    records = []
    for offset in range(0, len(FRED), 4):
        body = fetch(f"macro-atlas-fred-{offset}.csv", "https://fred.stlouisfed.org/graph/fredgraph.csv",
            {"id": ",".join(item[4] for item in FRED[offset:offset+4]), "cosd": f"{START-1}-01-01"},
            headers={"User-Agent": requests.utils.default_user_agent()})
        if zipfile.is_zipfile(io.BytesIO(body)):
            with zipfile.ZipFile(io.BytesIO(body)) as archive:
                for name in archive.namelist():
                    if name.endswith(".csv"):
                        records.extend(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))))
        else:
            records.extend(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
    output = {}
    for key, zh, en, category, code, unit, frequency, transform, factor, publisher in FRED:
        grouped = defaultdict(list)
        for record in records:
            value = numeric(record.get(code))
            day = record.get("observation_date", record.get("DATE", ""))
            if value is None or not day or int(day[:4]) < START-1:
                continue
            period = day[:7] if frequency == "M" else day[:4] + "-Q" + str((int(day[5:7])-1)//3+1)
            grouped[period].append((day, value))
        history = {period: sorted(items)[-1][1] if transform == "last" else sum(v for _, v in items)/len(items)
            for period, items in grouped.items()}
        rows = {}
        for period, value in history.items():
            if transform == "yoy":
                previous = history.get(str(int(period[:4])-1) + period[4:])
                value = (value/previous-1)*100 if previous and previous > 0 else None
            elif unit == "pct":
                value *= 100*factor
            else:
                value *= factor
            set_value(rows, "USA", period, value, unit)
        note = "同比 =（本期指数 ÷ 上年同月指数 − 1）×100%。" if transform == "yoy" else ""
        output[key] = dict(id=key, name=zh, en=en, category=category, code=code, unit=unit, source="fred",
            frequency=frequency, rows=list(rows.values()), publisher=publisher,
            url="https://fred.stlouisfed.org/series/" + code, note=note,
            definition=("YoY = index(t) / index(t-12) - 1. " if transform == "yoy" else "") +
                "US official source via FRED. Monthly observations retain the source seasonal adjustment. Treasury yields are calendar-month averages; Federal Reserve assets use the final published weekly observation of each month.")
    return output

def build(cached=False):
    global USE_CACHE_ONLY
    USE_CACHE_ONLY = cached
    if cached:
        needed = ["macro-atlas-wb-0.json", "macro-atlas-WS_CBPOL.csv"]
        if not all(cached_file(CACHE/name).exists() for name in needed):
            raise RuntimeError("Macro caches are missing. Run python pipeline/macro_atlas.py first.")
    country_data = load_json("countries", "https://api.worldbank.org/v2/country", {"format": "json", "per_page": 400})[1]
    countries = [{**item, "iso2": item["iso2Code"]} for item in country_data if item["id"] in ECONOMIES]
    countries.append({"id": "TWN", "iso2": "TW", "name": "Taiwan region", "region": {"id": "EAS", "value": "East Asia & Pacific"}})
    countries.sort(key=lambda c: ECONOMIES.index(c["id"]))
    jobs = {"wb": lambda: build_wb(countries), "bis": lambda: build_bis(countries), "imf": build_imf, "fred": build_fred}
    metrics, errors = {}, []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(job): name for name, job in jobs.items()}
        for task in as_completed(futures):
            source = futures[task]
            try:
                result = task.result()
                metrics.update(result)
                print(source, len(result), "indicators", flush=True)
            except Exception as error:
                errors.append({"source": source, "error": str(error)})
                print(source, "FAILED", str(error)[:200], flush=True)
    expected = len(WB)+len(BIS)+len(IMF)+len(FRED)
    if errors or len(metrics) != expected or any(not item["rows"] for item in metrics.values()):
        raise RuntimeError("Macro build incomplete; existing output retained. " + json.dumps(errors))
    for item in metrics.values():
        for row in item["rows"]:
            row["values"] = dict(sorted(row["values"].items()))
            assert row["values"] and all(math.isfinite(v) for v in row["values"].values())
    output = ROOT/"dist/data/macro-atlas"
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".macro-", dir=output.parent))
    try:
        manifest = {"version": 1, "built": datetime.now().astimezone().isoformat(timespec="seconds"),
            "start": START, "annualEnd": END, "sources": SOURCES,
            "categories": [{"id": key, "name": zh, "en": en} for key, zh, en in CATEGORIES],
            "economies": [{"id": c["id"], "iso2": c["iso2"], "en": c["name"],
                "aggregate": c["region"]["id"] == "NA"} for c in countries], "metrics": []}
        for item in sorted(metrics.values(), key=lambda m: ([c[0] for c in CATEGORIES].index(m["category"]), m["id"])):
            body = json.dumps(item, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
            digest = hashlib.sha256(body).hexdigest()[:16]
            filename = item["id"] + "-" + digest + ".json"
            (staging/filename).write_bytes(body)
            periods = [period for row in item["rows"] for period in row["values"]]
            manifest["metrics"].append({key: value for key, value in item.items() if key != "rows"} |
                {"file": filename, "economies": [row["economy"] for row in item["rows"]],
                 "first": min(periods), "last": max(periods), "observations": len(periods)})
        # Content-addressed histories allow the manifest to switch without partial reads.
        output.mkdir(exist_ok=True)
        for path in staging.iterdir():
            os.replace(path, output/path.name)
        (staging/"index.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(staging/"index.json", output/"index.json")
    finally:
        shutil.rmtree(staging)
    print("Macro atlas ready:", len(metrics), "indicators,", len(countries), "economies", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cached", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.force and args.cached:
        parser.error("--cached and --force are mutually exclusive")
    if args.force:
        os.environ["INDUSTRYLAB_REFRESH"] = "1"
    build(args.cached)
