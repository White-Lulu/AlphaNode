"""Build directory, benchmark and SQL artifacts from pinned source data."""
import json
import math
from pathlib import Path
import re
import shutil
from tempfile import TemporaryDirectory

import duckdb
import xlrd
import polars as pl

import upstream_code
from financedatabase import listings_model

from fetch import CACHE, ROOT, END
from research_sources import FDB_REPO, FDB_PARQUET, REGION_EN, NYU_ARCHIVE, NYU_CURRENT, source_plan

DEST=ROOT/"dist/research"
WAREHOUSE=ROOT/"warehouse"
BASE=ROOT/"dist/data"

BENCH_COLUMNS = {
    "eva":{"roe":"ROE","roic":"ROC","spread":"(ROC - WACC)","eva":"EVA"},
    "margin":{"grossMargin":"Gross Margin","netMargin":"Net Margin",
              "operatingMargin":"Pre-tax Unadjusted Operating Margin","ebitdaMargin":"EBITDA/Sales"},
    "wacc":{"wacc":"Cost of Capital","firms":"Number of Firms"}
}
BENCH_METRICS=["firms","grossMargin","netMargin","operatingMargin","ebitdaMargin","roe","roic","wacc","spread","eva"]
ECONOMIES = {"CN":"China","US":"United States","GB":"United Kingdom","DE":"Germany","JP":"Japan","KR":"South Korea",
    "HK":"Hong Kong","MO":"Macau","TW":"Taiwan","BR":"Brazil","NL":"Netherlands","FR":"France","NO":"Norway",
    "CH":"Switzerland","IN":"India","CA":"Canada","ES":"Spain","IT":"Italy","IE":"Ireland","BE":"Belgium","IL":"Israel",
    "DK":"Denmark","SE":"Sweden","FI":"Finland","CO":"Colombia","AR":"Argentina","AU":"Australia","ZA":"South Africa",
    "CL":"Chile","LU":"Luxembourg","MX":"Mexico","UY":"Uruguay","SG":"Singapore","GR":"Greece","CY":"Cyprus",
    "PA":"Panama","PH":"Philippines","ID":"Indonesia","PE":"Peru"}

def read(path):
    return json.loads(path.read_bytes())

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    pending=path.with_suffix(path.suffix+".tmp")
    pending.write_text(json.dumps(value,ensure_ascii=False,separators=(",",":"),allow_nan=False),encoding="utf8")
    pending.replace(path)

def normalized(header):
    return re.sub(r"\s+"," ",str(header)).strip().lower()

def records_from_workbook(path,dataset,year):
    workbook=xlrd.open_workbook(path)
    header=None
    for sheet in workbook.sheets():
        for i in range(min(45,sheet.nrows)):
            columns={normalized(v):j for j,v in enumerate(sheet.row_values(i)) if v}
            if "industry name" in columns and "number of firms" in columns:
                header=(sheet,i,columns)
                break
        if header:
            break
    if not header:
        return
    sheet, first, columns=header
    stamped=None
    if normalized(sheet.cell_value(0,0)).startswith("date updated"):
        stamp=sheet.cell_value(0,1)
        if isinstance(stamp,(int,float)) and stamp>36500:
            stamped=xlrd.xldate_as_datetime(stamp,workbook.datemode).date()
            if stamped.year!=year+1:
                return
    elif year==END:
        # The latest dataset must have a source date to distinguish a prior-year mirror.
        return
    targets={}
    for metric,caption in BENCH_COLUMNS[dataset].items():
        name=normalized(caption)
        index=columns.get(name)
        if index is None and metric=="eva":
            index=next((i for h,i in columns.items() if h.startswith("eva (")),None)
        if index is not None:
            targets[metric]=index
    for i in range(first+1,sheet.nrows):
        row=sheet.row_values(i)
        name=row[columns["industry name"]]
        n=row[columns["number of firms"]]
        if not isinstance(name,str) or not name.strip() or not isinstance(n,(int,float)) or n<=0:
            continue
        if name.casefold().startswith(("total market","tiotal market")):
            continue
        out={}
        for metric,j in targets.items():
            val=row[j]
            if isinstance(val,(int,float)) and math.isfinite(val):
                out[metric]=val*1e6 if metric=="eva" else val
        if out:
            yield name.strip(),out,stamped.isoformat() if stamped else None

def benchmarks(destination):
    localnames=read(ROOT/"config/benchmark-names.json")
    records={}
    source_rows={}
    missing=[]
    flat=[]
    for region,year,kind,filename,url in source_plan():
        path=CACHE/filename
        if not path.exists():
            missing.append([region,year,kind])
            continue
        loaded=False
        for label,metrics,stamp in records_from_workbook(path,kind,year):
            loaded=True
            source_rows.setdefault(region,{}).setdefault(year,{})[kind]={"url":url,"date":stamp}
            key=re.sub(r"[^a-z0-9]+","-",label.lower()).strip("-")
            row=records.setdefault(key,dict(id="nyu-"+key,name=localnames.get(label,label),en=label,
                source="NYU Damodaran",currency="USD",kind="benchmark",values={}))
            dest=row["values"].setdefault(region,{}).setdefault(year,{})
            dest.update(metrics)
            for metric,value in metrics.items():
                flat.append((row["id"],label,region,year,metric,value,url,stamp))
        if not loaded:
            missing.append([region,year,kind])
    for row in records.values():
        row["scopes"]=list(row["values"])
    write(destination/"benchmark.json",{"rows":list(records.values()),"columns":BENCH_METRICS,"sources":source_rows,
        "regions":REGION_EN,"archive":NYU_ARCHIVE,"current":NYU_CURRENT,"missing":missing})
    return flat

def directory(conn,companies,destination,bulk):
    source=CACHE/"fdb-equities.parquet"
    if not source.exists():
        raise FileNotFoundError("FinanceDatabase Parquet file is missing. Run pipeline/research_sources.py")
    conn.execute("""CREATE TABLE security_directory AS
        SELECT symbol, name, country, sector, industry_group, industry, exchange, mic, currency,
            isin, delisted, ''::VARCHAR AS issuer_id, NULL::BOOLEAN AS primary_listing
        FROM read_parquet(?) WHERE symbol IS NOT NULL""",[str(source)])
    lazy=pl.scan_parquet(source)
    ranks=listings_model.get_listing_ranks(lazy,listings_model.get_main_venues(lazy))
    conn.execute("CREATE TEMP TABLE listing_primary(symbol VARCHAR, primary_listing BOOLEAN)")
    bulk("listing_primary",ranks.select("symbol","primary_listing").iter_rows())
    conn.execute("""UPDATE security_directory AS d SET primary_listing=p.primary_listing
        FROM listing_primary p WHERE d.symbol=p.symbol""")
    bindings=[]
    translated={}
    for c in companies:
        code=c["code"].upper()
        market=code.removesuffix(".SH")+".SS" if code.endswith(".SH") else code
        economy=ECONOMIES.get(c["country"])
        if economy:
            bindings.append((c["id"],market,economy))
    conn.execute("CREATE TEMP TABLE mappings(id VARCHAR,symbol VARCHAR,country VARCHAR)")
    conn.executemany("INSERT INTO mappings VALUES (?,?,?)",bindings)
    conn.execute("""UPDATE security_directory AS d SET issuer_id=m.id
        FROM (SELECT symbol,country,min(id) AS id FROM mappings GROUP BY ALL HAVING count(*)=1) m
        WHERE upper(d.symbol)=m.symbol AND d.country=m.country AND d.delisted IS NOT TRUE""")
    for id,name in conn.execute("SELECT issuer_id,name FROM security_directory WHERE issuer_id<>'' AND name IS NOT NULL").fetchall():
        translated[id]=name
    options={k:[str(a[0]) for a in conn.execute(
        "SELECT DISTINCT "+k+" FROM security_directory WHERE "+k+" IS NOT NULL ORDER BY 1").fetchall()]
        for k in ("country","sector","industry","exchange")}
    country={v:i for i,v in enumerate(options["country"])}
    sectors={v:i for i,v in enumerate(options["sector"])}
    industry={v:i for i,v in enumerate(options["industry"])}
    exchanges={v:i for i,v in enumerate(options["exchange"])}
    rows=conn.execute("""SELECT symbol,name,country,sector,industry,exchange,isin,delisted,issuer_id,industry_group,primary_listing
        FROM security_directory ORDER BY issuer_id='',delisted NULLS LAST,symbol""").fetchall()
    indexed=[[sym,name,country.get(co,-1),sectors.get(se,-1),industry.get(ind,-1),exchanges.get(ex,-1),isin,
        de,issuer or None,grp,primary] for sym,name,co,se,ind,ex,isin,de,issuer,grp,primary in rows]
    write(destination/"directory.json",{"rows":indexed,"options":options,"repository":FDB_REPO,
        "source":FDB_PARQUET,"count":len(rows),"linked":len(translated)})
    write(destination/"index.json",{"listingCount":len(rows),"directoryCountries":len(country),"linked":len(translated),
        "englishCompanyNames":translated,"benchmarkCount":len(read(destination/"benchmark.json")["rows"])})
    shutil.copyfile(CACHE/"fdb-LICENSE",destination/"FinanceDatabase-LICENSE.txt")
    return len(rows),len(country),len(translated)

def build_warehouse(staging):
    companies=read(BASE/"financial.json")
    coverage=read(BASE/"meta.json")
    flat=benchmarks(staging)
    with duckdb.connect(str(staging/"industrylab.duckdb")) as conn:
        conn.execute("""CREATE TABLE issuer(id VARCHAR PRIMARY KEY, ticker VARCHAR, name VARCHAR,
                        economy VARCHAR, isic VARCHAR, provider VARCHAR, benchmark VARCHAR)""")
        conn.executemany("INSERT INTO issuer VALUES (?,?,?,?,?,?,?)",[
            (r["id"],r["code"],r["name"],r["country"],r["parent"],r["provider"],r["benchmark"])
            for r in companies["companies"]])
        conn.execute("""CREATE TABLE taxonomy(code VARCHAR PRIMARY KEY, parent VARCHAR, level INTEGER,
                        label_zh VARCHAR,label_en VARCHAR)""")
        conn.executemany("INSERT INTO taxonomy VALUES (?,?,?,?,?)",[
            (r["id"],r["parent"],r["level"],r["name"],r["en"]) for r in coverage["taxonomy"]])
        conn.execute("""CREATE TABLE issuer_metric(issuer_id VARCHAR, fiscal_year INTEGER, metric VARCHAR,
            value DOUBLE, evidence VARCHAR, PRIMARY KEY (issuer_id,fiscal_year,metric))""")
        company_rows=[(c["id"],int(y),metric,value,"data/evidence/"+c["id"]+".json")
            for c in companies["companies"] for y,values in c["finance"].items() for metric,value in values.items()]
        # Import through a batch CSV relation to avoid one DuckDB transaction per cell.
        import csv
        def bulk(table,records):
            tmp=staging/(table+"-import.csv")
            try:
                with tmp.open("w",newline="",encoding="utf8") as stream:
                    csv.writer(stream).writerows(records)
                conn.execute(f"COPY {table} FROM ? (FORMAT csv,HEADER false)",[str(tmp)])
            finally:
                if tmp.is_file():
                    tmp.unlink()
        bulk("issuer_metric",company_rows)
        conn.execute("""CREATE TABLE industry_sample(isic VARCHAR, scope VARCHAR, fiscal_year INTEGER, method VARCHAR,
            metric VARCHAR, value DOUBLE, count INTEGER)""")
        bulk("industry_sample",[
            (code,scope,int(y),method,m,v,cell["counts"][m][i])
            for code,groups in companies["aggregates"].items()
            for scope,annual in groups.items() for y,cell in annual.items()
            for i,method in enumerate(("sum","mean")) for m,v in cell[method].items()
        ])
        conn.execute("""CREATE TABLE published_series(dataset VARCHAR, series_id VARCHAR, name VARCHAR, isic VARCHAR,
            scope VARCHAR, year INTEGER, metric VARCHAR, value DOUBLE, currency VARCHAR, evidence VARCHAR)""")
        bulk("published_series",[
            (dataset,r["id"],r["name"],r["parent"],scope,int(year),metric,value,r.get("currency"),"data/evidence/"+r["id"]+".json")
            for dataset in (*coverage["stats"],"markets") for r in read(BASE/(dataset+".json"))
            for scope,annual in r["values"].items() for year,vals in annual.items() for metric,value in vals.items()
        ])
        conn.execute("""CREATE TABLE industry_benchmark(series_id VARCHAR, name VARCHAR, region VARCHAR,
            reference_year INTEGER, metric VARCHAR, value DOUBLE, source_url VARCHAR, published_on DATE)""")
        bulk("industry_benchmark",flat)
        entries,economies,links=directory(conn,companies["companies"],staging,bulk)
        conn.execute("""CREATE VIEW financial_screen AS SELECT i.ticker,i.name,i.economy,i.isic,i.provider,
                         m.fiscal_year,m.metric,m.value,m.evidence FROM issuer i JOIN issuer_metric m ON i.id=m.issuer_id""")
        for table in ("issuer_metric","industry_benchmark"):
            parquet=staging/(table+".parquet")
            conn.execute(f"COPY {table} TO ? (FORMAT parquet, COMPRESSION zstd)",[str(parquet)])
        conn.execute("CHECKPOINT")
    return (entries,economies,links,len(company_rows),len(flat))

def write_warehouse():
    DEST.mkdir(parents=True,exist_ok=True)
    WAREHOUSE.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(prefix=".build-",dir=WAREHOUSE) as pending:
        staging=Path(pending)
        entries,economies,links,observations,benchmark_values=build_warehouse(staging)
        for name in ("industrylab.duckdb","issuer_metric.parquet","industry_benchmark.parquet"):
            (staging/name).replace(WAREHOUSE/name)
        for name in ("directory.json","benchmark.json","index.json","FinanceDatabase-LICENSE.txt"):
            (staging/name).replace(DEST/name)
    print(f"Directory: {entries} listings / {economies} economies / {links} issuer matches. "
        f"Warehouse: {observations} issuer metrics; {benchmark_values} benchmark values.")

if __name__=="__main__":
    write_warehouse()
