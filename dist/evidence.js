import {esc,link,host,roundInput,annual,annualComparison,measure,qualityNotes,format,finite} from "./model.js";
import {pair,prose,paragraphs,nameOf} from "./i18n.js";
import {glossary,metricLabel} from "./glossary.js";

export const weights={grossMargin:"revenue",netMargin:"revenue",operatingMargin:"revenue",roe:"equity_avg",roic:"capital",
  wacc:"capital",spread:"capital",fcfMargin:"revenue",cashConversion:"net",ebitdaMargin:"revenue",
  roa:"assets_avg",assetTurnover:"assets_avg",debtAssets:"assets",currentRatio:"current_liab",quickRatio:"current_liab",
  interestCover:"interest_expense",researchIntensity:"revenue",capitalIntensity:"revenue"};

const factLabels={
  gross_profit:["披露毛利润","Reported gross profit"],cogs:["营业成本","Cost of revenue"],pretax:["税前利润","Pre-tax profit"],
  tax:["所得税费用","Income tax expense"],cash:["现金与等价物","Cash and equivalents"],equity:["归母权益","Equity attributable to owners"],
  equity_total:["合并权益","Consolidated equity"],equity_avg:["平均归母权益","Average attributable equity"],
  assets_avg:["平均总资产","Average total assets"],capital:["平均投入资本","Average invested capital"],
  debt:["可识别有息债务","Identified interest-bearing debt"],fx:["当年平均汇率","Annual average FX rate"],
  current_assets:["流动资产","Current assets"],current_liab:["流动负债","Current liabilities"],inventory:["存货","Inventory"],
  source_fx:["来源基准的人民币中间价","Source conversion parity"],retained_earnings:["留存收益","Retained earnings"],liabilities:["总负债","Total liabilities"],sales_exp:["销售费用","Selling expense"],admin_exp:["管理费用","Administrative expense"],
  research_exp:["研发费用","R&D expense"],op_tax:["税金及附加","Operating taxes and surcharges"],
  interest_expense:["利息费用","Interest expense"],da:["折旧和摊销","Depreciation and amortization"]
};
const factLabel=k=>factLabels[k]?pair(...factLabels[k]):metricLabel(k);
const fields={
  revenue:["revenue","fx"],net:["net","fx"],assets:["assets","fx"],grossProfit:["gross_profit","revenue","cogs","fx"],
  grossMargin:["gross_profit","revenue","cogs"],netMargin:["net","revenue"],operatingMargin:["ebit","revenue"],
  roe:["net","equity_avg"],roa:["net","assets_avg"],assetTurnover:["revenue","assets_avg"],ebit:["ebit","fx"],
  nopat:["ebit","tax","pretax","nopat","fx"],roic:["ebit","tax","pretax","nopat","capital"],wacc:["wacc"],
  spread:["nopat","capital","wacc"],eva:["nopat","capital","wacc","fx"],ocf:["ocf","fx"],capex:["capex","fx"],
  fcf:["ocf","capex","fx"],fcfMargin:["ocf","capex","revenue"],cashConversion:["ocf","net"],
  ebitda:["ebit","da","fx"],ebitdaMargin:["ebit","da","revenue"],debtAssets:["debt","assets"],
  equityMultiplier:["assets_avg","equity_avg"],dupontRoe:["net","revenue","assets_avg","equity_avg"],
  altmanZ2:["current_assets","current_liab","assets","retained_earnings","ebit","equity_total","liabilities"],
  zmijewski:["net","assets","liabilities","current_assets","current_liab"],
  currentRatio:["current_assets","current_liab"],quickRatio:["current_assets","inventory","current_liab"],
  interestCover:["ebit","interest_expense"],researchIntensity:["research_exp","revenue"],capitalIntensity:["capex","revenue"]
};
function equation(metric,v) {
  const a=k=>finite(v[k])?roundInput(v[k]):null;
  const divide=(x,y)=>x!==null&&y!==null?x+" ÷ "+y:null;
  const binary=(x,y,op)=>x!==null&&y!==null?"("+x+" "+op+" "+y+")":null;
  const rule={
    revenue:()=>divide(a("revenue"),a("fx")),net:()=>divide(a("net"),a("fx")),assets:()=>divide(a("assets"),a("fx")),
    grossMargin:()=>divide(a("gross_profit")??binary(a("revenue"),a("cogs"),"−"),a("revenue")),
    grossProfit:()=>divide(a("gross_profit")??binary(a("revenue"),a("cogs"),"−"),a("fx")),
    netMargin:()=>divide(a("net"),a("revenue")),roe:()=>divide(a("net"),a("equity_avg")),roa:()=>divide(a("net"),a("assets_avg")),
    roic:()=>divide(a("nopat"),a("capital")),assetTurnover:()=>divide(a("revenue"),a("assets_avg")),
    operatingMargin:()=>divide(a("ebit"),a("revenue")),ebit:()=>divide(a("ebit"),a("fx")),
    nopat:()=>divide(a("nopat"),a("fx")),ocf:()=>divide(a("ocf"),a("fx")),capex:()=>divide(a("capex"),a("fx")),
    fcf:()=>divide(binary(a("ocf"),a("capex"),"−"),a("fx")),fcfMargin:()=>divide(binary(a("ocf"),a("capex"),"−"),a("revenue")),
    cashConversion:()=>divide(a("ocf"),a("net")),ebitda:()=>divide(binary(a("ebit"),a("da"),"+"),a("fx")),
    ebitdaMargin:()=>divide(binary(a("ebit"),a("da"),"+"),a("revenue")),debtAssets:()=>divide(a("debt"),a("assets")),
    currentRatio:()=>divide(a("current_assets"),a("current_liab")),
    quickRatio:()=>divide(binary(a("current_assets"),a("inventory"),"−"),a("current_liab")),
    equityMultiplier:()=>divide(a("assets_avg"),a("equity_avg")),
    interestCover:()=>divide(a("ebit"),a("interest_expense")),researchIntensity:()=>divide(a("research_exp"),a("revenue")),
    capitalIntensity:()=>divide(a("capex"),a("revenue")),
    spread:()=>v.nopat!=null&&v.capital!=null&&v.wacc!=null?a("nopat")+" ÷ "+a("capital")+" − "+a("wacc"):null,
    eva:()=>v.nopat!=null&&v.capital!=null&&v.wacc!=null&&v.fx!=null?"("+a("nopat")+" − "+a("capital")+" × "+a("wacc")+") ÷ "+a("fx"):null
  };
  return rule[metric]?.();
}
const titleLink=url=>url.includes("sec.gov")?pair("SEC 申报","SEC filing"):pair("原始来源","Source");
function factList(f,keys) {
  return keys.map(k=>{
    const [value,tag,url]=f[k];
    return "<li>"+esc(factLabel(k))+" · <strong>"+esc(roundInput(value))+"</strong> · "+esc(tag)+
      (url?"　"+link(url,titleLink(url)):"")+"</li>";
  }).join("");
}
const componentLabels={
  "Net Profit Margin":"净利率","Asset Turnover":"总资产周转率","Equity Multiplier":"权益乘数",
  "Working capital / assets":"营运资本 ÷ 总资产","Retained earnings / assets":"留存收益 ÷ 总资产",
  "Operating profit / assets":"经营利润 ÷ 总资产","Book equity / liabilities":"账面权益 ÷ 总负债",
  "Net income / assets":"净利润 ÷ 总资产","Liabilities / assets":"总负债 ÷ 总资产","Current ratio":"流动比率"
};
function modelEvidence(data,metric,result) {
  const model=data.models?.[metric];
  if (!model) return "";
  const entries=Object.entries(model.components);
  const v=entries.map(([,value])=>roundInput(value));
  const equation={
    dupontRoe:()=>v.join(" × "),
    altmanZ2:()=> "6.56 × "+v[0]+" + 3.26 × "+v[1]+" + 6.72 × "+v[2]+" + 1.05 × "+v[3],
    zmijewski:()=> "−4.336 − 4.513 × ("+v[0]+") + 5.679 × "+v[1]+" + 0.004 × "+v[2]
  }[metric]?.();
  return (equation&&finite(result)?"<p>"+esc(pair("模型代入","Model calculation"))+" · "+esc(equation+" = "+roundInput(result))+"</p>":"")+
    (entries.length?"<ul>"+entries.map(([key,value])=>"<li>"+esc(pair(componentLabels[key],key))+" · "+esc(roundInput(value))+"</li>").join("")+"</ul>":"")+
    "<p>"+link(model.code,pair("计算源码","Calculation source"))+"</p>";
}
export function companyEvidence(row,audit,metric,year,scope) {
  const data=audit?.[year],f=data?.facts;
  if (!f) return "<p>"+esc(pair("该年度无可核验财报字段。","No verifiable statement items for this fiscal year."))+"</p>";
  const required=(fields[metric]||[]).filter(k=>f[k]);
  if (f.source_fx) required.push("source_fx");
  const extra=Object.keys(f).filter(k=>!required.includes(k));
  const warning=qualityNotes[data.flags?.[metric]];
  const values=Object.fromEntries(required.map(k=>[k,f[k][0]]));
  const eq=equation(metric,values),result=annual(row,metric,year,scope,"sum");
  const prev=audit[year-1];
  const previousFields=prev&&["roe","roa","assetTurnover","roic","spread","eva","dupontRoe","equityMultiplier"].includes(metric)?
    ["equity","equity_total","assets","cash","debt"].filter(k=>prev.facts?.[k]):[];
  const g=glossary[metric];
  return "<p>"+esc(pair("财年截止","Fiscal year end"))+" "+esc(data.end)+" · "+esc(pair("原始币种","Reported currency"))+" "+esc(data.currency)+"</p>"+
    (data.official?"<p>"+link(data.official,pair("原始年度报告","Original annual report"))+"</p>":"")+
    (f.source_fx?"<p>"+esc(prose("东方财富金额采用人民币。先用财年末中间价还原财报币种，再按年均汇率折算美元。","Eastmoney normalizes these amounts to CNY. The fiscal year-end parity recovers the reporting currency, then the annual FX rate converts it to USD."))+"</p>":"")+
    (warning?'<p class="quality-note">'+esc(prose(...warning))+"</p>":"")+
    (g?'<p class="multilingual">'+esc(paragraphs(g[2],g[3]))+"</p>":"")+
    (eq&&finite(result)?"<p>"+esc(pair("代入数值","Calculation"))+" · "+esc(eq)+" = "+esc(roundInput(result))+"</p>":"")+
    modelEvidence(data,metric,result)+(data.providerCode?"<p>"+link(data.providerCode,pair("财报适配器源码","Statement adapter source"))+"</p>":"")+
    (required.length?"<ul>"+factList(f,required)+"</ul>":"<p>"+esc(pair("缺少必要数据或该指标不适用。","Required inputs are unavailable or the metric does not apply."))+"</p>")+
    (extra.length?'<details><summary>'+esc(pair("本期其他财报字段","Other statement items"))+'</summary><ul>'+factList(f,extra)+'</ul></details>':"")+
    (previousFields.length?'<details><summary>'+esc(pair("上年期末财报字段","Prior year-end statement items"))+
      '</summary><ul>'+factList(prev.facts,previousFields)+'</ul>'+(prev.official?link(prev.official,pair("上年度报告","Previous annual report")):"")+"</details>":"");
}
export function seriesEvidence(data) {
  if (!data) return "<p>"+esc(pair("该年度无原始观测。","No source observation for this year."))+"</p>";
  const simple=Object.entries(data.inputs||{}).filter(([,v])=>v===null||typeof v!=="object");
  const complex=Object.entries(data.inputs||{}).filter(([,v])=>v!==null&&typeof v==="object");
  const inputs=pair("原表字段","Source fields");
  return (data.formula?"<p>"+esc(data.formula)+"</p>":"")+
    (simple.length?"<p><b>"+esc(inputs)+"</b></p><ul>"+simple.map(([k,v])=>"<li>"+esc(k)+" · "+esc(roundInput(v))+"</li>").join("")+"</ul>":"")+
    complex.map(([k,v])=>'<details><summary>'+esc(k)+'</summary><pre>'+esc(JSON.stringify(v,null,2))+'</pre></details>').join("")+
    (data.links||[]).map(u=>link(u,host(u))).join("　");
}
export function benchmarkEvidence(row,metric,year,scope,benchmark) {
  const dataset=["roe","roic","spread","eva"].includes(metric)?"eva":["wacc","firms"].includes(metric)?"wacc":"margin";
  const src=benchmark.sources?.[scope]?.[year]?.[dataset];
  const valid=finite(row.values?.[scope]?.[year]?.[metric]);
  return "<p>"+esc(valid?pair("采用 Damodaran 原表行业数据。","Published Damodaran industry observation."):
    pair("本区域或年度缺少该项基准。","This benchmark is unavailable for the selected region or year."))+"</p>"+
    "<p>"+esc(row.en)+" · "+esc(pair("期末参考年","Reference year"))+" "+year+
    (src?.date?" · "+esc(pair("文件日期","Workbook date"))+" "+esc(src.date):"")+"</p>"+
    (src?link(src.url,pair("原始工作簿","Original workbook"))+"　":"")+
    link(benchmark.archive,pair("年度归档","Archive"))+"　"+link(benchmark.current,pair("最近一期发布","Current release"));
}
export function aggregateEvidence(row,metric,year,scope,aggregate,companies,lookup,meta) {
  const cell=row.agg?.[scope]?.[year];
  const idx=aggregate==="sum"?0:1;
  const n=cell?.counts?.[metric]?.[idx]??0, op=cell?.operands?.[metric]?.[idx];
  const weight=weights[metric];
  const formula=idx?pair("有效企业数值之和 ÷ 企业数","Sum of available company values ÷ company count"):
    weight?pair("数值按 "+factLabel(weight)+" 加权","Values weighted by "+factLabel(weight)):
    pair("加总有有效数值的企业","Sum of available company observations");
  const members=companies.filter(c=>{
    if (!finite(annual(c,metric,year,scope,aggregate))||c.qualityFlags?.[year]?.[metric]==="grossConflict") return false;
    if (row.scheme==="economic"&&!idx&&weight==="revenue"&&!(c.finance[year]?.revenue>0)) return false;
    let ancestor=c.parent;
    while (ancestor&&ancestor!==row.id) ancestor=lookup.get(ancestor)?.parent;
    return ancestor===row.id;
  });
  const candidateNote=row.scheme==="economic"&&!idx&&weight&&members.length!==n?
    "<p>"+esc(pair("下列为有该指标的企业。加权只计入有正权重的观测。","Listed issuers have the metric. Weighting uses observations with a positive weight."))+"</p>":"";
  const equation=n&&op?roundInput(op[0])+(op[1]?" ÷ "+roundInput(op[1]):"")+" = "+roundInput(cell[aggregate][metric]):"";
  return "<p>"+esc(formula)+" · n = "+n+"</p>"+(equation?"<p>"+esc(equation)+"</p>":"")+candidateNote+
    (members.length?'<details><summary>'+esc(pair("参与企业及披露","Company inputs and filings"))+'</summary><ul>'+
      members.sort((a,b)=>b.finance[year][metric]-a.finance[year][metric]).map(c=>
      '<li><button class="quiet" type="button" data-open-profile="'+esc(c.id)+'">'+esc(c.code+" "+nameOf(c))+
      '</button>　'+format(c.finance[year][metric],metric,"level",meta)+'</li>').join("")+"</ul></details>":"");
}
export function timeEvidence(row,metric,year,scope,aggregate,mode,meta) {
  const get=y=>annual(row,metric,y,scope,aggregate);
  const f=x=>format(x,metric,"level",meta);
  if (mode==="level") return "";
  const key=mode.startsWith("cagr")?"cagr":mode.startsWith("avg")?"avg":mode;
  const g=glossary[key];
  const start=key==="cagr"?year-Number(mode.slice(4)):year-1;
  let items=[];
  let details="";
  if (key==="cagr") items=[[start,f(get(start))],[year,f(get(year))]];
  if (key==="yoy") {
    const comparison=annualComparison(row,metric,year,scope,aggregate,meta);
    items=[[start,f(comparison.before)],[year,f(comparison.after)]];
    if (comparison.count) details+='<p>'+esc(pair("两年共同样本","Common two-year cohort"))+' · n = '+comparison.count+' · '+
      esc(prose("上方同比使用共同样本重算值。下方年度明细使用该年全部有效样本。",
        "The change uses the common cohort. Annual evidence below uses every available observation for that year."))+'</p>';
    const warning=qualityNotes[comparison.note];
    if (warning) details+='<p class="quality-note">'+esc(prose(...warning))+
      (comparison.value===undefined&&finite(comparison.raw)?" · "+esc(pair("直接计算值","Unadjusted change"))+" "+format(comparison.raw,metric,"yoy",meta):"")+'</p>';
  }
  if (key==="avg") items=Array.from({length:Number(mode.slice(3))},(_,i)=>[year-i,f(get(year-i))]);
  if (key==="vol") {
    items=Array.from({length:5},(_,i)=>{
      const change=annualComparison(row,metric,year-i,scope,aggregate,meta);
      const note=qualityNotes[change.note];
      return [year-i,format(change.value,metric,"yoy",meta)+(note?" ("+prose(...note)+")":"")];
    });
    const note=qualityNotes[measure(row,metric,year,scope,aggregate,mode,meta).note];
    if (note) details+='<p class="quality-note">'+esc(prose(...note))+'</p>';
  }
  return '<p class="multilingual">'+esc(paragraphs(g[2],g[3]))+"</p><p>"+
    items.map(([y,v])=>y+" "+esc(v)).join(" · ")+"</p>"+details;
}
export function timeYears(year,mode) {
  if (mode==="yoy") return [year-1];
  if (mode.startsWith("cagr")) return [year-Number(mode.slice(4))];
  if (mode.startsWith("avg")) return Array.from({length:Number(mode.slice(3))-1},(_,i)=>year-i-1);
  if (mode==="vol") return Array.from({length:5},(_,i)=>year-i-1);
  return [];
}
