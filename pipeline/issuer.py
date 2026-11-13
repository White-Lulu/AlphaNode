"""Issuer-published annual consolidated statements."""
import functools
import json
import re

from fetch import ROOT, CACHE, START, END, fetch, run_jobs

SAMSUNG = "https://images.samsung.com/is/content/samsung/assets/global/ir/docs/"
PATTERN = re.compile(r"\(?-?\d{1,3}(?:,\d{3})+\)?")

def issuer_catalog():
    companies=[dict(id="issuer-samsung",code="005930.KS",country="KR",parent="264",
                    benchmark="Electronics (Consumer & Office)",name="Samsung Electronics 三星电子",provider="issuer")]
    path=ROOT/"config/issuer-observations.json"
    if path.exists():
        companies.extend(row["company"] for row in json.loads(path.read_bytes()))
    return companies

def samsung_url(year,kind):
    return SAMSUNG+f"{year}_con_quarter04_{kind}.pdf"

def download_issuers():
    jobs={}
    for y in range(START-1,END+1):
        for kind in ("bs","soi"):
            key=f"samsung-{y}-{kind}.pdf"
            jobs[key]=functools.partial(fetch,key,samsung_url(y,kind))
    return run_jobs(jobs,limit=6)

def samsung_facts(year):
    from pypdf import PdfReader
    def collect(kind):
        path=CACHE/f"samsung-{year}-{kind}.pdf"
        if not path.exists():
            return []
        pages=PdfReader(path).pages
        return [line.strip() for page in pages[:(3 if kind=="bs" else 1)]
            for line in page.extract_text(extraction_mode="layout").splitlines() if line.strip()]
    raw={}
    def get(lines,prefix,next_line=False):
        key=re.sub(r"[^a-zA-Z]","",prefix).lower()
        for i,line in enumerate(lines):
            tag=re.sub(r"[^a-zA-Z]","",line).lower()
            if not tag.startswith(key):
                continue
            m=PATTERN.search(line)
            if m is None and next_line and i+1<len(lines):
                m=PATTERN.search(lines[i+1])
            if m:
                string=m[0]
                return int(string.replace(",","").replace("(","-").replace(")",""))*1_000_000
        return None
    def select(k,kind,lines,caption,next_line=False):
        result=get(lines,caption,next_line)
        if result is not None:
            raw[k]=[result,caption+"（原表为百万韩元）",samsung_url(year,kind)]
    inc=collect("soi")
    bal=collect("bs")
    for k,caption in {
        "revenue":"Revenue","cogs":"Cost of sales","gross_profit":"Gross profit",
        "ebit":"Operating profit","pretax":"Profit before income tax","tax":"Income tax expense"
    }.items():
        select(k,"soi",inc,caption)
    select("net","soi",inc,"Profit attributable to owners of the",True)
    if "net" not in raw:
        profit=get(inc,"Profit for the year")
        minority=get(inc,"Non-controlling interests")
        if profit is not None and minority is not None:
            raw["net"]=[profit-minority,f"Profit for the year {profit} − non-controlling interests {minority}",samsung_url(year,"soi")]
    for k,caption in {
        "assets":"Total assets","equity_total":"Total equity","cash":"Cash and cash equivalents",
        "debt_short":"Short-term borrowings","debt_c":"Current portion of long-term",
        "long_term_loan":"Long-term borrowings","debentures":"Debentures","minority_equity":"Non-controlling interests"
    }.items():
        select(k,"bs",bal,caption,True)
    if {"equity_total","minority_equity"}<=raw.keys():
        total,minority=(raw[k][0] for k in ("equity_total","minority_equity"))
        raw["equity"]=[total-minority,f"Total equity {total} − non-controlling interests {minority}",samsung_url(year,"bs")]
    if {"long_term_loan","debentures"}<=raw.keys():
        loan,bonds=(raw[k][0] for k in ("long_term_loan","debentures"))
        raw["debt_nc"]=[loan+bonds,f"Long-term borrowings {loan} + debentures {bonds}",samsung_url(year,"bs")]
    if {"revenue","cogs","gross_profit"}<=raw.keys():
        if raw["revenue"][0]-raw["cogs"][0]!=raw["gross_profit"][0]:
            raise ValueError(f"Samsung gross profit reconciliation failed for {year}")
    return raw

def issuer_facts(company):
    if company["id"]=="issuer-samsung":
        return {year:dict(end=f"{year}-12-31",currency="KRW",facts=samsung_facts(year))
            for year in range(START-1,END+1)}
    for row in json.loads((ROOT/"config/issuer-observations.json").read_bytes()):
        if row["company"]["id"]==company["id"]:
            return {int(y):v for y,v in row["periods"].items()}
    return {}
