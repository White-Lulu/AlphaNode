"""Additional statement fields and denominator-aware financial ratios."""
from datetime import date

EXTRA_DURATION = {
    "ocf":("NetCashProvidedByUsedInOperatingActivities","CashFlowsFromUsedInOperatingActivities"),
    "capex":("PaymentsToAcquirePropertyPlantAndEquipment","PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
             "PaymentsToAcquireProductiveAssets"),
    "da":("DepreciationDepletionAndAmortization","DepreciationAndAmortisationExpense",
          "DepreciationAmortizationAndAccretionNet"),
    "interest_expense":("InterestExpense","InterestAndDebtExpense","InterestExpenseOnBorrowings"),
    "research_exp":("ResearchAndDevelopmentExpense","ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"),
}
EXTRA_INSTANT = {
    "current_assets":("AssetsCurrent","CurrentAssets"),
    "current_liab":("LiabilitiesCurrent","CurrentLiabilities"),
    "inventory":("InventoryNet","Inventories"),
    "liabilities":("Liabilities",),
}
EXTENDED = {
    "ebit":("经营利润","money"),"ocf":("经营现金流","money"),"capex":("资本开支","money"),
    "fcf":("自由现金流","money"),"fcfMargin":("自由现金流率","pct"),"cashConversion":("现金利润比","ratio"),
    "ebitda":("EBITDA 估算","money"),"ebitdaMargin":("EBITDA 利润率","pct"),
    "roa":("ROA","pct"),"assetTurnover":("总资产周转率","ratio"),
    "debtAssets":("有息负债率","pct"),"currentRatio":("流动比率","ratio"),"quickRatio":("速动比率","ratio"),
    "interestCover":("利息保障倍数","ratio"),"researchIntensity":("研发强度","pct"),"capitalIntensity":("资本开支率","pct")
}
WEIGHTS = {
    "fcfMargin":"revenue","cashConversion":"net","ebitdaMargin":"revenue",
    "roa":"assets_avg","assetTurnover":"assets_avg","debtAssets":"assets",
    "currentRatio":"current_liab","quickRatio":"current_liab",
    "interestCover":"interest_expense","researchIntensity":"revenue","capitalIntensity":"revenue"
}

def extend(row,prior,current,is_finance):
    facts=row["facts"]
    def get(key):
        return facts.get(key,[None])[0]
    fx=get("fx")
    rev=get("revenue")
    assets=get("assets")
    net=get("net")
    ocf=get("ocf")
    capex=get("capex")
    ebit=get("ebit")
    da=get("da")
    def ratio(name,top,bottom):
        if top is not None and bottom is not None and bottom>0:
            current[name]=top/bottom
    def money(name,value):
        if fx and value is not None:
            current[name]=value/fx
    prev_assets=None
    if prior and prior["currency"]==row["currency"]:
        difference=(date.fromisoformat(row["end"])-date.fromisoformat(prior["end"])).days
        if 345<=difference<=385:
            prev_assets=prior["facts"].get("assets",[None])[0]
    if assets and prev_assets and min(assets,prev_assets)>0:
        average_assets=(assets+prev_assets)/2
        facts["assets_avg"]=[average_assets,f"({prev_assets:g} + {assets:g}) / 2",None]
        ratio("roa",net,average_assets)
        if not is_finance:
            ratio("assetTurnover",rev,average_assets)
    money("ocf",ocf)
    if is_finance:
        return
    money("ebit",ebit)
    if capex is not None:
        capex=abs(capex)
        facts["capex"][0]=capex
        money("capex",capex)
        ratio("capitalIntensity",capex,rev)
        if ocf is not None:
            fcf=ocf-capex
            money("fcf",fcf)
            ratio("fcfMargin",fcf,rev)
    ratio("cashConversion",ocf,net)
    ratio("debtAssets",get("debt"),assets)
    ca,cl,inventory=map(get,("current_assets","current_liab","inventory"))
    ratio("currentRatio",ca,cl)
    if ca is not None and inventory is not None:
        ratio("quickRatio",ca-inventory,cl)
    ratio("interestCover",ebit,get("interest_expense"))
    ratio("researchIntensity",get("research_exp"),rev)
    if ebit is not None and da is not None and da>=0:
        estimate=ebit+da
        money("ebitda",estimate)
        ratio("ebitdaMargin",estimate,rev)
