"""Normalize annual Eastmoney statements for Hong Kong-listed issuers."""
from bisect import bisect_right
from datetime import date
from functools import lru_cache
import json
import math
import os

from openpyxl import load_workbook

from fetch import CACHE, ROOT, START, END, fetch, get_json, run_jobs
from akshare_hk import AKSHARE_CODE, cache_path as native_path, fetch_company as fetch_native

SOURCE = "https://emweb.securities.eastmoney.com/PC_HKF10/FinancialAnalysis/index?type=web&code="
CURRENCIES = {"港元": "HKD", "港币": "HKD", "人民币": "CNY", "美元": "USD", "新加坡元": "SGD"}
SAFE_FX = "https://www.safe.gov.cn/safe/file/file/20260106/0f147e5357eb4c12a6406fc575cc21e8.xlsx"
SAFE_CACHE = "safe-fx-1994-2025.xlsx"
OFFICIAL_2025 = {
    "00700":"https://static.www.tencent.com/uploads/2026/04/09/62d786fcf3d3c8cb7e54791ee95439ac.pdf",
    "00992":"https://investor.lenovo.com/en/financial/results/press_2425_q4.pdf",
    "01299":"https://www.aia.com/content/dam/group-wise/en/docs/investor-relations/2026/AIA%20Group%202025%20Annual%20Results%20Ann%20%28Eng%29.pdf",
    "00066":"https://www.mtr.com.hk/archive/corporate/en/investor/annual2025/EMTRAR25.pdf",
    "02388":"https://www.bochkholdings.com/dam/bochk/desktop/top/aboutus/ir/docs/finreport/bochkholdings/2025ar/e101_fullset.pdf",
}
API = "https://datacenter.eastmoney.com/securities/api/data/v1/get"
STATEMENTS = {"income":"RPT_HKF10_FN_INCOME_PC", "balance":"RPT_HKF10_FN_BALANCE_PC"}
FIELDS = {
    "income": {
        "revenue": ("004001999", "004001001", "003003999", "002003999", "001003999"),
        "net": ("004025002", "003015002", "002014002", "001025002"),
        "cogs": ("004005001",), "gross_profit": ("004007999",),
        "ebit": ("004010999", "003010999", "002010999", "001010999"),
        "pretax": ("004011999", "003011999", "002011999", "001011999"),
        "tax": ("004012001", "003012001", "002012001", "001012001"),
        "interest_expense": ("004011201", "003011006", "002011003"),
    },
    "balance": {
        "assets": ("004009999", "003005999", "002001999", "001001999"),
        "current_assets": ("004002999", "003002999"), "current_liab": ("004011999", "003007999"),
        "liabilities": ("004025999", "003019999", "002002999"), "inventory": ("004002001",),
        "cash": ("004002010", "003002010", "002001001"),
        "debt_short": ("004011010", "003007010"), "debt_nc": ("004020001", "003015001"),
        "equity": ("004030999", "003025999", "002009999", "001009999"),
        "equity_total": ("004036999", "003029999", "002011999", "001011999"),
    },
    "cash": {"ocf": ("003999",), "capex": ("005005",), "da": ("001009",)},
}

def hk_catalog():
    entries = json.loads((ROOT/"config/hk-companies.json").read_bytes())
    return [{"id": f"hk-{code}", "code": code[-4:]+".HK", "localCode":code,
             "name":zh, "en":en, "country":country, "parent":isic,
             "provider":"hk", "benchmark":benchmark}
            for code,zh,en,isic,benchmark,country in entries]

def cache_path(stock):
    return CACHE / f"hk-legacy-{stock}.json"

def fetch_company(stock):
    path = cache_path(stock)
    if path.is_file() and os.getenv("INDUSTRYLAB_REFRESH") != "1":
        return
    base = {"source":"F10", "client":"PC"}
    selector = f'(SECUCODE="{stock}.HK")'
    summary = get_json(f"hk-summary-{stock}.json",API,{
        **base, "reportName":"RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY", "filter":selector,
        "columns":"SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,START_DATE,REPORT_DATE,FISCAL_YEAR,CURRENCY,ACCOUNT_STANDARD,REPORT_TYPE"})
    summaries = (summary.get("result") or {}).get("data") or []
    reports = {"annual":[row for row in (summaries[0].get("REPORT_LIST") or [])
        if row["REPORT_TYPE"]=="年报" and START-1 <= int(row["REPORT_DATE"][:4]) <= END]} if summaries else {"annual":[]}
    if not reports["annual"]:
        raise ValueError("No annual report dates")
    dates = ",".join("'" + row["REPORT_DATE"][:10] + "'" for row in reports["annual"])
    for key, report in STATEMENTS.items():
        payload = get_json(f"hk-{key}-{stock}.json",API,{**base,
            "reportName":report, "columns":"REPORT_DATE,STD_ITEM_CODE,STD_ITEM_NAME,AMOUNT",
            "filter":f"{selector}(REPORT_DATE in ({dates}))", "sortTypes":"-1,1", "sortColumns":"REPORT_DATE,STD_ITEM_CODE"})
        reports[key] = (payload.get("result") or {}).get("data") or []
        if not reports[key]:
            raise ValueError(f"No annual {key} data")
    staged = path.with_suffix(".tmp")
    staged.write_text(json.dumps(reports,ensure_ascii=False),encoding="utf-8")
    staged.replace(path)

def download_hk():
    fetch(SAFE_CACHE,SAFE_FX)
    def download(stock):
        _, error = fetch_native(stock)
        if error:
            fetch_company(stock)
            if not native_path(stock).exists() and not cache_path(stock).exists():
                raise ValueError(error)
    errors = run_jobs({c["localCode"]:lambda stock=c["localCode"]:download(stock) for c in hk_catalog()},limit=5)
    (CACHE/"hk-errors.json").write_text(json.dumps(errors,ensure_ascii=False),encoding="utf-8")
    print(f"Hong Kong-listed annual statements: {len(hk_catalog())-len(errors)} available; {len(errors)} errors.",flush=True)

@lru_cache(maxsize=1)
def official_parities():
    """SAFE reports renminbi per 100 foreign currency units."""
    path = CACHE/SAFE_CACHE
    if not path.exists():
        return [], {}
    book = load_workbook(path,read_only=True,data_only=True)
    try:
        rows = iter(book.worksheets[0].values)
        header = next(rows)
        cols = {CURRENCIES[name]:i for i,name in enumerate(header) if name in CURRENCIES}
        rates = {}
        for row in rows:
            day = row[0]
            if isinstance(day,str) and f"{START-2}-01-01" <= day <= f"{END}-12-31":
                rates[day] = {currency:float(row[i])/100 for currency,i in cols.items()
                              if row[i] not in (None,"","--","-")}
        return sorted(rates),rates
    finally:
        book.close()

def source_parity(end, currency):
    if currency == "CNY":
        return end,1.0
    days,rates = official_parities()
    pos = bisect_right(days,end)
    if not pos:
        return None,None
    day = days[pos-1]
    if (date.fromisoformat(end)-date.fromisoformat(day)).days>7:
        return None,None
    return day,rates[day].get(currency)

def hk_facts(company):
    stock = company["localCode"]
    native = native_path(stock)
    path = native if native.exists() else cache_path(stock)
    if not path.exists():
        return {}
    document = json.loads(path.read_bytes())
    uses_akshare = path == native
    observations = {}
    parities = {}
    for source in document["annual"]:
        end = source["REPORT_DATE"][:10]
        currency = CURRENCIES.get(source.get("CURRENCY"), source.get("CURRENCY"))
        if currency not in {"HKD","CNY","USD","SGD"} or not START-1 <= int(end[:4]) <= END:
            continue
        start = (source.get("START_DATE") or "")[:10]
        if start and not 350 <= (date.fromisoformat(end)-date.fromisoformat(start)).days+1 <= 382:
            continue
        day,parity = source_parity(end,currency)
        if not parity:
            continue
        observations[end] = {"end":end, "currency":currency, "facts":{}}
        if uses_akshare:
            observations[end]["providerCode"] = AKSHARE_CODE
        parities[end] = (day,parity)
        if end.startswith("2025") and stock in OFFICIAL_2025:
            observations[end]["official"] = OFFICIAL_2025[stock]
    for statement, mapping in FIELDS.items():
        rows = {}
        for raw in document.get(statement, []):
            end = raw["REPORT_DATE"][:10]
            value = raw["AMOUNT"]
            if end in observations and isinstance(value, (int, float)) and math.isfinite(value):
                rows.setdefault(end, {})[str(raw["STD_ITEM_CODE"])] = (value, raw["STD_ITEM_NAME"])
        for end, facts in rows.items():
            target = observations[end]["facts"]
            day,parity = parities[end]
            for key, candidates in mapping.items():
                if stock == "00066" and key in ("gross_profit","cogs"):
                    continue
                for code in candidates:
                    if code in facts:
                        value, label = facts[code]
                        tag = label+" ["+code+"]"
                        if parity != 1.0:
                            tag += f" · 人民币 {value:,.2f} ÷ {parity:g}（{day} 中间价）"
                        target[key] = [value/parity, tag, SOURCE+stock]
                        break
    result = {}
    for end,row in sorted(observations.items()):
        if not row["facts"]:
            continue
        day,parity = parities[end]
        if parity != 1.0:
            row["facts"]["source_fx"] = [parity,f"人民币／财报原币，{day} 中间价",SAFE_FX]
            row["note"] = "东方财富接口金额统一为人民币。此处先用财年末中间价还原财报原币，再用年均汇率换算美元。"
        result[int(end[:4])] = row
    return result

if __name__ == "__main__":
    download_hk()
