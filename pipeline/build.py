"""Build the read-only application snapshot with independently inspectable evidence."""
from collections import Counter, defaultdict
from datetime import date, datetime
import json
from pathlib import Path
import shutil
import sys
import tempfile

from fetch import CACHE, ROOT, START, END, catalog
from fetch_china import directory
from finance import calc_financials, exchange_rates, benchmark_rates, num
from industry_statistics import taxonomy, national_accounts, unido, eurostat, nbs_stats
from markets import all_markets
from xbrl import esef_catalog, get_filings
from issuer import issuer_catalog
from hk import hk_catalog
from profiles import curated_profiles, publish_profile
from verify import verify, verify_economic
from extended_finance import EXTENDED, WEIGHTS
from quality import MODEL_METRICS
from workbench_macro import RATE_COLUMNS, macro_series
from economic_functions import DATASET, VERSION, assign

SCOPES=("cn","ex","world")
REGION_CN = {"CN"}
FIN_METRICS = ("revenue","net","grossMargin","netMargin","roe","roic","wacc","spread","eva","operatingMargin","assets","nopat","grossProfit",*EXTENDED,*MODEL_METRICS)

METRICS = {
    **EXTENDED, **MODEL_METRICS, **RATE_COLUMNS,
    "revenue":("营收","money"),"net":("净利润","money"),"grossMargin":("毛利率","pct"),
    "netMargin":("净利率","pct"),"roe":("ROE","pct"),"roic":("ROIC","pct"),"wacc":("WACC 基准","pct"),
    "spread":("ROIC − WACC","pp"),"eva":("EVA 估算","money"),"operatingMargin":("经营利润率","pct"),
    "assets":("总资产","money"),"nopat":("税后经营利润","money"),"grossProfit":("毛利润","money"),
    "output":("工业产出","money"),"valueAdded":("增加值","money"),"employment":("就业人数","people"),
    "enterprises":("企业数","count"),"officialRevenue":("统计营业收入","money"),
    "officialCost":("统计营业成本","money"),"officialGrowth":("官方营收同比","pct"),
    "pretaxProfit":("利润总额（税前）","money"),"pretaxMargin":("税前利润率","pct"),
    "grossSurplus":("营业盈余","money"),"surplusMargin":("营业盈余率","pct"),"vaShare":("增加值占比","pct"),
    "gdp":("GDP","money"),"penetration":("新车渗透率","pct"),"stockPenetration":("保有量渗透率","pct"),
    "evSales":("EV 销量","vehicles"),"evStock":("EV 保有量","vehicles"),"marketShare":("市占率","pct"),
    "hhi":("HHI","index"),"retailVolume":("终端售电量","mwh"),"assignedCoverage":("可归属销量占比","pct"),
    "providers":("售电 ID 数","count"),"elasticity":("需求价格弹性","ratio"),"gasPrice":("汽油价格","gasprice"),
    "gasVolume":("汽油供应量","gasvol")
}
STATS = {
    "unido": {"name":"UNIDO · 工业调查","columns":["output","valueAdded","employment"]},
    "ama": {"name":"联合国 · 国民账户","columns":["valueAdded","vaShare","gdp"]},
    "euro": {"name":"Eurostat · 欧盟企业","columns":["officialRevenue","grossSurplus","surplusMargin","output","valueAdded","enterprises"]},
    "nbs": {"name":"国家统计局 · 规上工业","columns":["officialRevenue","pretaxProfit","grossMargin","pretaxMargin","officialGrowth","officialCost"]},
    "macro": {"name":"OpenBB · 利率","columns":list(RATE_COLUMNS)}
}
MARKET_METRICS = ["penetration","stockPenetration","marketShare","hhi","elasticity","evSales","evStock","retailVolume",
    "assignedCoverage","providers","gasVolume","gasPrice"]

def dump(path,content):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(content,ensure_ascii=False,separators=(",",":"),allow_nan=False),encoding="utf-8")

def finite_years(values):
    return sum(START<=int(y)<=END for y in values)

RATIO_WEIGHTS = {**WEIGHTS,"grossMargin":"revenue","netMargin":"revenue","roe":"equity_avg","roic":"capital",
                 "wacc":"capital","spread":"capital","operatingMargin":"revenue"}

def metric_weight(metric, metrics, raw):
    field = RATIO_WEIGHTS.get(metric)
    if field == "revenue":
        return metrics.get("revenue")
    if field:
        return raw[field][0]/raw["fx"][0] if field in raw and "fx" in raw else None
    return 1.0

def sample_aggregate(rows, audit, year):
    inputs = defaultdict(list)
    values, means, counts, operands = {},{},{},{}
    for company in rows:
        metrics = company["finance"].get(year,{})
        record = audit[company["id"]].get(year,{})
        raw = record.get("facts",{})
        for key,value in metrics.items():
            if key in MODEL_METRICS or record.get("flags",{}).get(key) == "grossConflict":
                continue
            inputs[key].append((value,metric_weight(key,metrics,raw)))
    for metric,items in inputs.items():
        numerator = sum(v for v,w in items)
        means[metric] = numerator/len(items)
        counts[metric] = [len(items), len(items)]
        operands[metric] = [[numerator,None],[numerator,len(items)]]
        if metric in RATIO_WEIGHTS:
            eligible=[(v,w) for v,w in items if num(w) and w>0]
            denom=sum(w for v,w in eligible)
            counts[metric][0]=len(eligible)
            if denom:
                weighted = sum(v*w for v,w in eligible)
                values[metric]=weighted/denom
                operands[metric][0]=[weighted,denom]
        else:
            values[metric]=numerator
    return values,means,counts,operands

def fiscal_comparability(raw, year):
    prior, current = raw.get(year-1), raw.get(year)
    if not prior or not current:
        return None
    if prior["currency"] != current["currency"]:
        return "currency"
    days = (date.fromisoformat(current["end"])-date.fromisoformat(prior["end"])).days
    if not 345 <= days <= 385:
        return "fiscal"
    return None

def paired_aggregates(companies, audit, year):
    series = defaultdict(list)
    for company in companies:
        current, prior = (company["finance"].get(y,{}) for y in (year,year-1))
        if not current or not prior or company.get("comparisonNotes",{}).get(year):
            continue
        raw = audit[company["id"]]
        for metric in current.keys() & prior.keys():
            if metric in MODEL_METRICS or any(raw[y].get("flags",{}).get(metric) == "grossConflict" for y in (year-1,year)):
                continue
            a = metric_weight(metric,current,raw[year]["facts"])
            b = metric_weight(metric,prior,raw[year-1]["facts"])
            series[metric].append((prior[metric],current[metric],b,a,prior.get("revenue",0)))

    def view(items, weighted, mean):
        if not items:
            return None
        count = len(items)
        if weighted:
            previous = sum(p*w0 for p,_,w0,_,_ in items)/sum(w0 for _,_,w0,_,_ in items)
            current = sum(c*w1 for _,c,_,w1,_ in items)/sum(w1 for _,_,_,w1,_ in items)
        else:
            denominator = count if mean else 1
            previous = sum(p for p,_,_,_,_ in items)/denominator
            current = sum(c for _,c,_,_,_ in items)/denominator
        revenue = sum(v for *_,v in items)/(count if mean else 1)
        return [float(f"{previous:.11g}"),float(f"{current:.11g}"),count,float(f"{revenue:.11g}")]

    result = {}
    for metric,items in series.items():
        weighted = metric in RATIO_WEIGHTS
        eligible = [item for item in items if all(num(w) and w>0 for w in item[2:4])] if weighted else items
        result[metric] = [view(eligible,weighted,False),view(items,False,True)]
    return result

def industry_aggregates(members, audit, start, end):
    result={}
    for code,companies in members.items():
        result[code]={}
        for scope in SCOPES:
            selected=[c for c in companies if scope=="world" or c["region"]==scope]
            if not selected:
                continue
            yearly={}
            for year in range(start-1,end+1):
                values,mean,counts,operands=sample_aggregate(selected,audit,year)
                if values or mean:
                    yearly[year]={"sum":values,"mean":mean,"counts":counts,"operands":operands}
                    if year>=start:
                        yearly[year]["comparable"]=paired_aggregates(selected,audit,year)
            if yearly:
                result[code][scope]=yearly
    return result

def economic_snapshot(companies, audit, nodes, built, start, end):
    taxonomy,assignments,members,coverage=assign(companies,nodes)
    return {"version":VERSION,"builtFrom":built,"taxonomy":list(taxonomy.values()),
            "assignments":assignments,"coverage":coverage,
            "aggregates":industry_aggregates(members,audit,start,end)}

def publish_economic_snapshot(base):
    def load(name):
        return json.loads((base/(name+".json")).read_bytes())

    meta=load("meta")
    companies=load("financial")["companies"]
    audit={}
    for company in companies:
        company["finance"]={int(year):row for year,row in company["finance"].items()}
        company["comparisonNotes"]={int(year):note for year,note in company.get("comparisonNotes",{}).items()}
        audit[company["id"]]={int(year):row for year,row in load("evidence/"+company["id"]).items()}
    nodes={node["id"]:node for node in meta["taxonomy"]}
    snapshot=economic_snapshot(companies,audit,nodes,meta["built"],meta["years"][0],meta["years"][-1])
    verify_economic(meta,companies,snapshot)
    with tempfile.NamedTemporaryFile(prefix=".economic-",suffix=".json",dir=base,delete=False) as handle:
        pending=Path(handle.name)
    try:
        dump(pending,snapshot)
        if load("meta")["built"]!=meta["built"]:
            raise RuntimeError("The financial snapshot changed during the economic-function build. Run it again.")
        pending.replace(base/(DATASET+".json"))
    finally:
        pending.unlink(missing_ok=True)
    print(json.dumps(snapshot["coverage"],indent=2),flush=True)

def financial_panel(path,nodes,built):
    rates=exchange_rates()
    benchmarks=benchmark_rates()
    cn_directory=directory()
    data=[]
    audit={}
    missing=[]
    actual_pdf=0
    curated = curated_profiles()
    icons = {file.stem.removeprefix("icon-"):file for file in CACHE.glob("icon-*.*")}
    eseffiles = get_filings(esef_catalog())
    for company in [*catalog(),*esef_catalog(),*hk_catalog(),*issuer_catalog()]:
        if company["code"] in ("CHL","ZNH"): # Financials already covered by the same issuer's A shares.
            continue
        if company["parent"] not in nodes:
            raise ValueError(f"Unknown ISIC group {company['parent']} for {company['code']}")
        values,raw=calc_financials(company,cn_directory,rates,benchmarks,eseffiles)
        if not values or not any(("revenue" in v or "net" in v) and START<=y<=END for y,v in values.items()):
            missing.append([company["code"],company["name"],company["country"]])
            continue
        company["finance"]=values
        notes={y:note for y in range(START,END+1) if (note:=fiscal_comparability(raw,y))}
        if notes:
            company["comparisonNotes"] = notes
        flags={y:r["flags"] for y,r in raw.items() if r.get("flags")}
        if flags:
            company["qualityFlags"] = flags
        publish_profile(path,company,curated,icons)
        company["region"]="cn" if company["country"] in REGION_CN else "ex"
        data.append(company)
        audit[company["id"]]=raw
        if company["provider"] == "cn":
            actual_pdf += sum(START<=y<=END and bool(r.get("official")) for y,r in raw.items())
        dump(path/"evidence"/(company["id"]+".json"),raw)
    members=defaultdict(list)
    for company in data:
        group=company["parent"]
        while group:
            members[group].append(company)
            group=nodes[group]["parent"]
    sums=industry_aggregates(members,audit,START,END)
    dump(path/"financial.json",{"companies":data,"aggregates":sums})
    dump(path/(DATASET+".json"),economic_snapshot(data,audit,nodes,built,START,END))
    metric_counts=Counter(k for c in data for y,v in c["finance"].items() if START<=y<=END for k in v)
    locations=Counter(c["country"] for c in data)
    report={
        "companies":len(data),"regions":dict(Counter(c["region"] for c in data)),"locations":dict(locations),
        "companyYears":sum(finite_years(c["finance"]) for c in data),
        "fullRevenueHistory":sum(sum(START<=y<=END and "revenue" in v for y,v in c["finance"].items())==END-START+1 for c in data),
        "officialCnPdfs":actual_pdf,"byProvider":dict(Counter(c["provider"] for c in data)),
        "companyMetricCounts":dict(metric_counts),
        "profiles":{k:sum(bool(c.get("profile",{}).get(k)) for c in data) for k in ("website","description","descriptionZh","address","logo")},"groups":sum(len(code)==3 for code in sums),"unavailable":missing
    }
    return report

def write_series(path,name,rows):
    rows=[r for r in rows if any(finite_years(v) for v in r["values"].values())]
    for r in rows:
        dump(path/"evidence"/(r["id"]+".json"),r.pop("audit"))
    rows.sort(key=lambda r:(r["parent"] or "",r["name"]))
    dump(path/(name+".json"),rows)
    return rows

def remove_snapshot(path,parent):
    resolved=path.resolve()
    if resolved.parent!=parent.resolve() or not resolved.name.startswith(".data-"):
        raise ValueError(f"Unexpected snapshot path: {resolved}")
    shutil.rmtree(resolved)

def build():
    dst=ROOT/"dist/data"
    staging=Path(tempfile.mkdtemp(prefix=".data-",dir=dst.parent))
    try:
        ts=taxonomy()
        nodes={r["id"]:r for r in ts}
        assert Counter(r["level"] for r in ts)=={1:21,2:88,3:238}
        built=datetime.now().astimezone().isoformat(timespec="seconds")
        report=financial_panel(staging,nodes,built)
        market_rows=write_series(staging,"markets",all_markets())
        series={
            "unido":write_series(staging,"unido",unido(nodes)),
            "euro":write_series(staging,"euro",eurostat(nodes)),
            "ama":write_series(staging,"ama",national_accounts()),
            "nbs":write_series(staging,"nbs",nbs_stats()),
            "macro":write_series(staging,"macro",macro_series()),
        }
        report["statsRows"]={k:len(v) for k,v in series.items()}
        report["marketRows"]=len(market_rows)
        report["marketMetricCounts"]=dict(Counter(k for r in market_rows for scope in r["values"].values()
            for y,v in scope.items() if START<=y<=END for k in v))
        report["start"],report["end"]=START,END
        if not report["companies"] or not market_rows:
            raise RuntimeError("Public source caches are incomplete. Run python pipeline/refresh.py first.")
        metadata={"schemaVersion":2,"built":built,
            "years":list(range(START,END+1)),"taxonomy":ts,"metrics":METRICS,
            "finColumns":FIN_METRICS,"marketColumns":MARKET_METRICS,"stats":STATS,
            "coverage":{k:v for k,v in report.items() if k!="unavailable"}}
        dump(staging/"meta.json",metadata)
        dump(staging/"coverage.json",report)
        if (dst/"macro-atlas").exists():
            shutil.copytree(dst/"macro-atlas",staging/"macro-atlas")
        verify(staging)
        old=dst.with_name(".data-previous")
        if old.exists():
            raise RuntimeError(f"Recover or remove prior output before rebuild: {old}")
        if dst.exists():
            dst.rename(old)
        try:
            staging.rename(dst)
        except OSError:
            if old.exists():
                old.rename(dst)
            raise
        if old.exists():
            remove_snapshot(old,dst.parent)
        print(json.dumps(metadata["coverage"],indent=2,ensure_ascii=True),flush=True)
    finally:
        if staging.exists():
            remove_snapshot(staging,dst.parent)

if __name__ == "__main__":
    if sys.argv[1:]==["--economic-functions"]:
        publish_economic_snapshot(ROOT/"dist/data")
    else:
        build()
