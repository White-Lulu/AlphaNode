"""Build annual rate comparisons with the OpenBB Fed provider and ECB series registry."""
import asyncio
import csv
from functools import lru_cache, partial
import json
import math
import os

from fetch import CACHE, START, END, fetch, run_jobs

RATE_COLUMNS = {"treasury2": ("两年期收益率", "pct"), "treasury10": ("十年期收益率", "pct"),
                "yieldSlope": ("10 年−2 年利差", "pp")}
FED_CACHE = CACHE / f"openbb-fed-treasury-{START-1}-{END}.json"
FED_SOURCE = "https://www.federalreserve.gov/releases/h15/"
FED_CSV = "https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&lastobs=&from=&to=&filetype=csv&label=include&layout=seriescolumn&type=package"
OPENBB_SOURCE = "https://github.com/openbq-org/OpenBB/blob/11290d8b468570cea64b5feb0225ad9cbf5228e0/openbb_platform/providers/"
FED_MODULE = "federal_reserve/openbb_federal_reserve/models/treasury_rates.py"
ECB_MODULE = "ecb/openbb_ecb/utils/yield_curve_series.py"
ECB_DATA = "https://data-api.ecb.europa.eu/service/data/YC/"
ECB_PORTAL = "https://data.ecb.europa.eu/data/datasets/YC/"

def load_provider_module(name, module_path):
    from upstream_code import load_selected
    return load_selected(name, "openbb/openbb_platform/providers/"+module_path)

def download_fed():
    if FED_CACHE.is_file() and os.getenv("INDUSTRYLAB_REFRESH") != "1":
        return
    source = load_provider_module("industrylab_fed", FED_MODULE)
    result = asyncio.run(source.FederalReserveTreasuryRatesFetcher.fetch_data({
        "start_date": f"{START-1}-01-01", "end_date": f"{END}-12-31",
    }, timeout=45))
    rows = [{"date": row.date.isoformat(), "year_2": row.year_2, "year_10": row.year_10} for row in result]
    if not rows:
        raise ValueError("No Fed H.15 daily observations")
    pending = FED_CACHE.with_suffix(".tmp")
    pending.write_text(json.dumps(rows, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    pending.replace(FED_CACHE)
    print(f"OpenBB Federal Reserve: {len(rows)} daily source records.", flush=True)

@lru_cache
def ecb_series_ids():
    source = load_provider_module("industrylab_ecb_series", ECB_MODULE)
    keys = source.get_yield_curve_ids(rating="aaa", yield_curve_type="par_yield")["SERIES_IDS"]
    return {maturity: keys[maturity] for maturity in ("year_2", "year_10")}

def ecb_file(maturity):
    return f"openbb-ecb-par-{START-1}-{END}-{maturity}.csv"

def download_macro():
    jobs = {"Federal Reserve H.15": download_fed}
    for maturity, series in ecb_series_ids().items():
        filename = ecb_file(maturity)
        jobs[filename] = partial(fetch, filename, ECB_DATA+series.removeprefix("YC."), {
            "format":"csvdata", "startPeriod":f"{START-1}-01-01", "endPeriod":f"{END}-12-31",
        }, headers={"Accept":"text/csv"})
    errors = run_jobs(jobs, limit=3)
    (CACHE/"openbb-macro-errors.json").write_text(json.dumps(errors,indent=2), encoding="utf-8")

def ecb_observations():
    rates = {}
    for maturity in ecb_series_ids():
        path = CACHE / ecb_file(maturity)
        if not path.exists():
            return []
        with path.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                try:
                    value = float(row["OBS_VALUE"])
                except (TypeError, ValueError):
                    continue
                if math.isfinite(value):
                    rates.setdefault(row["TIME_PERIOD"], {})[maturity] = value/100
    return [{"date":date, **row} for date,row in rates.items()]

def annual_rates(series_id, name, en, source, currency, observations, links):
    values = {}
    evidence = {}
    for row in sorted(observations, key=lambda record: record["date"]):
        year = int(row["date"][:4])
        if not START-1 <= year <= END or not all(isinstance(row.get(k), (float, int)) for k in ("year_2", "year_10")):
            continue
        values[year] = {"treasury2":row["year_2"], "treasury10":row["year_10"], "yieldSlope":row["year_10"]-row["year_2"]}
        evidence[year] = {"inputs":{"Observation date":row["date"][:10], "2-year (decimal)":row["year_2"],
            "10-year (decimal)":row["year_10"]},
            "formula":"Yield curve spread = 10-year yield − 2-year yield",
            "links":links}
    return {"id":series_id,"name":name,"en":en,"source":source,"parent":None,"currency":currency,
            "scopes":["ex","world"],"values":{"ex":values,"world":values},"audit":{"ex":evidence,"world":evidence}}

def macro_series():
    fed = json.loads(FED_CACHE.read_bytes()) if FED_CACHE.exists() else []
    ecb = ecb_observations()
    return [
        annual_rates("macro-us-treasury","美国国债收益率曲线","US Treasury yield curve",
                     "Federal Reserve H.15 / OpenBB","USD",fed,[FED_SOURCE,FED_CSV,OPENBB_SOURCE+FED_MODULE]),
        annual_rates("macro-ecb-aaa","欧元区 AAA 国债收益率曲线","Euro area AAA government yield curve",
                     "ECB / OpenBB","EUR",ecb,[ECB_PORTAL+key for key in ecb_series_ids().values()]+[OPENBB_SOURCE+ECB_MODULE]),
    ]

if __name__ == "__main__":
    download_macro()
