"""Retrieve UNIDO country-level output, value added and employment."""
import functools
import json
from fetch import CACHE, START, END, fetch, get_json, run_jobs, UNIDO
from fetch_industry import INDSTAT

DATA = UNIDO + "/dataset/getData"

def download_unido():
    meta = get_json("unido-meta.json", INDSTAT)
    codes = [c["c"] for c in meta["countries"] if c.get("iso3")]
    activities = [a["c"] for a in meta["activities"] if len(a["c"]) < 4]
    periods = [p for p in meta["periods"] if START-1 <= int(p) <= END]
    jobs = {}
    for country in codes:
        for variable in ("14","20","04"):
            name = f"indstat-{country}-{variable}.json"
            payload = dict(datasetId=meta["id"],countryCode=country,variableCode=variable,
                activityCodes=activities,periods=periods,fullPrecision=True)
            jobs[name] = functools.partial(fetch,name,DATA,payload=payload)
    errors = run_jobs(jobs,limit=8)
    (CACHE / "unido-errors.json").write_text(json.dumps(errors,indent=2),encoding="utf-8")
    print(f"UNIDO downloads complete, {len(errors)} failed",flush=True)

if __name__ == "__main__":
    download_unido()
