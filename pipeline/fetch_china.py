"""Fetch detailed company data and match annual report PDFs from CNINFO."""
import functools
import json
import os
import re
import requests
from fetch import CACHE, START, END, EM, cn_params, catalog, fetch, get_json, run_jobs
from fetch_industry import CNINFO

ANN = "https://www.cninfo.com.cn/new/hisAnnouncement/query"
PUBLIC_NOTICES = "https://np-anotice-stock.eastmoney.com/api/security/ann"
DETAIL = {"detail-income":"RPT_F10_FINANCE_GINCOME", "detail-balance":"RPT_F10_FINANCE_GBALANCE",
          "bank-balance":"RPT_F10_FINANCE_BBALANCE", "insurance-balance":"RPT_F10_FINANCE_IBALANCE",
          "detail-cash":"RPT_F10_FINANCE_GCASHFLOW",
          "bank-cash":"RPT_F10_FINANCE_BCASHFLOW", "insurance-cash":"RPT_F10_FINANCE_ICASHFLOW"}

def directory():
    try:
        return {r["code"]:r for r in json.loads(fetch("cninfo-companies.json",CNINFO))["stockList"]}
    except (RuntimeError, ValueError, KeyError):
        return {}

def announce(symbol, orgid):
    code, exchange = symbol.split(".")
    path = CACHE / f"cn-{symbol}-filings.json"
    if path.exists() and os.getenv("INDUSTRYLAB_REFRESH") != "1":
        return
    column = {"SH":"sse","SZ":"szse","BJ":"bse"}[exchange]
    params = dict(stock=f"{code},{orgid}",category="category_ndbg_szsh;",
        seDate=f"{START-1}-01-01~{END+1}-12-31",pageNum=1,pageSize=50,
        tabName="fulltext",column=column,isHLtitle="true")
    response = requests.post(ANN,data=params,headers={
        "Referer": f"https://www.cninfo.com.cn/new/disclosure/stock?stockCode={code}",
        "User-Agent": "Mozilla/5.0"},timeout=(8,22))
    response.raise_for_status()
    if "announcements" not in response.json():
        raise ValueError("Unexpected CNINFO response")
    path.write_bytes(response.content)

def mirrored_reports(symbol):
    """Link to copies of annual reports when CNINFO search is unavailable."""
    code = symbol.split(".")[0]
    target = CACHE / f"cn-{symbol}-mirror-filings.json"
    if target.exists() and os.getenv("INDUSTRYLAB_REFRESH") != "1":
        return
    reports = {}
    for page in range(1,5):
        payload = get_json(f"cn-{symbol}-notice-page-{page}.json",PUBLIC_NOTICES,dict(
            stock_list=code,ann_type="A",f_node=1,s_node=1,page_size=50,page_index=page))
        rows = (payload.get("data") or {}).get("list") or []
        if not rows:
            break
        for row in rows:
            title = row.get("title","")
            match = re.search(r"(20[0-9]{2})\s*年\s*年度报告",title)
            if not match or any(word in title for word in ("摘要","英文","取消","更正公告","问询","提示","审计","说明","回复")):
                continue
            if not any("年度报告全文" in column.get("column_name","") for column in row.get("columns",[])):
                continue
            year = int(match[1])
            if START-1 <= year <= END and re.fullmatch(r"AN[0-9]+",row["art_code"]):
                reports.setdefault(year,"https://pdf.dfcfw.com/pdf/H2_"+row["art_code"]+"_1.pdf")
        if rows[-1].get("notice_date","")[:4]<str(START):
            break
    if reports:
        target.write_text(json.dumps(reports),encoding="utf-8")

def download_annual_links(symbol, orgid):
    try:
        announce(symbol,orgid)
    except (requests.RequestException,ValueError):
        mirrored_reports(symbol)

def download_china(companies=None,cash_only=False):
    jobs = {}
    lookup = directory()
    for c in catalog() if companies is None else companies:
        if c["provider"] != "cn":
            continue
        symbol = c["code"]
        code = symbol.split(".")[0]
        for suffix, report in DETAIL.items():
            if cash_only and not suffix.endswith("-cash"):
                continue
            if suffix in ("bank-balance","bank-cash") and c["parent"] != "641":
                continue
            if suffix in ("insurance-balance","insurance-cash") and c["parent"] != "651":
                continue
            if suffix == "detail-cash" and c["parent"] in ("641","651"):
                continue
            key = f"cn-{symbol}-{suffix}"
            jobs[key] = functools.partial(fetch, key + ".json", EM, cn_params(symbol,report))
        if not cash_only and code in lookup:
            jobs[symbol] = functools.partial(download_annual_links,symbol,lookup[code]["orgId"])
    errors = run_jobs(jobs,limit=12)
    (CACHE / "china-errors.json").write_text(json.dumps(errors,indent=2),encoding="utf-8")
    print(f"China detailed downloads complete, {len(errors)} failed",flush=True)

if __name__ == "__main__":
    import sys
    download_china(cash_only="--cash-only" in sys.argv)
