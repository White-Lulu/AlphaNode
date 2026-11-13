"""Pinned directory plus published regional benchmarks."""
import functools
import json

from fetch import CACHE, START, END, fetch, run_jobs, NYU
from fetch_industry import wacc_url

FDB_COMMIT = "1ac8809da4801a717541a92bb00278d4d444e240"
FDB_ROOT = "https://raw.githubusercontent.com/JerBouma/FinanceDatabase/" + FDB_COMMIT + "/"
FDB_PARQUET = FDB_ROOT + "compression/equities.parquet"
FDB_REPO = "https://github.com/JerBouma/FinanceDatabase/tree/" + FDB_COMMIT
NYU_ARCHIVE = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html"
NYU_CURRENT = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html"
REGIONS = {"global":"Global", "us":"", "europe":"Europe", "japan":"Japan", "emerging":"emerg",
    "china":"China", "india":"India", "anzca":"Rest"}
DATASETS = {"eva":"EVA","margin":"margin","wacc":"wacc"}
REGION_EN = {"global":"Global","us":"United States","europe":"Europe","japan":"Japan",
    "emerging":"Emerging markets","china":"China","india":"India","anzca":"Australia, New Zealand & Canada"}

def source_plan():
    for region, suffix in REGIONS.items():
        first = START-1 if region in ("global","us","europe","japan","emerging") else END
        for year in range(first,END+1):
            for dataset,stem in DATASETS.items():
                file = f"{stem}{suffix}.xls" if year==END else f"{stem}{suffix}{year % 100:02}.xls"
                url = NYU + ("datasets/" if year==END else "archives/") + file
                cache = f"research-{dataset}-{region}-{year}.xls"
                if dataset=="wacc" and region=="global":
                    cache,url=f"wacc-{year}.xls",wacc_url(year)
                yield (region,year,dataset,cache,url)

def download_research_sources():
    jobs = {
        "fdb-equities.parquet":functools.partial(fetch,"fdb-equities.parquet",FDB_PARQUET),
        "fdb-LICENSE":functools.partial(fetch,"fdb-LICENSE",FDB_ROOT+"LICENSE"),
    }
    for region,year,dataset,cache,url in source_plan():
        jobs[cache]=functools.partial(fetch,cache,url)
    errors=run_jobs(jobs,limit=9)
    (CACHE/"research-source-errors.json").write_text(json.dumps(errors,indent=2),encoding="utf-8")
    print(f"Research sources complete: {len(errors)} unavailable",flush=True)

if __name__=="__main__":
    download_research_sources()
