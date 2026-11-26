"""Official short-term, external-position and commodity series for the macro atlas."""
from collections import defaultdict
import csv
import hashlib
import io
import math
import requests
from urllib.parse import urlencode

from macro_catalog import COSTS, IIP, OECD

OECD_FLOW = "OECD.SDD.STES,DSD_KEI@DF_KEI,4.0"
IIP_FLOW = "IMF.STA,IIP,13.0.0"
AGGREGATES = {"WLD", "EMU", "EUU", "OED", "HIC", "MIC", "LMY"}


def csv_records(fetch, name, url, params):
    # A cache belongs to its full query, never just its position in a batch.
    signature = hashlib.sha256((url + "?" + urlencode(sorted(params.items()))).encode()).hexdigest()[:16]
    body = fetch("macro-atlas-" + name + "-" + signature + ".csv", url, params,
                 headers={"Accept": "text/csv"})
    records = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
    if not records or "OBS_VALUE" not in records[0]:
        raise ValueError("Invalid official CSV response: " + name)
    return records


def record_value(rows, country, period, value, unit, store, notes=None):
    try:
        number = float(value)
    except (ValueError, TypeError):
        return
    if not math.isfinite(number):
        return
    expected = number / 100 if unit in ("pct", "pp") else number
    existing = rows.get(country, {}).get("values", {}).get(period)
    if existing is not None and not math.isclose(existing, expected, rel_tol=1e-10, abs_tol=1e-12):
        raise ValueError("Conflicting observations: " + str((country, period, existing, expected)))
    store(rows, country, period, number, unit, notes)


def build_oecd(countries, fetch, store):
    # Do not relabel fixed-membership OECD regional groups as World Bank groups.
    areas = "+".join(c["id"] for c in countries if c["id"] not in AGGREGATES)
    output = {}
    for key, zh, en, category, frequency, measure, unit, activity, adjustment, transformation, display_unit in OECD:
        dimensions = [areas, frequency, measure, unit, activity, adjustment, transformation]
        endpoint = "https://sdmx.oecd.org/public/rest/v1/data/" + OECD_FLOW + "/" + ".".join(dimensions)
        records = csv_records(fetch, "oecd-" + key, endpoint, {"startPeriod": "2000", "format": "csvfile"})
        rows = {}
        for record in records:
            if tuple(record.get(k) for k in ("FREQ", "MEASURE", "UNIT_MEASURE", "ACTIVITY", "ADJUSTMENT", "TRANSFORMATION")) != tuple(dimensions[1:]):
                raise ValueError("Unexpected OECD dimensions for " + key)
            country, period = record["REF_AREA"], record["TIME_PERIOD"]
            try:
                value = float(record["OBS_VALUE"]) * 10 ** int(record.get("UNIT_MULT") or 0)
            except (ValueError, TypeError):
                continue
            record_value(rows, country, period, value, display_unit, store, {
                "standard": "OECD KEI; " + "; ".join(k + "=" + record[k] for k in
                    ("ACTIVITY", "ADJUSTMENT", "TRANSFORMATION")),
            })
            flag = record.get("OBS_STATUS", "")
            if country in rows and period in rows[country]["values"] and flag and flag != "A":
                rows[country].setdefault("flags", {})[period] = flag
        if not rows:
            raise ValueError("No usable OECD observations for " + key)
        note, note_en = OECD_NOTES[key]
        code = "OECD KEI / " + ".".join(dimensions[1:])
        output[key] = dict(id=key, name=zh, en=en, category=category, frequency=frequency,
            code=code, unit=display_unit, source="oecd", rows=list(rows.values()),
            publisher="OECD / national statistical agencies", definition=note_en,
            note=note, noteEn=note_en,
            url="https://data-explorer.oecd.org/vis?" + urlencode({
                "df[ag]": "OECD.SDD.STES", "df[id]": "DSD_KEI@DF_KEI", "df[vs]": "4.0",
                "dq": ".".join([""] + dimensions[1:]),
            }))
        print("OECD", key, len(rows), "economies", flush=True)
    return output


OECD_NOTES = {
    "gdpQuarterGrowth": (
        "实际 GDP 相对上一季度的变化；已季节及日历调整，未折年。与美国季环比折年率是不同指标。",
        "Quarter-on-quarter real GDP growth, seasonally and calendar adjusted, not annualized. Distinct from the US annualized quarterly growth series."),
    "gdpQuarterYoy": (
        "实际 GDP 相对去年同季度的变化；已季节及日历调整。",
        "Real GDP growth from the same quarter one year earlier, seasonally and calendar adjusted."),
    "industrialMonthly": (
        "工业生产实际产出同比，范围为工业（不含建筑，ISIC B–E）；已季节及日历调整。没有来源数据的经济体留空。",
        "Year-on-year industrial production volume growth, industry excluding construction (ISIC B–E), seasonally and calendar adjusted. Uncovered economies remain missing."),
    "retailVolumeMonthly": (
        "零售交易实际量同比，ISIC G47，不含汽车及摩托车销售；已季节及日历调整。与美国现价零售及餐饮销售同比范围不同。",
        "Retail trade volume growth, ISIC G47 excluding motor vehicles and motorcycles, seasonally and calendar adjusted. Coverage differs from US nominal retail and food-services sales."),
    "hourlyEarningsMonthly": (
        "制造业雇员名义小时收入同比（ISIC C），已季节及日历调整，未扣除通胀；不代表全体就业者平均工资。",
        "Nominal hourly earnings growth in manufacturing (ISIC C), seasonally and calendar adjusted. Not inflation-adjusted and not an economy-wide average wage."),
    "unemploymentMonthly": (
        "劳动力中的失业者比例，已季节及日历调整。各经济体劳动力年龄范围及调查细节见来源；与 ILO 年度模型估计区分展示。",
        "Unemployed persons as a share of the labour force, seasonally and calendar adjusted. National age coverage and survey details vary; separate from annual ILO modelled estimates."),
    "longTermYield": (
        "通常为十年期政府债券的年化收益率月均值。各经济体的代表债券及期限可能有差异；不是债券投资回报率。",
        "Monthly average annualized yield on long-term government bonds, generally ten-year maturity. Representative instruments can differ; this is not a bond investment return."),
    "leadingIndicator": (
        "OECD 振幅调整的综合领先指标，长期趋势为 100，用于观察经济周期转折。高于 100 不等于 GDP 增速为正，历史值可能修订。",
        "OECD amplitude-adjusted composite leading indicator, long-term trend = 100, for business-cycle turning points. Above 100 does not imply positive GDP growth; history is revisable."),
}


def build_iip(countries, fetch, store):
    areas = "+".join(c["id"] for c in countries if c["id"] not in AGGREGATES)
    endpoint = "https://api.imf.org/external/sdmx/2.1/data/" + IIP_FLOW + "/" + areas + ".NETAL_P.NIIP.USD.A+Q"
    records = csv_records(fetch, "imf-niip", endpoint, {"startPeriod": "2000", "detail": "dataonly"})
    output = {}
    for metric in IIP:
        rows = {}
        for record in records:
            if record["FREQUENCY"] != metric["frequency"]:
                continue
            if (record["BOP_ACCOUNTING_ENTRY"], record["INDICATOR"], record["UNIT"]) != ("NETAL_P", "NIIP", "USD"):
                raise ValueError("Unexpected IMF investment-position dimensions")
            # The IMF CSV OBS_VALUE is already in USD. SCALE is a display attribute,
            # unlike OECD UNIT_MULT, and must not be applied to these observations.
            record_value(rows, record["COUNTRY"], record["TIME_PERIOD"], record["OBS_VALUE"], "money", store,
                {"standard": "IMF IIP; BPM6; net assets less liabilities; end-period positions; USD"})
        if not rows:
            raise ValueError("No IMF investment-position observations for " + metric["id"])
        note = "期末对外金融资产减对外金融负债，正值为净资产、负值为净负债，以现价美元计。包含权益和债务，不等于外债净额；年度与季度分别保留，缺失值不互相填充。"
        note_en = "End-period external financial assets less external liabilities in current USD. Includes equity and debt, unlike net external debt. Annual and quarterly series remain separate; missing observations are not filled from the other frequency."
        output[metric["id"]] = {**metric, "rows": list(rows.values()), "publisher": "IMF / national authorities",
            "definition": note_en, "note": note, "noteEn": note_en, "url": "https://data.imf.org/Datasets/IIP"}
    return output


def build_costs(fetch, store):
    codes = ",".join(item[3] for item in COSTS)
    endpoint = "https://fred.stlouisfed.org/graph/fredgraph.csv"
    body = fetch("macro-atlas-eia-benchmarks.csv", endpoint, {"id": codes, "cosd": "2000-01-01"},
                 headers={"User-Agent": requests.utils.default_user_agent()})
    records = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
    if not records or not all(code in records[0] for code in codes.split(",")):
        raise ValueError("Invalid EIA / FRED benchmark response")
    output = {}
    for key, zh, en, code, unit in COSTS:
        months = defaultdict(list)
        for record in records:
            day = record.get("observation_date", record.get("DATE", ""))
            try:
                value = float(record[code])
            except (ValueError, TypeError):
                continue
            if day >= "2000-01-01" and math.isfinite(value):
                months[day[:7]].append(value)
        rows = {}
        for period, values in months.items():
            # Preserve negative quoted prices when published; do not filter them out.
            record_value(rows, "WLD", period, sum(values) / len(values), unit, store)
        note = "EIA 发布的现货基准价格，经 FRED 获取；按每月有效交易日等权平均。仅在“全球”行提供基准参考，不是全球成交均价，也不是所选国家的本地价格。WTI 对应美国库欣，Henry Hub 对应美国路易斯安那州。"
        note_en = "EIA spot benchmark via FRED, averaged across valid daily observations within each month. Shown only on the World row as a reference, not a world transaction average or a selected country's local price. WTI refers to Cushing, Oklahoma; Henry Hub to Louisiana, USA."
        output[key] = dict(id=key, name=zh, en=en, category="costs", code=code, unit=unit,
            source="eia", frequency="M", reference=True, rows=list(rows.values()),
            publisher="US Energy Information Administration / FRED", definition=note_en,
            note=note, noteEn=note_en, url="https://fred.stlouisfed.org/series/" + code)
    return output
