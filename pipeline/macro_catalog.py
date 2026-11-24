"""Curated official macro indicators. Percentages are stored as decimals."""
CATEGORIES=[
 ("growth","增长与需求","Growth and demand"),
 ("prices","通胀与价格","Inflation and prices"),
 ("labor","就业与人口","Labour and population"),
 ("money","货币与利率","Money and interest rates"),
 ("fiscal","财政与政府债务","Fiscal policy and sovereign debt"),
 ("external","贸易与国际收支","Trade and external balances"),
 ("stability","信用、住房与金融稳定","Credit, housing and financial stability"),
 ("structure","经济结构","Economic structure"),
]
# International areas remain separate from their member economies.
ECONOMIES="WLD EMU EUU OED HIC MIC LMY USA CHN JPN DEU IND GBR FRA ITA CAN AUS BRA RUS KOR MEX IDN TUR SAU ZAF ARG ESP NLD CHE SWE NOR DNK POL CZE HUN GRC PRT IRL AUT BEL FIN NZL SGP HKG TWN MYS THA VNM PHL ISR ARE EGY NGA KEN PAK BGD CHL COL PER".split()
WB_FIELDS="""
gdp|国内生产总值|GDP, current USD|growth|NY.GDP.MKTP.CD|money
gdpGrowth|实际 GDP 增速|Real GDP growth|growth|NY.GDP.MKTP.KD.ZG|pct
gdpPerCapita|人均 GDP|GDP per capita, current USD|growth|NY.GDP.PCAP.CD|usdPerCapita
gdpPerCapitaGrowth|实际人均 GDP 增速|Real GDP per capita growth|growth|NY.GDP.PCAP.KD.ZG|pct
gdpPpp|GDP（购买力平价）|GDP at purchasing power parity|growth|NY.GDP.MKTP.PP.CD|intMoney
investment|资本形成占 GDP|Gross capital formation / GDP|growth|NE.GDI.TOTL.ZS|pct
householdConsumption|家庭消费占 GDP|Household consumption / GDP|growth|NE.CON.PRVT.ZS|pct
governmentConsumption|政府消费占 GDP|Government consumption / GDP|growth|NE.CON.GOVT.ZS|pct
savings|国民储蓄占 GDP|Gross savings / GDP|growth|NY.GNS.ICTR.ZS|pct
inflation|CPI 年均通胀率|Annual average CPI inflation|prices|FP.CPI.TOTL.ZG|pct
deflator|GDP 平减指数增速|GDP deflator growth|prices|NY.GDP.DEFL.KD.ZG|pct
unemployment|失业率（ILO 模型估计）|Unemployment, modelled ILO estimate|labor|SL.UEM.TOTL.ZS|pct
youthUnemployment|青年失业率（ILO 模型估计）|Youth unemployment, modelled ILO estimate|labor|SL.UEM.1524.ZS|pct
participation|劳动参与率（15 岁以上）|Labour force participation, ages 15+|labor|SL.TLF.CACT.ZS|pct
employmentRatio|就业人口比（15 岁以上）|Employment-to-population ratio, ages 15+|labor|SL.EMP.TOTL.SP.ZS|pct
population|人口|Population|labor|SP.POP.TOTL|count
populationGrowth|人口增速|Population growth|labor|SP.POP.GROW|pct
dependency|年龄抚养比|Age dependency ratio|labor|SP.POP.DPND|pct
urban|城镇人口占比|Urban population share|labor|SP.URB.TOTL.IN.ZS|pct
broadMoney|广义货币占 GDP|Broad money / GDP|money|FM.LBL.BMNY.GD.ZS|pct
moneyGrowth|广义货币增速|Broad money growth|money|FM.LBL.BMNY.ZG|pct
lendingRate|贷款利率|Lending interest rate|money|FR.INR.LEND|pct
depositRate|存款利率|Deposit interest rate|money|FR.INR.DPST|pct
realRate|实际贷款利率|Real lending interest rate|money|FR.INR.RINR|pct
taxRevenue|中央政府税收占 GDP|Central government tax revenue / GDP|fiscal|GC.TAX.TOTL.GD.ZS|pct
governmentRevenue|中央政府收入（不含赠款）占 GDP|Central government revenue excluding grants / GDP|fiscal|GC.REV.XGRT.GD.ZS|pct
governmentExpense|中央政府费用占 GDP|Central government expense / GDP|fiscal|GC.XPN.TOTL.GD.ZS|pct
interestRevenue|中央政府利息支出占收入|Central government interest payments / revenue|fiscal|GC.XPN.INTP.RV.ZS|pct
currentAccount|经常账户占 GDP|Current account balance / GDP|external|BN.CAB.XOKA.GD.ZS|pct
exports|商品和服务出口占 GDP|Exports of goods and services / GDP|external|NE.EXP.GNFS.ZS|pct
imports|商品和服务进口占 GDP|Imports of goods and services / GDP|external|NE.IMP.GNFS.ZS|pct
exportGrowth|实际出口增速|Real exports growth|external|NE.EXP.GNFS.KD.ZG|pct
importGrowth|实际进口增速|Real imports growth|external|NE.IMP.GNFS.KD.ZG|pct
fdi|FDI 净流入占 GDP|FDI net inflows / GDP|external|BX.KLT.DINV.WD.GD.ZS|pct
reserves|国际储备（含黄金）|Total reserves including gold|external|FI.RES.TOTL.CD|money
reserveCover|储备可支付进口月数|Reserves in months of imports|external|FI.RES.TOTL.MO|months
exchangeRate|年均汇率（本币／美元）|Annual average exchange rate, local currency / USD|external|PA.NUS.FCRF|fx
externalDebt|外债占国民总收入|External debt / GNI|external|DT.DOD.DECT.GN.ZS|pct
shortDebtReserves|短期外债占储备|Short-term external debt / reserves|external|DT.DOD.DSTC.IR.ZS|pct
debtServiceExports|外债偿付占出口|External debt service / exports|external|DT.TDS.DECT.EX.ZS|pct
privateCredit|私人部门国内信贷占 GDP|Domestic credit to private sector / GDP|stability|FS.AST.PRVT.GD.ZS|pct
badLoans|银行不良贷款率|Bank non-performing loans / gross loans|stability|FB.AST.NPER.ZS|pct
bankCapital|银行资本占资产|Bank capital / assets|stability|FB.BNK.CAPA.ZS|pct
agriculture|农业增加值占 GDP|Agriculture value added / GDP|structure|NV.AGR.TOTL.ZS|pct
manufacturing|制造业增加值占 GDP|Manufacturing value added / GDP|structure|NV.IND.MANF.ZS|pct
industry|工业增加值占 GDP|Industry value added / GDP|structure|NV.IND.TOTL.ZS|pct
services|服务业增加值占 GDP|Services value added / GDP|structure|NV.SRV.TOTL.ZS|pct
"""
def field(line,source,frequency="A"):
    key,zh,en,category,code,unit=line.split("|")
    return dict(id=key,name=zh,en=en,category=category,code=code,unit=unit,source=source,frequency=frequency)
WB=[field(line,"wb") for line in WB_FIELDS.strip().splitlines()]
IMF=[
 field("governmentDebt|一般政府总债务占 GDP|General government gross debt / GDP|fiscal|GGXWDG_NGDP|pct","imf"),
 field("fiscalBalance|一般政府净贷出／借入占 GDP|General government net lending / borrowing / GDP|fiscal|GGXCNL_NGDP|pct","imf"),
]
BIS=[
 field("policyRate|央行政策利率（月末）|Central bank policy rate, month end|money|WS_CBPOL|pct","bis","M"),
 field("cpiMonthly|CPI 同比（月度）|CPI year-on-year, monthly|prices|WS_LONG_CPI|pct","bis","M"),
 field("cpiIndex|CPI 指数（2010＝100）|CPI index, 2010 = 100|prices|WS_LONG_CPI|index","bis","M"),
 field("housePrices|实际住宅价格（2010＝100）|Real residential prices, 2010 = 100|stability|WS_SPP|index","bis","Q"),
 field("housePricesYoy|实际住宅价格同比|Real residential prices, year-on-year|stability|WS_SPP|pct","bis","Q"),
 field("nominalHousePrices|名义住宅价格（2010＝100）|Nominal residential prices, 2010 = 100|stability|WS_SPP|index","bis","Q"),
 field("totalCredit|私人非金融部门总信贷占 GDP|Private non-financial credit / GDP|stability|WS_TC|pct","bis","Q"),
 field("householdCredit|家庭部门总信贷占 GDP|Household credit / GDP|stability|WS_TC|pct","bis","Q"),
 field("corporateCredit|非金融企业总信贷占 GDP|Non-financial corporate credit / GDP|stability|WS_TC|pct","bis","Q"),
 field("debtService|私人非金融部门偿债比率|Private non-financial debt service ratio|stability|WS_DSR|pct","bis","Q"),
 field("realFx|实际有效汇率（2020＝100）|Real effective exchange rate, 2020 = 100|external|WS_EER|index","bis","M"),
]
# The source, seasonal adjustment and transformations are retained for each US series.
FRED=[
 ("usCoreCpi","核心 CPI 同比（美国）","Core CPI YoY, US","prices","CPILFESL","pct","M","yoy",1,"BLS"),
 ("usPce","PCE 价格同比（美国）","PCE price inflation YoY, US","prices","PCEPI","pct","M","yoy",1,"BEA"),
 ("usCorePce","核心 PCE 同比（美国）","Core PCE inflation YoY, US","prices","PCEPILFE","pct","M","yoy",1,"BEA"),
 ("usPpi","PPI 全商品同比（美国）","PPI all commodities YoY, US","prices","PPIACO","pct","M","yoy",1,"BLS"),
 ("usUnemployment","调查失业率（美国）","Survey unemployment rate, US","labor","UNRATE","pct","M","level",.01,"BLS"),
 ("usPayroll","非农就业人数（美国）","Nonfarm payroll employment, US","labor","PAYEMS","count","M","level",1000,"BLS"),
 ("usIndustrial","工业产出同比（美国）","Industrial production YoY, US","growth","INDPRO","pct","M","yoy",1,"Federal Reserve"),
 ("usRetail","零售销售同比（美国）","Retail sales YoY, US","growth","RSAFS","pct","M","yoy",1,"US Census Bureau"),
 ("usTreasury2","国债 2 年收益率（月均，美国）","2-year Treasury yield, monthly average, US","money","DGS2","pct","M","level",.01,"Federal Reserve H.15"),
 ("usTreasury10","国债 10 年收益率（月均，美国）","10-year Treasury yield, monthly average, US","money","DGS10","pct","M","level",.01,"Federal Reserve H.15"),
 ("usRealYield","国债 10 年实际收益率（月均，美国）","10-year real Treasury yield, monthly average, US","money","DFII10","pct","M","level",.01,"Federal Reserve H.15"),
 ("usFedAssets","美联储资产（月末）","Federal Reserve assets, last weekly observation of month","money","WALCL","money","M","last",1e6,"Federal Reserve H.4.1"),
 ("usM2","M2 货币存量（美国）","M2 money stock, US","money","M2SL","money","M","level",1e9,"Federal Reserve H.6"),
 ("usGdpQuarter","实际 GDP 季环比折年率（美国）","Real GDP quarterly annualized growth, US","growth","A191RL1Q225SBEA","pct","Q","level",.01,"BEA"),
 ("usHousingStarts","新屋开工折年量（美国）","Housing starts, seasonally adjusted annual rate, US","stability","HOUST","count","M","level",1000,"US Census Bureau"),
]
SOURCES={
 "wb":{"name":"世界银行 WDI","en":"World Bank WDI","url":"https://databank.worldbank.org/source/world-development-indicators","terms":"https://data.worldbank.org/summary-terms-of-use"},
 "imf":{"name":"IMF WEO","en":"IMF WEO","url":"https://www.imf.org/external/datamapper/","terms":"https://www.imf.org/en/about/copyright-and-terms"},
 "bis":{"name":"国际清算银行／各国央行","en":"BIS / national central banks","url":"https://data.bis.org/","terms":"https://www.bis.org/about/terms-conditions"},
 "fred":{"name":"美国官方机构／FRED","en":"US official agencies / FRED","url":"https://fred.stlouisfed.org/","terms":"https://fred.stlouisfed.org/legal/"},
}
