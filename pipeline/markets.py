"""Defined product markets with measurable denominators and traceable estimates."""
from collections import defaultdict
import csv
from datetime import date
import io
import math
import re
import zipfile

import openpyxl
from fetch import CACHE, START, END
from fetch_industry import eia_url

IEA_PAGE = "https://www.iea.org/data-and-statistics/data-tools/global-ev-data-explorer"
EIA_PAGE = "https://www.eia.gov/electricity/data/eia861/"
EIA_PRICE = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMM_EPMR_PTE_NUS_DPG&f=M"
EIA_VOLUME = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=MGFUPUS2&f=M"
CPI_PAGE = "https://fred.stlouisfed.org/series/CPIAUCSL"

def market(id, name, parent, source, note, currency=None, scopes=("cn","ex","world")):
    return dict(id=id,name=name,parent=parent,source=source,note=note,currency=currency,
        scopes=scopes,values={scope:{} for scope in scopes},audit={scope:{} for scope in scopes})

def put(row,scope,year,metrics,details):
    row["values"][scope][year] = metrics
    row["audit"][scope][year] = details

def ev():
    path = CACHE / "iea-ev.csv"
    if not path.exists():
        return []
    data = defaultdict(dict)
    keys = ("EV sales","EV sales share","EV stock","EV stock share")
    for r in csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines()):
        if r["region"] not in ("China","World") or r["powertrain"] != "EV" or r["parameter"] not in keys:
            continue
        data[r["mode"],int(r["year"]),r["region"]][r["parameter"]] = float(r["value"])
    rows = []
    modes = {"Cars":"乘用车","Vans":"轻型商用车","Buses":"巴士","Trucks":"卡车",
             "Two- and three-wheelers":"两轮和三轮车"}
    for mode,name in modes.items():
        row = market("ev-"+mode,"电动"+name,"291" if mode in ("Cars","Vans","Buses","Trucks") else "309",
            "IEA 全球电动汽车展望 2026",
            "按销售地统计，EV 含纯电和插电式混动。中国使用 IEA 的 China 序列。中国以外由同年全球扣除中国，渗透率因公开数据四舍五入而为近似值。")
        rows.append(row)
        for y in range(START-1,END+1):
            china,world = (data[mode,y,region] for region in ("China","World"))
            for scope,d in (("cn",china),("world",world),("ex",{})):
                values, inputs = {}, {}
                for v_key,s_key,v_id,s_id in [
                    ("EV sales","EV sales share","evSales","penetration"),
                    ("EV stock","EV stock share","evStock","stockPenetration")
                ]:
                    if scope != "ex":
                        if v_key in d:
                            values[v_id] = d[v_key]
                        if s_key in d and 0 <= d[s_key] <= 100:
                            values[s_id] = d[s_key]/100
                        inputs[v_key] = d.get(v_key)
                        inputs[s_key+"（%）"] = d.get(s_key)
                    elif all(v_key in a for a in (china,world)):
                        cv,wv = china[v_key],world[v_key]
                        if wv < cv:
                            continue
                        values[v_id] = wv-cv
                        inputs.update({f"全球 {v_key}":wv,f"中国 {v_key}":cv})
                        cp,wp = china.get(s_key,0)/100,world.get(s_key,0)/100
                        if cp>0 and wp>0 and wv/wp-cv/cp > 0:
                            total = wv/wp-cv/cp
                            ratio = (wv-cv)/total
                            if 0 <= ratio <= 1:
                                values[s_id] = ratio
                                inputs.update({f"全球 {s_key}（%）":wp*100,f"中国 {s_key}（%）":cp*100,
                                    f"全球扣除中国后的全部{'销量' if v_id=='evSales' else '保有量'}":total})
                if values:
                    put(row,scope,y,values,dict(inputs=inputs,links=[IEA_PAGE],
                        formula="渗透率 =（全球 EV 数量 − 中国 EV 数量）÷（全球 EV 数量 ÷ 全球渗透率 − 中国 EV 数量 ÷ 中国渗透率）"
                        if scope=="ex" else "IEA 直接发布的历史销量、保有量及其占同类新车或在用车总量的比例"))
    return rows

STATES = {"TX":"得克萨斯州","CA":"加利福尼亚州","NY":"纽约州","IL":"伊利诺伊州","FL":"佛罗里达州",
          "OH":"俄亥俄州","PA":"宾夕法尼亚州","MI":"密歇根州","VA":"弗吉尼亚州","GA":"佐治亚州"}

def xlsx_rows(archive,pattern):
    name = next((n for n in archive.namelist() if re.search(pattern,n,re.I)),None)
    if name is None:
        return []
    wb = openpyxl.load_workbook(io.BytesIO(archive.read(name)),read_only=True,data_only=True)
    try:
        return list(wb.worksheets[0].values)
    finally:
        wb.close()

def eia_retail():
    utilities = defaultdict(dict)
    adj = defaultdict(float)
    for y in range(START-1,END+1):
        path = CACHE / f"eia-{y}.zip"
        if not path.exists():
            continue
        with zipfile.ZipFile(path) as z:
            rows = xlsx_rows(z,rf"Sales_Ult_Cust_{y}\.xlsx$")
            if not rows:
                continue
            for r in rows[3:]:
                if r[0]!=y or not isinstance(r[1],int) or r[4] not in ("Bundled","Energy") or not isinstance(r[-2],(int,float)):
                    continue
                uid, name, state, qty = r[1],r[2],r[6],r[-2]
                if uid == 99999:
                    adj[y,state] += qty
                    continue
                previous = utilities[y,state].get(uid,(name,0))
                utilities[y,state][uid] = (name,previous[1]+qty)
            for r in xlsx_rows(z,rf"Short_Form_{y}\.xlsx$")[1:]:
                if r[0] == y and isinstance(r[1],int) and isinstance(r[7],(int,float)) and r[7]>0:
                    utilities[y,r[4]].setdefault(r[1],(r[2],r[7]))
    out = []
    note = "EIA-861 州内终端售电。以报表公用事业 ID 为单位，汇总 Bundled 和 Energy 销量，排除可能重复的 Delivery。独立列示未分配调整量，HHI 基于可归属售电量。州界用于比较统计。"
    for state,name in STATES.items():
        row = market("power-"+state,name+"零售电力","351","美国 EIA-861",note,scopes=("ex","world"))
        out.append(row)
        candidates = set()
        for y in range(START-1,END+1):
            positive = {uid:(n,q) for uid,(n,q) in utilities[y,state].items() if q > 0}
            known = sum(q for n,q in positive.values())
            total = known + adj[y,state]
            if known <= 0 or total <= 0:
                continue
            ranked = sorted(positive.items(),key=lambda a:a[1][1],reverse=True)
            if y==END:
                candidates.update(uid for uid,_ in ranked[:6]+ranked[len(ranked)//2:len(ranked)//2+2]+ranked[-2:])
            sum2 = sum(q*q for n,q in positive.values())
            values = dict(hhi=10000*sum2/known**2,retailVolume=total,
                          assignedCoverage=known/total,providers=len(positive))
            info = dict(inputs={"可归属售电量 MWh":known,"州级调整 MWh":adj[y,state],
                "报表 ID 销量平方和":sum2,"纳入的售电 ID":len(positive),
                "前五名":", ".join(n for uid,(n,q) in ranked[:5]),
                "可归属报表 ID 销量 MWh":{str(uid):q for uid,(n,q) in ranked}},
                links=[eia_url(y),EIA_PAGE], formula="HHI = 10000 × Σ(各 ID 售电量 ÷ 可归属售电量)²")
            for scope in row["scopes"]:
                put(row,scope,y,values,info)
        for uid in sorted(candidates):
            provider_name = utilities[END,state][uid][0]
            child = market(f"power-{state}-{uid}",provider_name,row["id"],"美国 EIA-861",
                f"{name}内按报表 ID 统计，市场分母含 EIA 调整量。",scopes=("ex","world"))
            out.append(child)
            for y in range(START-1,END+1):
                q = utilities[y,state].get(uid,(None,0))[1]
                denominator = row["values"]["ex"].get(y,{}).get("retailVolume")
                if not denominator or q <= 0:
                    continue
                vals = dict(marketShare=q/denominator,retailVolume=q)
                info = dict(inputs={"公用事业 ID":uid,"该 ID 售电量 MWh":q,"州终端售电量 MWh":denominator},
                            links=[eia_url(y),EIA_PAGE],formula="市占率 = 该报表 ID 售电量 ÷ 全州终端售电量")
                for scope in child["scopes"]:
                    put(child,scope,y,vals,info)
    return out

def monthly_html(name):
    path = CACHE / name
    if not path.exists():
        return {}
    rows = re.findall(r"<td class='B4'>&nbsp;&nbsp;(20\d\d)</td>(.*?)</tr>",path.read_text(),re.S)
    data = {}
    for year,body in rows:
        values = re.findall(r"<td class='B3'>\s*([\d,.]+)\s*</td>",body)
        if len(values) != 12:
            continue
        for i,v in enumerate(values,1):
            data[int(year),i] = float(v.replace(",",""))
    return data

def season_adjust(values, months):
    sums = defaultdict(list)
    for month,v in zip(months,values):
        sums[month].append(v)
    means = {k:sum(v)/len(v) for k,v in sums.items()}
    return [v-means[m] for v,m in zip(values,months)]

def price_coefficient(prices, quantities, months, trend):
    x = season_adjust(prices,months)
    y = season_adjust(quantities,months)
    t = season_adjust(trend,months)
    tt = sum(v*v for v in t)
    def remove_trend(values):
        slope = sum(a*b for a,b in zip(t,values))/tt
        return [a-slope*b for a,b in zip(values,t)]
    x,y = remove_trend(x),remove_trend(y)
    xx = sum(a*a for a in x)
    beta = sum(a*b for a,b in zip(x,y))/xx
    se = math.sqrt(sum((b-beta*a)**2 for a,b in zip(x,y))/(len(x)-14)/xx)
    return beta,se

def gas():
    row = market("gas-us","美国车用汽油","473","美国 EIA 与 BLS",
        "美国市场，需求量以 EIA 成品车用汽油产品供应量近似。弹性为截至当年末 60 个月窗口内可用月份的描述性回归，控制季节和线性时间趋势，受收入、政策与共同冲击影响。",
        scopes=("ex","world"))
    nominal = monthly_html("eia-gas-price.html")
    volume = monthly_html("eia-gas-volume.html")
    cpi_file = CACHE / "fred-cpi.csv"
    if not cpi_file.exists():
        return row
    cpi = {}
    for r in csv.DictReader(cpi_file.read_text(encoding="utf-8-sig").splitlines()):
        if r["CPIAUCSL"] and r["CPIAUCSL"]!=".":
            d = date.fromisoformat(r["observation_date"])
            cpi[d.year,d.month] = float(r["CPIAUCSL"])
    for y in range(START-1,END+1):
        window = [(yy,m) for yy in range(y-4,y+1) for m in range(1,13)]
        idx = [i for i in window if i in nominal and i in volume and i in cpi]
        if len(idx) < 54:
            continue
        logq = [math.log(volume[i]) for i in idx]
        logp = [math.log(nominal[i]/cpi[i]) for i in idx]
        beta,se = price_coefficient(logp,logq,[m for yy,m in idx],[(yy-y+4)*12+m for yy,m in idx])
        values = dict(elasticity=beta,gasPrice=sum(nominal[i] for i in window[-12:])/12,
                      gasVolume=sum(volume[i] for i in window[-12:])/12)
        inputs = {"价格斜率 β":beta,"经典 OLS 标准误":se,"样本月数":len(idx),"窗口":f"{y-4}-01 至 {y}-12",
            "价格": "EIA 普通汽油每加仑名义美元 ÷ CPIAUCSL","需求": "EIA 月均日产品供应量，千桶/日",
            "月度原始值":[[f"{yy}-{m:02}",nominal[yy,m],volume[yy,m],cpi[yy,m]] for yy,m in idx]}
        details = dict(inputs=inputs,links=[EIA_PRICE,EIA_VOLUME,CPI_PAGE],
                       formula="ln(供应量) = 常数 + β × ln(实际价格) + 月份固定效应 + 线性时间趋势 + 残差")
        for scope in row["scopes"]:
            put(row,scope,y,values,details)
    return row

def all_markets():
    return [*ev(),*eia_retail(),gas()]
