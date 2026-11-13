"""Retrieve official Chinese and EU business statistics."""
import functools
import json
from fetch import CACHE, fetch, run_jobs

NBS_BASE = "https://www.stats.gov.cn"
NBS = {
 2016:"/sj/zxfb/202302/t20230203_1899412.html",
 2017:"/sj/zxfb/202302/t20230203_1899837.html",
 2018:"/sj/zxfb/202302/t20230203_1900227.html",
 2019:"/xxgk/sjfb/zxfb2020/202002/t20200205_1767757.html",
 2020:"/sj/zxfb/202302/t20230203_1900985.html",
 2021:"/xxgk/sjfb/zxfb2020/202201/t20220127_1827079.html",
 2022:"/sj/zxfb/202302/t20230203_1901735.html",
 2023:"/xxgk/sjfb/zxfb2020/202401/t20240127_1946916.html",
 2024:"/sj/zxfb/202501/t20250127_1958485.html",
 2025:"/sj/zxfb/202601/t20260127_1962382.html",
}
EURO = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
EU_CATALOG = {
 "sbs_ovw_act": ("NETTUR_MEUR","GOS_MEUR","AV_MEUR","ENT_NR","VAL_OUT_MEUR"),
 "sbs_na_ind_r2": ("V12110","V12170","V12150","V11110","V12120"),
 "sbs_na_con_r2": ("V12110","V12170","V12150","V11110","V12120"),
 "sbs_na_dt_r2": ("V12110","V12170","V12150","V11110","V12120"),
 "sbs_na_1a_se_r2": ("V12110","V12170","V12150","V11110","V12120")
}

def download_regional():
    jobs = {}
    for dataset, metrics in EU_CATALOG.items():
        jobs[dataset] = functools.partial(fetch,f"eu-{dataset}.json",EURO+dataset,
            {"lang":"EN","geo":["EU27_2020"],"sinceTimePeriod":"2015",("indic_sbs" if dataset == "sbs_ovw_act" else "indic_sb"):metrics})
    errors = run_jobs(jobs,limit=8)
    (CACHE / "regional-errors.json").write_text(json.dumps(errors,indent=2),encoding="utf-8")

if __name__ == "__main__":
    download_regional()
