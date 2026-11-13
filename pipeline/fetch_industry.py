"""Download official macro, industry and market series and NYU benchmarks."""
import functools
import json
from fetch import CACHE, START, END, ISIC, FX, NYU, AMA, UNIDO, fetch, run_jobs

IEA = "https://api.iea.org/electric-vehicles"
IEA_PARAMS = dict(category="Historical", year=",".join(map(str,range(START-1,END+1))), csv="true")
EIA = "https://www.eia.gov/electricity/data/eia861/"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv"
GAS = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx"
INDSTAT = UNIDO + "/dataset/getDataset/INDSTAT/4"
NYU_CURRENT = NYU + "datasets/waccGlobal.xls"
FX_PARAMS = dict(format="json",date=f"{START-1}:{END}",per_page=20000)
CNINFO = "https://www.cninfo.com.cn/new/data/szse_stock.json"

def eia_url(year):
    return EIA + ("zip/" if year == 2025 else "archive/zip/") + f"f861{year}.zip"

def wacc_url(year):
    if year == 2025:
        return NYU_CURRENT
    return NYU + f"archives/waccGlobal{year % 100:02}.xls"

def download_industry():
    jobs = {
        "isic":functools.partial(fetch,"isic.csv",ISIC),
        "ama":functools.partial(fetch,"ama.xlsx",AMA),
        "worldbank-fx":functools.partial(fetch,"wdi-fx.json",FX,FX_PARAMS),
        "iea":functools.partial(fetch,"iea-ev.csv",IEA,IEA_PARAMS),
        "unido-meta":functools.partial(fetch,"unido-meta.json",INDSTAT),
        "cninfo":functools.partial(fetch,"cninfo-companies.json",CNINFO),
        "eia-gas-price":functools.partial(fetch,"eia-gas-price.html",GAS,dict(n="PET",s="EMM_EPMR_PTE_NUS_DPG",f="M")),
        "eia-gas-vol":functools.partial(fetch,"eia-gas-volume.html",GAS,dict(n="PET",s="MGFUPUS2",f="M")),
        "twd":functools.partial(fetch,"fred-twd.csv",FRED,dict(id="AEXTAUS")),
        "cpi":functools.partial(fetch,"fred-cpi.csv",FRED,dict(id="CPIAUCSL",cosd="2007-01-01",coed=f"{END}-12-31"))
    }
    for year in range(START-1,END+1):
        jobs[f"eia-{year}"] = functools.partial(fetch,f"eia-{year}.zip",eia_url(year))
        jobs[f"wacc-{year}"] = functools.partial(fetch,f"wacc-{year}.xls",wacc_url(year))
    errors = run_jobs(jobs)
    (CACHE / "industry-errors.json").write_text(json.dumps(errors,indent=2),encoding="utf-8")
    print(f"Industry downloads complete, {len(errors)} failed", flush=True)

if __name__ == "__main__":
    download_industry()