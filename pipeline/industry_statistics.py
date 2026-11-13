"""Publish official industry series with a separate statistical universe for each source."""
from collections import defaultdict
import csv
import re

import openpyxl
from fetch import CACHE, ROOT, START, END, AMA, UNIDO
from finance import num, read
from fetch_industry import INDSTAT
from fetch_regional import NBS_BASE, NBS, EURO, EU_CATALOG
from markets import market, put

ISIC_HOME = "https://unstats.un.org/unsd/classifications/Econ/isic"
UNIDO_PAGE = "https://stat.unido.org/data/table?dataset=indstat-revision-4"
AMA_PAGE = "https://unstats.un.org/unsd/snaama/downloads"
EU_PAGE = "https://ec.europa.eu/eurostat/databrowser/view/"

def taxonomy():
    result = []
    chinese = dict(l.split(" ",1) for l in (ROOT/"config/isic-zh.txt").read_text(encoding="utf-8").splitlines() if l)
    section = ""
    lines = (CACHE/"isic.csv").read_text(encoding="utf-8-sig").splitlines()
    for r in csv.DictReader(lines):
        code = r["Code"]
        if len(code) > 3:
            continue
        if len(code)==1:
            section = code
        result.append(dict(id=code,code=code,name=chinese.get(code,r["Description"]),
            en=r["Description"],level=len(code),parent=section if len(code)==2 else code[:2] if len(code)==3 else None))
    return result

def national_accounts():
    path = CACHE/"ama.xlsx"
    if not path.exists():
        return []
    names = {
        "Gross Domestic Product (GDP)":("gdp","国内生产总值",None),
        "Agriculture, hunting, forestry, fishing (ISIC A-B)":("a","农林牧渔增加值","A"),
        "Mining, Manufacturing, Utilities (ISIC C-E)":("industry","采矿、制造与公用事业增加值",None),
        "Manufacturing (ISIC D)":("c","制造业增加值","C"),
        "Construction (ISIC F)":("f","建筑业增加值","F"),
        "Wholesale, retail trade, restaurants and hotels (ISIC G-H)":("gi","批零、住宿和餐饮增加值",None),
        "Transport, storage and communication (ISIC I)":("hj","运输、仓储和通信增加值",None),
        "Other Activities (ISIC J-P)":("other","其他活动增加值",None),
        "Total Value Added":("gva","全经济增加值",None)
    }
    workbook = openpyxl.load_workbook(path,read_only=True,data_only=True)
    iterator = workbook.worksheets[0].values
    next(iterator); next(iterator)
    years = next(iterator)
    inputs = defaultdict(dict)
    for row in iterator:
        cid,name,indicator = row[:3]
        if cid not in (1,156) or indicator not in names:
            continue
        for i,y in enumerate(years):
            if isinstance(y,int) and START-1<=y<=END and num(row[i]):
                inputs[indicator,y][cid] = row[i]
    workbook.close()
    out=[]
    for indicator,(code,name,parent) in names.items():
        record = market("ama-"+code,name,parent,"联合国统计司 AMA",
            "国民账户现价美元，原始系列采用较早 ISIC 分组，行业映射以标签范围为准。世界与中国大陆为 UNSD 独立发布系列，中国以外为差额。","USD")
        for y in range(START-1,END+1):
            raw = inputs[indicator,y]
            for scope,c in (("cn",156),("world",1),("ex",None)):
                value = raw.get(c) if c else raw[1]-raw[156] if 1 in raw and 156 in raw else None
                if value is None:
                    continue
                denom = inputs["Total Value Added",y]
                total = denom.get(c) if c else denom[1]-denom[156] if 1 in denom and 156 in denom else None
                values = {"gdp" if code=="gdp" else "valueAdded":value}
                if total and code not in ("gdp","gva"):
                    values["vaShare"] = value/total
                detail=dict(inputs={"统计项目":indicator,"全球原值":raw.get(1),"中国大陆原值":raw.get(156),"所选范围全部增加值":total},
                            links=[AMA,AMA_PAGE],formula="范围内增加值占比 = 行业增加值 ÷ 全经济增加值。中国以外 = 世界 − 中国大陆。")
                put(record,scope,y,values,detail)
        out.append(record)
    return out

def unido(nodes):
    meta = read("unido-meta.json",{}) or {}
    country = {c["c"]:c["iso3"] for c in meta.get("countries",[]) if c.get("iso3")}
    values = defaultdict(dict)
    measures = {"14":"output","20":"valueAdded","04":"employment"}
    for file in CACHE.glob("indstat-*.json"):
        _,cc,var = file.stem.split("-")
        if cc not in country or var not in measures:
            continue
        for r in read(file.name,{}).get("data",[]):
            # The combination qualifier can mean multiple classes were reported together.
            if r.get("c") and r["c"] != r["a"]:
                continue
            v = r.get("v" if var=="04" else "u")
            if num(v) and v>=0:
                values[r["a"],int(r["p"]),var][country[cc]] = v
    used = {k[0] for k in values}
    out = []
    for code in nodes.keys() & used:
        record = market("unido-"+code,nodes[code]["name"],code,"UNIDO INDSTAT",
            "制造业和采矿业调查。金额为 UNIDO 换算现价美元。全球与中国以外为可用报告经济体加总，覆盖随年份及指标变化。带合并分类标记的记录排除。","USD")
        for y in range(START-1,END+1):
            for scope in record["scopes"]:
                vals, detail = {}, {}
                for var,k in measures.items():
                    raw = values[code,y,var]
                    selected = {iso:v for iso,v in raw.items() if scope=="world" or ((iso=="CHN")==(scope=="cn"))}
                    if selected:
                        vals[k] = sum(selected.values())
                        detail[k] = selected
                if vals:
                    put(record,scope,y,vals,dict(inputs={"各指标覆盖经济体数":{k:len(v) for k,v in detail.items()},
                       "各经济体数值":detail},links=[UNIDO_PAGE,INDSTAT,"https://stat.unido.org/unido-statistics-portal-api"],
                       formula="按活动、年份、指标选取报告经济体的直接观测值，金额列加总各经济体的现价美元值。"))
        out.append(record)
    return out

def decode_euro(obj):
    sizes, dims = obj["size"], obj["id"]
    groups = [None]*len(dims)
    for i,key in enumerate(dims):
        ix = obj["dimension"][key]["category"]["index"]
        groups[i] = [None]*sizes[i]
        for code,j in ix.items():
            groups[i][j] = code
    for index,value in obj.get("value",{}).items():
        if not num(value):
            continue
        n=int(index); fields={}
        for i in range(len(dims)-1,-1,-1):
            n,pos=divmod(n,sizes[i])
            fields[dims[i]]=groups[i][pos]
        yield fields,value

def eurostat(nodes):
    aliases = {
        "NETTUR_MEUR":"officialRevenue","V12110":"officialRevenue","GOS_MEUR":"grossSurplus","V12170":"grossSurplus",
        "AV_MEUR":"valueAdded","V12150":"valueAdded","ENT_NR":"enterprises","V11110":"enterprises",
        "VAL_OUT_MEUR":"output","V12120":"output"
    }
    records={}
    for dataset in EU_CATALOG:
        data = read(f"eu-{dataset}.json",{})
        if not data or "id" not in data:
            continue
        names = data["dimension"]["nace_r2"]["category"]["label"]
        for dims,v in decode_euro(data):
            year = int(dims["time"])
            nace = dims["nace_r2"]
            if not re.fullmatch(r"[A-U](\d{2,3})?",nace) or not START-1<=year<=END:
                continue
            stat = aliases.get(dims.get("indic_sbs",dims.get("indic_sb")))
            if not stat:
                continue
            code = nace[1:] or nace
            parent = code if code in nodes else None
            if nace not in records:
                records[nace] = market("euro-"+nace,(nodes[code]["name"] if parent and len(code)<3 else names[nace]),
                    parent,"Eurostat SBS · 欧盟 27 国",
                    "NACE Rev.2 原始代码及范围，按代码邻近位置挂接 ISIC 以便浏览。EU27_2020 汇总，2021 年起执行欧洲商业统计新标准。金额单位为欧元。","EUR",("ex","world"))
            row=records[nace]
            for scope in row["scopes"]:
                row["values"][scope].setdefault(year,{})[stat] = v if stat=="enterprises" else v*1e6
                row["audit"][scope].setdefault(year,dict(inputs={"NACE Rev.2":nace,"原始名称":names[nace],"经济体":"EU27_2020","数据表":dataset},
                    links=[EU_PAGE+dataset+"/default/table", EURO+dataset+"?geo=EU27_2020"],
                    formula="统计局发布值。金额从百万欧元乘以 1,000,000，营业盈余率 = 营业盈余 ÷ 净营业额。"))
    for r in records.values():
        for scoped in r["values"].values():
            for vals in scoped.values():
                if vals.get("officialRevenue",0)>0 and "grossSurplus" in vals:
                    vals["surplusMargin"] = vals["grossSurplus"]/vals["officialRevenue"]
    return list(records.values())

NBS_MAP = [
    ("煤炭开采和洗选业","05"),("石油和天然气开采业","06"),("黑色金属矿采选业","071"),("有色金属矿采选业","072"),
    ("非金属矿采选业","08"),("开采辅助活动","09"),("其他采矿业","089"),("农副食品加工业","10"),
    ("食品制造业","10"),("酒、饮料和精制茶制造业","11"),("烟草制品业","12"),("纺织业","13"),
    ("纺织服装、服饰业","14"),("皮革、毛皮、羽毛及其制品和制鞋业","15"),("木材加工和木、竹、藤、棕、草制品业","16"),
    ("家具制造业","31"),("造纸和纸制品业","17"),("印刷和记录媒介复制业","18"),("文教、工美、体育和娱乐用品制造业","32"),
    ("石油、煤炭及其他燃料加工业","19"),("化学原料和化学制品制造业","20"),("医药制造业","21"),("化学纤维制造业","203"),
    ("橡胶和塑料制品业","22"),("非金属矿物制品业","23"),("黑色金属冶炼和压延加工业","241"),("有色金属冶炼和压延加工业","242"),
    ("金属制品业","25"),("通用设备制造业","281"),("专用设备制造业","282"),("汽车制造业","29"),("铁路、船舶、航空航天和其他运输设备制造业","30"),
    ("电气机械和器材制造业","27"),("计算机、通信和其他电子设备制造业","26"),("仪器仪表制造业","265"),("其他制造业","32"),
    ("废弃资源综合利用业","383"),("金属制品、机械和设备修理业","33"),("电力、热力生产和供应业","351"),("燃气生产和供应业","352"),("水的生产和供应业","36")
]
NBS_MAP=dict(NBS_MAP)
NBS_MAP.update({"总计":None,"开采专业及辅助性活动":"09","石油加工、炼焦和核燃料加工业":"19"})

def nbs_stats():
    import json
    path=ROOT/"config/nbs-announcements.json"
    if not path.exists():
        return []
    records={}
    datasets=json.loads(path.read_text(encoding="utf-8"))
    aliases = {"开采辅助活动":"开采专业及辅助性活动","石油加工、炼焦和核燃料加工业":"石油、煤炭及其他燃料加工业"}
    for y,rows in datasets.items():
        year=int(y)
        for raw_name,*vals in rows:
            name=aliases.get(raw_name,raw_name)
            if name not in NBS_MAP:
                continue
            parent=NBS_MAP[name]
            if name not in records:
                records[name]=market("nbs-"+str(len(records)),name if parent else "规模以上工业企业合计",parent,
                    "中国国家统计局 · 规模以上工业","按中国国民经济行业分类发布的年末公告表 3。映射到相关 ISIC 节点供导航。年度调查范围调整，官方同比基于可比标准。","CNY",("cn","world"))
            def parse(s):
                try:
                    return float(s)
                except ValueError:
                    return None
            revenue=parse(vals[0])
            profit=parse(vals[2 if year==2016 else 4])
            cost=parse(vals[2]) if year>=2019 else None
            if year in (2017,2018) and len(vals)==7:
                cost=parse(vals[6])
            data={}
            if revenue is not None:
                data["officialRevenue"]=revenue*1e8
            if cost is not None:
                data["officialCost"]=cost*1e8
            if profit is not None:
                data["pretaxProfit"]=profit*1e8
            if revenue and profit is not None:
                data["pretaxMargin"]=profit/revenue
            if revenue and cost is not None:
                data["grossMargin"]=1-cost/revenue
            if parse(vals[1]) is not None:
                data["officialGrowth"]=parse(vals[1])/100
            url=NBS_BASE+NBS[year]
            if year==2025:
                url=NBS_BASE+"/xxgk/sjfb/zxfb2020/202601/t20260127_1962382.html"
            if year==2017:
                url=NBS_BASE+"/english/PressRelease/201801/t20180129_1578648.html"
            if year==2018:
                url=NBS_BASE+"/xxgk/sjfb/zxfb2020/201901/t20190128_1768279.html"
            for scope in records[name]["scopes"]:
                put(records[name],scope,year,data,dict(inputs={
                    "原表行业":raw_name,"金额说明":"主营业务收入" if year==2016 else "营业收入",
                    "收入（亿元）":revenue,"营业成本（亿元）":cost,"利润总额（亿元）":profit,"收入官方同比（%）":parse(vals[1])
                },links=[url],formula="收入、成本、利润总额由亿元乘以 1 亿换算人民币。税前利润率 = 利润总额 ÷ 收入。毛利率 =（收入 − 营业成本）÷ 收入。"))
    return list(records.values())
