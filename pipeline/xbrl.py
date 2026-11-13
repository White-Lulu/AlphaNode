"""Annual filings from the European filing repository and direct SEC instances."""
import collections
import datetime as dt
import functools
import json
import re
import xml.etree.ElementTree as ET

from fetch import CACHE, ROOT, START, END, fetch, run_jobs, read_cached

BASE="https://filings.xbrl.org"
X="{http://www.xbrl.org/2003/instance}"

def esef_catalog():
    rows=[]
    for line in (ROOT/"config/esef-companies.txt").read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        sym,lei,country,parent,benchmark,name=line.split("|")
        rows.append(dict(id="esef-"+lei,lei=lei,code=sym,country=country,parent=parent,
            benchmark=benchmark,name=name,provider="esef"))
    return rows

def instances():
    return json.loads((ROOT/"config/sec-instances.json").read_bytes())

def get_filings(catalog):
    leids={r["lei"] for r in catalog}
    records=collections.defaultdict(list)
    for year in range(max(2020,START-1),END+1):
        path=CACHE/f"esef-index-{year}.json"
        try:
            index=json.loads(read_cached(path))
        except FileNotFoundError:
            continue
        map_lei={r["id"]:r["attributes"]["identifier"] for r in index["included"]}
        for filing in index["data"]:
            link=filing["relationships"]["entity"]["data"]["id"]
            lei=map_lei.get(link)
            attrs=filing["attributes"]
            if lei in leids and attrs.get("json_url") and attrs["period_end"][:4]==str(year):
                records[lei,attrs["period_end"]].append(attrs)
    picked=collections.defaultdict(list)
    for (lei,period),items in records.items():
        sel=min(items,key=lambda x:(x["error_count"] or 0,x["inconsistency_count"] or 0,
                                    0 if re.search(r"[-_.](EN|en)[-_.]",x["json_url"]) else 1))
        picked[lei].append(sel)
    return picked

def download_xbrl():
    jobs={}
    for year in range(max(2020,START-1),END+1):
        key=f"esef-index-{year}.json"
        jobs[key]=functools.partial(fetch,key,f"{BASE}/indexes/filings-{year}.json")
    for row in instances():
        key=f"sec-instance-{row['cik']}-{row['year']}.xml"
        jobs[key]=functools.partial(fetch,key,row["url"])
    errors=run_jobs(jobs)
    jobs={}
    for rows in get_filings(esef_catalog()).values():
        for row in rows:
            key=row["fxo_id"]+".json"
            jobs[key]=functools.partial(fetch,key,BASE+row["json_url"])
    errors+=run_jobs(jobs,limit=8)
    (CACHE/"xbrl-errors.json").write_text(json.dumps(errors,indent=2),encoding="utf-8")

def sec_supplement(cik,facts):
    for row in instances():
        if row["cik"]!=cik:
            continue
        path=CACHE/f"sec-instance-{cik}-{row['year']}.xml"
        if not path.exists():
            continue
        doc=ET.parse(path).getroot()
        contexts={}
        for ctx in doc.findall(X+"context"):
            if ctx.find(".//"+X+"segment") is not None or ctx.find(".//"+X+"scenario") is not None:
                continue
            period=ctx.find(X+"period")
            if period is None:
                continue
            end=period.findtext(X+"endDate") or period.findtext(X+"instant")
            start=period.findtext(X+"startDate")
            if not end:
                continue
            contexts[ctx.attrib["id"]]=(end,start)
        units={u.attrib["id"]:(u.findtext(X+"measure") or "").split(":")[-1] for u in doc.findall(X+"unit")}
        for fact in doc:
            ctx=contexts.get(fact.get("contextRef"))
            cur=units.get(fact.get("unitRef"))
            if not ctx or not cur or not fact.text:
                continue
            ns,local=fact.tag[1:].split("}",1)
            typ="ifrs-full" if "ifrs" in ns and "full" in ns else "us-gaap" if "us-gaap" in ns else None
            if not typ:
                continue
            try:
                v=float(fact.text)
            except ValueError:
                continue
            end,start=ctx
            if end != str(row["year"])+"-12-31":
                continue
            item=dict(end=end,val=v,form=row["form"],filed=row["filed"],accn=row["accession"])
            if start:
                item["start"]=start
            facts.setdefault(typ,{}).setdefault(local,{}).setdefault("units",{}).setdefault(cur,[]).append(item)

def esef_facts(company,files):
    from finance import DURATION_FIELDS, INSTANT_FIELDS, MONEY, num
    from fetch import CURRENCY
    result={}
    # A standardized element may be needed by multiple output fields.
    lookup=collections.defaultdict(list)
    for instant,fields in ((False,DURATION_FIELDS),(True,INSTANT_FIELDS)):
        for k,tags in fields.items():
            for rank,tag in enumerate(tags):
                lookup[tag].append((k,rank,instant))
    selection=collections.defaultdict(dict)
    for filing in files.get(company["lei"],[]):
        path=CACHE/(filing["fxo_id"]+".json")
        try:
            data=json.loads(read_cached(path))
        except FileNotFoundError:
            continue
        info=data.get("documentInfo",{})
        namespaces=info.get("namespaces",{})
        entity=company["lei"]
        for fact in data.get("facts",{}).values():
            dims=fact.get("dimensions",{})
            if set(dims)-{"concept","entity","period","unit","language"}:
                continue
            if dims.get("entity","").split(":")[-1]!=entity or ":" not in dims.get("concept",""):
                continue
            prefix,tag=dims["concept"].split(":",1)
            candidates=lookup.get(tag,[])
            if not candidates or "ifrs" not in namespaces.get(prefix,"").lower():
                continue
            cur=dims.get("unit","").split(":")[-1]
            if cur not in MONEY:
                continue
            period=dims.get("period","").split("/")
            if len(period) not in (1,2):
                continue
            try:
                end=dt.date.fromisoformat(period[-1][:10])-dt.timedelta(days=1)
                start=dt.date.fromisoformat(period[0][:10]) if len(period)==2 else None
                v=float(fact["value"])
            except (ValueError,TypeError,KeyError):
                continue
            if not (START-1<=end.year<=END) or not num(v):
                continue
            if start and not 350 <= (end-start).days+1 <= 382:
                continue
            ym=(end.year,end.isoformat(),cur)
            for key,rank,instant in candidates:
                if instant == bool(start):
                    continue
                decimals=fact.get("decimals")
                keyscore=(-rank,filing["period_end"],decimals if isinstance(decimals,int) else -20)
                old=selection[ym].get(key)
                if old and old[0]>=keyscore:
                    continue
                selection[ym][key]=(keyscore,[v,"ifrs-full:"+tag,BASE+"/filing/"+filing["fxo_id"]])
    for (year,end,cur),fields in selection.items():
        anchors=set(fields) & {"revenue","net","assets","equity","ebit"}
        if not anchors:
            continue
        score=(len(anchors),cur==CURRENCY.get(company["country"]),len(fields),end)
        if year in result and result[year]["score"]>=score:
            continue
        result[year]={"end":end,"currency":cur,"facts":{key:v for key,(_,v) in fields.items()},"score":score}
    for row in result.values():
        del row["score"]
    return result

if __name__=="__main__":
    download_xbrl()
