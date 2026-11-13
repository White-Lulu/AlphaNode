"""Check a built data snapshot for structural and numeric consistency."""
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import sys

def verify_financial_row(row, evidence, context):
    facts = {key:item[0] for key,item in evidence["facts"].items()}
    for key,value in row.items():
        assert math.isfinite(value),(context,key)
    def verify_metric(metric, formula):
        if metric in row:
            expected = formula()
            assert math.isclose(row[metric],expected,rel_tol=1e-8,abs_tol=1e-10),(context,metric,row[metric],expected)

    for key in ("revenue","net","assets","nopat"):
        verify_metric(key,lambda: facts[key]/facts["fx"])
    def gross():
        return facts["gross_profit"] if "gross_profit" in facts else facts["revenue"]-facts["cogs"]
    verify_metric("grossProfit",lambda: gross()/facts["fx"])
    verify_metric("grossMargin",lambda: gross()/facts["revenue"])
    verify_metric("netMargin",lambda: facts["net"]/facts["revenue"])
    verify_metric("operatingMargin",lambda: facts["ebit"]/facts["revenue"])
    verify_metric("roe",lambda: facts["net"]/facts["equity_avg"])
    verify_metric("roic",lambda: facts["nopat"]/facts["capital"])
    verify_metric("wacc",lambda: facts["wacc"])
    verify_metric("fcf",lambda: (facts["ocf"]-facts["capex"])/facts["fx"])
    verify_metric("dupontRoe",lambda: facts["net"]/facts["equity_avg"])
    verify_metric("equityMultiplier",lambda: facts["assets_avg"]/facts["equity_avg"])
    verify_metric("spread",lambda: facts["nopat"]/facts["capital"]-facts["wacc"])
    verify_metric("eva",lambda: (facts["nopat"]-facts["capital"]*facts["wacc"])/facts["fx"])
    if "nopat" in facts:
        assert math.isclose(facts["nopat"],facts["ebit"]*(1-facts["tax"]/facts["pretax"]),rel_tol=1e-11,abs_tol=1e-6),context
    for key in ("equity_avg","capital"):
        if key in facts:
            assert facts[key] > 0,(context,key)

def verify_aggregates(aggregates, ids):
    for record,scoped in aggregates.items():
        assert record in ids
        assert set(scoped) <= {"world","cn","ex"}
        for scope,years in scoped.items():
            years={int(year):row for year,row in years.items()}
            for year,row in years.items():
                prior=years.get(year-1,{})
                for mode,index in (("sum",0),("mean",1)):
                    for metric,value in row[mode].items():
                        numerator,denominator=row["operands"][metric][index]
                        expected=numerator if denominator is None else numerator/denominator
                        assert math.isclose(value,expected,rel_tol=1e-10,abs_tol=1e-10),(record,year,scope,metric)
                    for metric,modes in row.get("comparable",{}).items():
                        pair=modes[index]
                        if pair:
                            previous,current,count,revenue=pair
                            assert all(math.isfinite(v) for v in (previous,current,revenue)),(record,year,metric)
                            assert 0<count<=min(row["counts"][metric][index],prior["counts"][metric][index]),(record,year,metric)
        for year,tot in scoped["world"].items():
            for metric in ("revenue","net","assets"):
                if metric not in tot["sum"]:
                    continue
                parts=sum(scoped.get(scope,{}).get(year,{}).get("sum",{}).get(metric,0) for scope in ("cn","ex"))
                assert math.isclose(tot["sum"][metric],parts,rel_tol=1e-10,abs_tol=.1),(record,year,metric)

def verify_economic(meta, companies, snapshot):
    assert snapshot["version"]==1 and snapshot["builtFrom"]==meta["built"]
    taxonomy={node["id"]:node for node in snapshot["taxonomy"]}
    assert len(taxonomy)==len(snapshot["taxonomy"])
    assert sum(node["level"]==1 for node in taxonomy.values())==4
    for node in taxonomy.values():
        assert node["level"] in (1,2,3)
        if node["level"]==1:
            assert node["parent"] is None
        else:
            assert taxonomy[node["parent"]]["level"]==node["level"]-1
    assignments=snapshot["assignments"]
    assert set(assignments)=={company["id"] for company in companies}
    coverage=snapshot["coverage"]
    assert coverage["records"]==len(companies)
    members=defaultdict(list)
    for company in companies:
        classification=assignments[company["id"]]
        group=classification["group"]
        assert taxonomy[group]["level"]==3
        assert classification["basis"] in ("issuer","isic_group","isic_division")
        if canonical:=classification.get("canonical"):
            assert canonical!=company["id"] and not assignments[canonical].get("canonical")
            assert assignments[canonical]["group"]==group
            continue
        while group:
            members[group].append(company)
            group=taxonomy[group]["parent"]
    roots={code:len(members.get(code,())) for code,node in taxonomy.items() if node["level"]==1}
    assert roots==coverage["byRoot"] and sum(roots.values())==coverage["issuers"]
    assert coverage["groups"]==sum(taxonomy[code]["level"]==3 for code in members)
    assert coverage["byBasis"]==Counter(a["basis"] for a in assignments.values() if "canonical" not in a)
    assert set(snapshot["aggregates"])==set(members)
    verify_aggregates(snapshot["aggregates"],taxonomy)

    def history(row,key,year):
        values=row.get(key,{})
        return values.get(year,values.get(str(year),{}))

    def close(actual,expected,context,rel=1e-10):
        assert math.isclose(actual,expected,rel_tol=rel,abs_tol=.1),(context,actual,expected)

    for group, rows in members.items():
        scopes=snapshot["aggregates"][group]
        for scope in ("world","cn","ex"):
            selected=[company for company in rows if scope=="world" or company["region"]==scope]
            annual={int(year):cell for year,cell in scopes.get(scope,{}).items()}
            for year in range(meta["years"][0]-1,meta["years"][-1]+1):
                context=(group,scope,year)
                cell=annual.get(year,{})
                records=[(company,history(company,"finance",year)) for company in selected]
                for metric in ("revenue","net","assets","grossMargin","netMargin"):
                    observations=[(row[metric],row.get("revenue",0)) for company,row in records
                                  if metric in row and history(company,"qualityFlags",year).get(metric)!="grossConflict"]
                    if not observations:
                        assert metric not in cell.get("mean",{}),(context,metric)
                        continue
                    count=len(observations)
                    close(cell["mean"][metric],sum(value for value,_ in observations)/count,(context,metric,"mean"))
                    assert cell["counts"][metric][1]==count
                    if metric in ("grossMargin","netMargin"):
                        weighted=[(value,w) for value,w in observations if w>0]
                        assert cell["counts"][metric][0]==len(weighted)
                        if weighted:
                            average=sum(value*w for value,w in weighted)/sum(w for _,w in weighted)
                            assert math.isclose(cell["sum"][metric],average,rel_tol=1e-10,abs_tol=1e-12),(context,metric)
                        else:
                            assert metric not in cell["sum"],(context,metric)
                    else:
                        close(cell["sum"][metric],sum(value for value,_ in observations),(context,metric,"sum"))
                        assert cell["counts"][metric][0]==count
                if year not in meta["years"]:
                    continue
                pairs=[(previous["revenue"],row["revenue"]) for company,row in records
                       if "revenue" in row and not history(company,"comparisonNotes",year)
                       and "revenue" in (previous:=history(company,"finance",year-1))]
                measured=cell.get("comparable",{}).get("revenue")
                if not pairs:
                    assert measured is None,(context,"no paired revenue")
                    continue
                for index,divider in enumerate((1,len(pairs))):
                    before,after,count,_=measured[index]
                    assert count==len(pairs),(context,"paired revenue count")
                    close(before,sum(p[0] for p in pairs)/divider,(context,"paired prior revenue"),1e-9)
                    close(after,sum(p[1] for p in pairs)/divider,(context,"paired current revenue"),1e-9)

def verify(base):
    def load(name):
        return json.loads((base/(name+".json")).read_bytes())
    meta=load("meta")
    financial=load("financial")
    classes=meta["taxonomy"]
    ids={r["id"] for r in classes}
    assert len(ids)==len(classes)
    assert Counter(r["level"] for r in classes)=={1:21,2:88,3:238}
    assert all(r["parent"] is None or r["parent"] in ids for r in classes)
    companies=financial["companies"]
    assert len({r["id"] for r in companies})==len(companies)==meta["coverage"]["companies"]
    assert Counter(r["region"] for r in companies)==meta["coverage"]["regions"]
    assert len(meta["years"])==10 and meta["years"]==list(range(meta["years"][0],meta["years"][0]+10))
    assert all(r["parent"] in ids and (base/"evidence"/(r["id"]+".json")).is_file() for r in companies)
    for c in companies:
        audit=load("evidence/"+c["id"])
        for year,row in c["finance"].items():
            verify_financial_row(row,audit[year],(c["id"],year))
        logo=c.get("profile",{}).get("logo")
        if logo:
            assert (base/"logos"/Path(logo).name).is_file(),c["id"]
    verify_aggregates(financial["aggregates"],ids)
    for dataset in ("markets",*meta["stats"]):
        records=load(dataset)
        assert len({r["id"] for r in records})==len(records)
        for r in records:
            assert (base/"evidence"/(r["id"]+".json")).is_file()
            for scope,rows in r["values"].items():
                assert scope in ("cn","ex","world")
                for metrics in rows.values():
                    for metric,value in metrics.items():
                        assert metric in meta["metrics"] and math.isfinite(value)
                        if metric in ("penetration","stockPenetration","marketShare"):
                            assert 0<=value<=1
                        if metric=="hhi":
                            assert 0<=value<=10000
    if (base/"economic-functions.json").is_file():
        verify_economic(meta,companies,load("economic-functions"))
    return meta["coverage"]

if __name__=="__main__":
    path=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/"dist/data"
    report=verify(path)
    print(f"Validated {report['companies']} issuers, {report['companyYears']} annual observations and the market/industry series.")
