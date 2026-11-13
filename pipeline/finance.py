"""Normalize annual financial statements and retain each calculation input."""
from collections import Counter, defaultdict
from datetime import date
import csv
import json
import math
import re

import xlrd
from fetch import CACHE, START, END, CURRENCY, EM, cn_params, sec_url, REPORTS, FX, read_cached
from fetch_china import DETAIL
from fetch_industry import wacc_url
from urllib.parse import urlencode
from extended_finance import EXTRA_DURATION, EXTRA_INSTANT, extend
from quality import append_models

MONEY = set(CURRENCY.values()) | {"NOK","NZD","PLN","CZK","TRY","RMB","SAR","AED","KWD","MYR","VND","THB","COP","BRL","PEN","ARS","RON","ZAR","UYU"}
ISO = {"CN":"CHN","HK":"HKG","MO":"MAC","CA":"CAN","GB":"GBR","CH":"CHE","JP":"JPN",
       "KR":"KOR","CL":"CHL","BR":"BRA","CO":"COL","PE":"PER","AR":"ARG","MX":"MEX",
       "UY":"URY","IN":"IND","AU":"AUS","IL":"ISR","ZA":"ZAF","SG":"SGP","PH":"PHL",
       "ID":"IDN","RU":"RUS","SE":"SWE","DK":"DNK","NO":"NOR"}
BY_CURRENCY = {cur:ISO[country] for country,cur in CURRENCY.items() if country in ISO}
BY_CURRENCY.update(EUR="EMU",TWD="TWN",CNY="CHN")
GROUP_FIN = {"641","642","643","649","651","652","653","661","662","663"}
ANNUAL = {"10-K","10-K/A","10-KT","20-F","20-F/A","40-F","40-F/A"}
DURATION_FIELDS = {
    **EXTRA_DURATION,
    "revenue":("RevenueFromContractWithCustomerExcludingAssessedTax","SalesRevenueNet",
        "Revenue","RevenueFromContractsWithCustomers","RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueGoodsNet","Revenues","InterestAndNoninterestIncome","RevenuesNetOfInterestExpense",
        "NetInterestIncomeAndNoninterestIncome"),
    "bank_revenue":("InterestAndNoninterestIncome","RevenuesNetOfInterestExpense",
        "NetInterestIncomeAndNoninterestIncome"),
    "interest_net":("InterestIncomeExpenseNet","InterestIncomeExpenseAfterProvisionForLoanLoss",
        "NetInterestIncome"),
    "noninterest":("NoninterestIncome","NonInterestIncome"),
    "net":("NetIncomeLoss","ProfitLossAttributableToOwnersOfParent","ProfitLossAttributableToOwnersOfParentEntity","ProfitLoss"),
    "gross_profit":("GrossProfit",),
    "cogs":("CostOfRevenue","CostOfGoodsAndServicesSold","CostOfSales","CostOfGoodsSold"),
    "ebit":("OperatingIncomeLoss","ProfitLossFromOperatingActivities","OperatingProfitLoss"),
    "pretax":("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "ProfitLossBeforeTax","IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"),
    "tax":("IncomeTaxExpenseBenefit","IncomeTaxExpenseContinuingOperations"),
}
INSTANT_FIELDS = {
    **EXTRA_INSTANT,
    "retained_earnings":("RetainedEarningsAccumulatedDeficit","RetainedEarnings"),
    "assets":("Assets",),
    "equity":("StockholdersEquity","EquityAttributableToOwnersOfParent","StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest","Equity"),
    "equity_total":("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest","Equity","StockholdersEquity","EquityAttributableToOwnersOfParent"),
    "cash":("CashAndCashEquivalentsAtCarryingValue","CashAndCashEquivalents"),
    "debt_total":("LongTermDebtAndFinanceLeaseObligations","LongTermDebt","Borrowings"),
    "debt_nc":("LongTermDebtAndFinanceLeaseObligationsNoncurrent","LongTermDebtNoncurrent","NoncurrentPortionOfNoncurrentBorrowings","BorrowingsNoncurrent","NoncurrentBorrowings","LongTermBorrowings"),
    "debt_c":("LongTermDebtAndFinanceLeaseObligationsCurrent","LongTermDebtCurrent","CurrentPortionOfNoncurrentBorrowings"),
    "debt_short":("ShortTermBorrowings","ShortTermDebtCurrent","ShortTermBorrowingsCurrent","ShorttermBorrowings"),
    "debt_ifrs_current":("BorrowingsCurrent","CurrentBorrowings","ShortTermBorrowingsAndCurrentPortionOfLongTermBorrowings"),
    "lease_nc":("OperatingLeaseLiabilityNoncurrent",),
    "lease_c":("OperatingLeaseLiabilityCurrent",),
}

def read(name, default=None):
    try:
        return json.loads(read_cached(CACHE / name))
    except FileNotFoundError:
        return default

def num(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def rate_source(currency):
    if currency == "TWD":
        return "https://fred.stlouisfed.org/series/AEXTAUS"
    return "https://data.worldbank.org/indicator/PA.NUS.FCRF?locations=" + BY_CURRENCY.get(currency,"")

def exchange_rates():
    raw = read("wdi-fx.json",[{},[]])[1]
    wdi = {(r["countryiso3code"],int(r["date"])):r["value"] for r in raw if num(r["value"]) and r["value"] > 0}
    rates = {(cur,y):wdi.get((iso,y)) for cur,iso in BY_CURRENCY.items() for y in range(START-1,END+1)}
    path = CACHE / "fred-twd.csv"
    if path.exists():
        for row in csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines()):
            val = row["AEXTAUS"]
            if val and val != ".":
                rates["TWD",int(row["observation_date"][:4])] = float(val)
    return rates

def benchmark_rates():
    data = {}
    for y in range(START-1,END+1):
        path = CACHE / f"wacc-{y}.xls"
        if not path.exists():
            continue
        workbook = xlrd.open_workbook(path)
        sheet = workbook.sheet_by_index(0)
        stamp = sheet.cell_value(0,1)
        if not num(stamp):
            continue
        updated = xlrd.xldate_as_datetime(stamp,workbook.datemode)
        if (updated.year,updated.month) != (y+1,1):
            continue
        header_row = next(i for i in range(sheet.nrows) if sheet.cell_value(i,0) == "Industry Name")
        cols = {str(c).strip():i for i,c in enumerate(sheet.row_values(header_row))}
        for i in range(header_row+1,sheet.nrows):
            row = sheet.row_values(i)
            v = row[cols["Cost of Capital"]]
            if not num(v) or not 0 < v < 1 or not row[0]:
                continue
            detail = {k:row[cols[k]] for k in ["Number of Firms","Cost of Equity","E/(D+E)","After-tax Cost of Debt","D/(D+E)"] if k in cols}
            data[y,row[0].strip().lower()] = (v,detail)
    return data

def sec_filing(cik, accn):
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{accn.replace('-','')}/{accn}-index.htm"

def sec_raw(company):
    payload = read(company["id"] + ".json")
    if not payload:
        return {}
    company["name"] = payload.get("entityName",company["name"])
    facts = payload.get("facts",{})
    from xbrl import sec_supplement
    sec_supplement(company["cik"],facts)
    indices = defaultdict(list)
    duration = {**DURATION_FIELDS,"novartis_sales":("RevenueFromSaleOfGoods",)} if company["code"] == "NVS" else DURATION_FIELDS
    for instant, fields in [(False,duration),(True,INSTANT_FIELDS)]:
        for field, candidates in fields.items():
            for rank, name in enumerate(candidates):
                for taxonomy in ("us-gaap","ifrs-full"):
                    obj = facts.get(taxonomy,{}).get(name,{})
                    for cur, items in obj.get("units",{}).items():
                        if cur not in MONEY:
                            continue
                        for item in items:
                            end, start = item.get("end",""),item.get("start")
                            is_annual = item.get("form") in ANNUAL or (
                                company["code"] == "CNI" and item.get("form") == "6-K" and end.endswith("-12-31"))
                            if not is_annual or not end or bool(start) == instant or not num(item.get("val")):
                                continue
                            y = int(end[:4])
                            if not START-1 <= y <= END:
                                continue
                            if start:
                                days = (date.fromisoformat(end)-date.fromisoformat(start)).days+1
                                if not 350 <= days <= 382:
                                    continue
                            indices[y,field].append((rank,cur,item,f"{taxonomy}:{name}"))
    out = {}
    anchor_fields = ["revenue","bank_revenue","net","pretax","assets"]
    for y in range(START-1,END+1):
        scores = Counter()
        for priority, f in enumerate(anchor_fields):
            options = {(i["end"],cur) for rank,cur,i,t in indices[y,f]}
            scores.update({opt:len(anchor_fields)-priority for opt in options})
        if not scores:
            continue
        end, cur = max(scores,key=lambda k:(scores[k],k[1]==CURRENCY.get(company["country"]),k))
        row = {"end":end,"currency":cur,"facts":{}}
        for field in list(DURATION_FIELDS)+list(INSTANT_FIELDS):
            options = [(r,i,t) for r,c,i,t in indices[y,field] if c==cur and i["end"]==end]
            if not options:
                continue
            # Prefer the canonical element, then the most recently filed comparative.
            rank,item,tag = max(options,key=lambda a:(-a[0],a[1].get("filed",""),a[1].get("accn","")))
            url = sec_filing(company["cik"],item["accn"]) if item.get("accn") else sec_url(company["cik"])
            row["facts"][field] = [item["val"],tag,url]
        chosen = row["facts"]
        if company["parent"] not in GROUP_FIN and all(key in chosen for key in ("gross_profit","cogs")):
            total = chosen["gross_profit"][0] + chosen["cogs"][0]
            matching = [(r,i,t) for r,c,i,t in indices[y,"revenue"] if c==cur and i["end"]==end
                        and total>0 and abs(i["val"]-total)<=total*.005]
            if matching and ("revenue" not in chosen or abs(chosen["revenue"][0]-total)>total*.005):
                _,item,tag = max(matching,key=lambda a:(-a[0],a[1].get("filed",""),a[1].get("accn","")))
                url = sec_filing(company["cik"],item["accn"]) if item.get("accn") else sec_url(company["cik"])
                chosen["revenue"] = [item["val"],tag,url]
        if company["code"] == "NVS" and "revenue" not in row["facts"]:
            sales = [
                (rank,item,tag) for rank,currency,item,tag in indices[y,"novartis_sales"]
                if currency==cur and item["end"]==end
            ]
            if sales:
                rank,item,tag=max(sales,key=lambda a:a[1].get("filed",""))
                row["facts"]["revenue"]=[item["val"],tag,sec_filing(company["cik"],item["accn"])]
        out[y] = row
    return out

def cn_filings(company):
    data = read(company["id"] + "-filings.json",{}) or {}
    files = {}
    for r in data.get("announcements") or []:
        title = re.sub(r"<[^>]*>","",r.get("announcementTitle",""))
        if not re.search(r"20\d\d\s*年(?:度)?\s*年度报告|20\d\d\s*年度报告",title):
            continue
        if any(s in title for s in ("摘要","英文","取消","更正公告","问询","提示","披露的公告","说明","审计","回复")):
            continue
        year = int(re.search(r"20\d\d",title).group())
        path = r.get("adjunctUrl") or ""
        if path.lower().endswith(".pdf"):
            files.setdefault(year,"https://static.cninfo.com.cn/" + path)
    mirror = read(company["id"] + "-mirror-filings.json",{}) or {}
    return {**{int(year):url for year,url in mirror.items()}, **files}

def cn_raw(company, directory):
    data = {}
    urls = {}
    for suffix, report in {**REPORTS,**DETAIL}.items():
        raw = read(company["id"] + "-" + suffix + ".json",{})
        rows = ((raw.get("result") or {}).get("data") or [])
        data[suffix] = {int(r["REPORT_DATE"][:4]):r for r in rows}
        urls[suffix] = EM + "?" + urlencode(cn_params(company["code"],report))
    code = company["code"].split(".")[0]
    company["name"] = directory.get(code,{}).get("zwjc") or next(
        (r["SECURITY_NAME_ABBR"] for r in data["income"].values() if r.get("SECURITY_NAME_ABBR")),company["name"])
    official = cn_filings(company)
    out = {}
    for y in range(START-1,END+1):
        summary = data["income"].get(y,{})
        income = data["detail-income"].get(y,{})
        bal_key = next((key for key in ("detail-balance","bank-balance","insurance-balance") if y in data[key]),"detail-balance")
        bal = data[bal_key].get(y,{})
        bal_sum = data["balance"].get(y,{})
        if not (summary or income or bal or bal_sum):
            continue
        currency = income.get("CURRENCY") or bal.get("CURRENCY") or "CNY"
        row = {"end":f"{y}-12-31","currency":currency,"facts":{},"official":official.get(y)}
        fin = row["facts"]
        for key, tags in {
            "revenue":("TOTAL_OPERATE_INCOME","OPERATE_INCOME"),"net":("PARENT_NETPROFIT",),
            "cogs":("OPERATE_COST",),"pretax":("TOTAL_PROFIT",),"tax":("INCOME_TAX",),
            "sales_exp":("SALE_EXPENSE",),"admin_exp":("MANAGE_EXPENSE",),
            "research_exp":("RESEARCH_EXPENSE",),"interest_expense":("FE_INTEREST_EXPENSE",),"op_tax":("OPERATE_TAX_ADD",),
        }.items():
            for values,suffix in ((income,"detail-income"),(summary,"income")):
                tag = next((t for t in tags if num(values.get(t))),None)
                if tag:
                    fin[key] = [values[tag],tag,urls[suffix]]
                    break
        for key,tags in {
            "assets":("TOTAL_ASSETS",),"cash":("MONETARYFUNDS",),
            "current_assets":("TOTAL_CURRENT_ASSETS",),"current_liab":("TOTAL_CURRENT_LIAB",),
            "inventory":("INVENTORY",),"liabilities":("TOTAL_LIABILITIES",),
            "retained_earnings":("UNASSIGN_RPOFIT",),
            "equity":("TOTAL_PARENT_EQUITY","TOTAL_PARENT_HOLDER_EQUITY"),"equity_total":("TOTAL_EQUITY",),
            **{k:(k,) for k in ("SHORT_LOAN","LONG_LOAN","BOND_PAYABLE","SHORT_BOND_PAYABLE","NONCURRENT_LIAB_1YEAR","LEASE_LIAB")}
        }.items():
            for values,suffix in ((bal,bal_key),(bal_sum,"balance")):
                tag = next((t for t in tags if num(values.get(t))),None)
                if tag:
                    fin[key] = [values[tag],tag,urls[suffix]]
                    break
        for cash_key in ("detail-cash","bank-cash","insurance-cash"):
            cash=data[cash_key].get(y,{})
            if not cash or cash.get("CURRENCY",currency)!=currency:
                continue
            for key,tag in (("ocf","NETCASH_OPERATE"),("capex","CONSTRUCT_LONG_ASSET")):
                if num(cash.get(tag)):
                    fin[key]=[cash[tag],tag,urls[cash_key]]
            if all(num(cash.get(tag)) for tag in ("FA_IR_DEPR","IA_AMORTIZE")):
                fin["da"]=[cash["FA_IR_DEPR"]+cash["IA_AMORTIZE"],"FA_IR_DEPR + IA_AMORTIZE",urls[cash_key]]
            break
        if "cogs" in fin and "revenue" in fin and income and "admin_exp" in fin:
            operands = ["cogs","sales_exp","admin_exp","research_exp","op_tax"]
            fin["ebit"] = [fin["revenue"][0]-sum(fin[k][0] for k in operands if k in fin),
                           "总营业收入 − 营业成本 − 销售、管理、研发费用 − 税金及附加",urls["detail-income"]]
        out[y] = row
    return out

def calc_financials(company, directory, rates, benchmarks, esef_files=None):
    if company["provider"] == "sec":
        raw = sec_raw(company)
    elif company["provider"] == "esef":
        from xbrl import esef_facts
        raw = esef_facts(company,esef_files or {})
    elif company["provider"] == "hk":
        from hk import hk_facts
        raw = hk_facts(company)
    elif company["provider"] == "issuer":
        from issuer import issuer_facts
        raw = issuer_facts(company)
    else:
        raw = cn_raw(company,directory)
    is_finance = company["parent"] in GROUP_FIN
    is_bank = company["parent"] == "641"
    estimates = {}
    metrics = {}
    for y,row in sorted(raw.items()):
        facts = row["facts"]
        def get(key):
            return facts[key][0] if key in facts else None
        def sum_known(keys):
            vals = [get(k) for k in keys if get(k) is not None]
            return sum(vals) if vals else None
        if is_bank and company["provider"] == "sec":
            if get("bank_revenue") is not None:
                facts["revenue"] = facts["bank_revenue"]
            elif get("interest_net") is not None and get("noninterest") is not None:
                facts["revenue"] = [get("interest_net")+get("noninterest"),"净利息收入 + 非利息收入",sec_url(company["cik"])]
        fx = 1 if row["currency"] == "USD" else rates.get((row["currency"],y))
        if fx:
            facts["fx"] = [fx,"原币 / USD，年均",rate_source(row["currency"]) if fx != 1 else None]
        equity = get("equity")
        if company["provider"] != "cn":
            if get("debt_nc") is not None or get("debt_c") is not None:
                current_debt = ["debt_c","debt_short"] if get("debt_c") is not None else (
                    ["debt_ifrs_current"] if get("debt_ifrs_current") is not None else ["debt_short"])
                debt_keys = ["debt_nc",*current_debt,"lease_nc","lease_c"]
            elif get("debt_ifrs_current") is not None:
                debt_keys = ["debt_ifrs_current","debt_short","lease_nc","lease_c"]
            else:
                debt_keys = ["debt_total","debt_short","lease_nc","lease_c"]
        else:
            debt_keys = ["SHORT_LOAN","LONG_LOAN","BOND_PAYABLE","SHORT_BOND_PAYABLE","NONCURRENT_LIAB_1YEAR","LEASE_LIAB"]
        debt = sum_known(debt_keys)
        if debt is not None:
            facts["debt"] = [debt," + ".join(facts[k][1] for k in debt_keys if k in facts),None]
        capital = get("equity_total") + debt - get("cash") if all(v is not None for v in (get("equity_total"),debt,get("cash"))) else None
        estimates[y] = (row["currency"],equity,capital,row["end"])
        current = {}
        if fx:
            for k in ("revenue","net","assets"):
                if get(k) is not None:
                    current[k] = get(k)/fx
        rev,net,cogs,gross,ebit = map(get,("revenue","net","cogs","gross_profit","ebit"))
        if rev is not None and rev > 0:
            if net is not None:
                current["netMargin"] = net/rev
            if not is_finance:
                gp = gross if gross is not None else (rev-cogs if cogs is not None else None)
                if gp is not None:
                    current["grossMargin"] = gp/rev
                    if fx:
                        current["grossProfit"] = gp/fx
                if ebit is not None:
                    current["operatingMargin"] = ebit/rev
        prior = estimates.get(y-1)
        if not prior or prior[0] != row["currency"] or not 345 <= (date.fromisoformat(row["end"])-date.fromisoformat(prior[3])).days <= 385:
            prior = (None,None,None,None)
        if equity is not None and prior[1] is not None and min(equity,prior[1]) > 0:
            eq = (equity+prior[1])/2
            facts["equity_avg"] = [eq,f"({prior[1]:g} + {equity:g}) ÷ 2",None]
            if net is not None:
                current["roe"] = net/eq
        if not is_finance:
            pretax,tax = get("pretax"),get("tax")
            if ebit is not None and pretax and pretax > 0 and tax is not None and 0 <= tax/pretax <= 0.60:
                nopat = ebit*(1-tax/pretax)
                facts["nopat"] = [nopat,"经营利润 × (1 − 所得税 ÷ 税前利润)",None]
                if fx:
                    current["nopat"] = nopat/fx
            if capital is not None and prior[2] is not None and min(capital,prior[2]) > 0:
                ic = (capital+prior[2])/2
                facts["capital"] = [ic,f"({prior[2]:g} + {capital:g}) ÷ 2",None]
                if "nopat" in facts:
                    current["roic"] = get("nopat")/ic
            benchmark = benchmarks.get((y,company["benchmark"].lower()))
            if benchmark and rev is not None:
                value,detail = benchmark
                facts["wacc"] = [value,f"{company['benchmark']} · {y+1} 年 1 月 · {detail}",wacc_url(y)]
                current["wacc"] = value
                if "roic" in current:
                    current["spread"] = current["roic"]-value
                    if fx:
                        current["eva"] = (get("nopat")-value*get("capital"))/fx
        extend(row,raw.get(y-1),current,is_finance)
        if current:
            ratios = {"roe":"equity_avg", "roic":"capital", "spread":"capital"}
            row["flags"] = {m:"thinCapital" for m,key in ratios.items() if m in current
                and (get("assets") or 0)>0 and (get(key) or 0) < .01*get("assets")}
            if current.get("grossMargin",0) > 1.05:
                row["flags"]["grossMargin"] = "grossConflict"
                if "grossProfit" in current:
                    row["flags"]["grossProfit"] = "grossConflict"
            if not row["flags"]:
                row.pop("flags")
            metrics[y] = {k:float(f"{v:.11g}") for k,v in current.items()}
    append_models(raw,metrics,is_finance)
    return metrics,raw
