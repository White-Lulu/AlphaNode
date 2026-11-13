import {esc,options,modeLabel,observation,finite,scale,unitLabel,modes,format} from "./model.js";
import {prefs,save,pair,locale,countryName,nameOf} from "./i18n.js";
import {metricLabel} from "./glossary.js";

export const initialScreen=()=>({country:[],industry:[],rules:[],preset:"",expression:""});
const builtins={
  returns:{name:["资本回报较高","Higher capital returns"],rules:[
    {metric:"roic",mode:"level",op:"ge",threshold:"12"},{metric:"spread",mode:"level",op:"ge",threshold:"3"}]},
  cash:{name:["现金流与增长","Cash flow and growth"],rules:[
    {metric:"fcfMargin",mode:"level",op:"ge",threshold:"8"},{metric:"revenue",mode:"cagr3",op:"ge",threshold:"5"}]},
  steady:{name:["利润率较稳定","More stable margins"],rules:[
    {metric:"netMargin",mode:"avg5",op:"ge",threshold:"10"},{metric:"netMargin",mode:"vol",op:"le",threshold:"3"}]}
};
const operators={ge:["至少","At least"],le:["至多","At most"],gt:["大于","Greater than"],lt:["小于","Less than"]};
const predicates={ge:(a,b)=>a>=b,le:(a,b)=>a<=b,gt:(a,b)=>a>b,lt:(a,b)=>a<b};
const clone=x=>JSON.parse(JSON.stringify(x));
export function presetOptions(selected) {
  return options([["",pair("自定义筛选","Custom screen")],...Object.entries(builtins).map(([id,v])=>[id,pair(...v.name)]),
    ...prefs.presets.map(p=>[p.id,p.name])],selected);
}
export function presetFor(id) {
  const chosen=builtins[id]??prefs.presets.find(p=>p.id===id);
  if (!chosen) return null;
  const screen={...initialScreen(),...clone(chosen.screen||{rules:chosen.rules}),preset:id};
  delete screen.onlyWatch;
  for (const key of ["country","industry"]) if (!Array.isArray(screen[key])) screen[key]=screen[key]?[screen[key]]:[];
  return screen;
}
export function savePreset(name,screen) {
  const id="saved-"+Date.now();
  const saved=clone(screen);
  delete saved.preset;
  prefs.presets.push({id,name,screen:saved});
  save();
  return id;
}
export function deletePreset(id) {
  prefs.presets=prefs.presets.filter(p=>p.id!==id);
  save();
}
const watchIds=row=>[row.id,...(row.aliases??[]).map(alias=>alias.id)];
export function isWatched(row){return watchIds(row).some(id=>prefs.watch.includes(id));}
export function toggleWatch(row) {
  const ids=watchIds(row);
  prefs.watch=isWatched(row)?prefs.watch.filter(id=>!ids.includes(id)):[...prefs.watch,row.id];
  save();
}
export function issuerFilterOptions({companies,nodes},scheme) {
  const countries=[...new Set(companies.map(row=>row.country).filter(Boolean))].map(id=>({id,label:countryName(id)}))
    .sort((a,b)=>a.label.localeCompare(b.label,locale()));
  const industries=nodes.map(row=>({id:row.id,parent:row.parent,label:(scheme==="isic"?row.id+" ":"")+nameOf(row)}));
  return {countries,industries};
}
export function matchesIndustry(row,industry,lookup) {
  if (!industry.length) return true;
  for (let code=row.parent;code;code=lookup.get(code)?.parent) if (industry.includes(code)) return true;
  return false;
}
export function matchesScreen(row,screen,state,meta,lookup) {
  if (screen.expression&&!state.advancedIds?.has(row.id)) return false;
  if (screen.country.length&&!screen.country.includes(row.country)) return false;
  if (!matchesIndustry(row,screen.industry,lookup)) return false;
  return screen.rules.every(rule=>{
    if (rule.threshold.trim()==="") return true;
    const value=observation(row,rule.metric,state.year,state.scope,state.aggregate,rule.mode,meta);
    return finite(value)&&predicates[rule.op](scale(value,rule.metric,rule.mode,meta),Number(rule.threshold));
  });
}
export function renderRules(element,rules,meta) {
  const metrics=meta.finColumns.map(key=>[key,metricLabel(key,meta)]);
  const periods=Object.keys(modes).map(key=>[key,modeLabel(key)]);
  const ops=Object.entries(operators).map(([key,labels])=>[key,pair(...labels)]);
  element.innerHTML=rules.map((r,i)=>'<div class="rule-line" data-rule="'+i+'"><select data-rule-field="metric" aria-label="'+
    esc(pair("筛选指标","Screen metric"))+'">'+options(metrics,r.metric)+'</select>'+
    '<select data-rule-field="mode" aria-label="'+esc(pair("规则基准","Rule time basis"))+'">'+options(periods,r.mode)+'</select>'+
    '<select data-rule-field="op" aria-label="'+esc(pair("比较方式","Comparison"))+'">'+options(ops,r.op)+'</select>'+
    '<input data-rule-field="threshold" type="number" step="any" inputmode="decimal" value="'+esc(r.threshold)+
    '" aria-label="'+esc(pair("阈值","Threshold"))+'"><small>'+esc(unitLabel(r.metric,r.mode,meta))+'</small>'+
    '<button class="quiet" data-remove-rule type="button">'+esc(pair("移除","Remove"))+'</button></div>').join("");
}
export const tablePageSize=100;
export function pagerHTML(page,total,size,prefix) {
  const pages=Math.max(1,Math.ceil(total/size));
  if (pages===1) return "";
  return '<div class="pager"><button class="quiet" type="button" data-'+prefix+'-page="'+(page-1)+'"'+(page<=0?" disabled":"")+
    '>'+esc(pair("上一页","Previous"))+'</button><span>'+Number(page+1).toLocaleString(locale())+' / '+pages+
    '</span><button class="quiet" type="button" data-'+prefix+'-page="'+(page+1)+'"'+(page>=pages-1?" disabled":"")+
    '>'+esc(pair("下一页","Next"))+'</button></div>';
}
export function peerStats(row,metric,mode,year,scope,countries,companies,meta) {
  const value=observation(row,metric,year,scope,"sum",mode,meta);
  const vals=companies.filter(r=>r.parent===row.parent&&(!countries.length||countries.includes(r.country)))
    .filter(r=>r.qualityFlags?.[year]?.[metric]!=="grossConflict").map(r=>observation(r,metric,year,scope,"sum",mode,meta)).filter(finite).sort((a,b)=>a-b);
  if (!vals.length) return null;
  const quantile=p=>{
    const pos=p*(vals.length-1),i=Math.floor(pos);
    return vals[i]+(pos-i)*((vals[i+1]??vals[i])-vals[i]);
  };
  const lower=vals.filter(v=>v<value).length,same=vals.filter(v=>v===value).length;
  return {n:vals.length,p25:quantile(.25),median:quantile(.5),p75:quantile(.75),
    percentile:vals.length>=5&&finite(value)?(lower+same/2)/vals.length:undefined};
}
