import {pair,locale,prose} from "./i18n.js";
export const $=id=>document.getElementById(id);
const searchBindings=new WeakMap();
export function bindSearch(input,update,render) {
  searchBindings.get(input)?.abort();
  const binding=new AbortController(),options={signal:binding.signal};
  searchBindings.set(input,binding);
  let timer,composing=false;
  binding.signal.addEventListener("abort",()=>clearTimeout(timer),{once:true});
  function queueSearch(afterComposition=false) {
    clearTimeout(timer);
    const value=input.value;
    if (!afterComposition) update(value);
    timer=setTimeout(()=>{
      if (composing) return;
      if (afterComposition) update(input.value);
      else if (input.value!==value) return;
      render();
    },120);
  }
  input.addEventListener("compositionstart",()=>{
    composing=true;
    clearTimeout(timer);
  },options);
  input.addEventListener("compositionend",()=>{
    composing=false;
    queueSearch(true);
  },options);
  input.addEventListener("input",event=>{
    // A trailing input can still report isComposing after compositionend.
    if (!composing&&!event.isComposing) queueSearch();
  },options);
}
export const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const finite=Number.isFinite;
export function downloadCSV(rows,filename) {
  const csv=value=>'"'+String(typeof value==="string"&&/^[=+@-]/.test(value)?"'"+value:value??"").replaceAll('"','""')+'"';
  const url=URL.createObjectURL(new Blob(["\ufeff"+rows.map(row=>row.map(csv).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const modes={
  level:["年度值","Annual value"],yoy:["同比增速／变化","YoY change"],vol:["近五年同比波动","Five-year YoY volatility"],
  cagr3:["3 年复合增速","3-year CAGR"],cagr5:["5 年复合增速","5-year CAGR"],cagr10:["10 年复合增速","10-year CAGR"],
  avg3:["3 年均值","3-year average"],avg5:["5 年均值","5-year average"],avg10:["10 年均值","10-year average"]
};
export const modeLabel=mode=>pair(...(modes[mode]||modes.level));
export const modeTerm=mode=>mode.startsWith("cagr")?"cagr":mode.startsWith("avg")?"avg":mode;
const assets=new Map();
function load(path) {
  if (!assets.has(path)) assets.set(path,fetch(path+".json").then(r=>{
    if (!r.ok) throw new Error(path+".json (HTTP "+r.status+")");
    return r.json();
  }).catch(error=>{assets.delete(path);throw error;}));
  return assets.get(path);
}
export const api=name=>load("data/"+name);
export const research=name=>load("research/"+name);
export function annual(row, metric, year, scope, aggregate) {
  if (row.kind==="industry") return row.agg?.[scope]?.[year]?.[aggregate]?.[metric];
  if (row.kind==="company") return scope==="world"||row.region===scope ? row.finance?.[year]?.[metric] : undefined;
  return row.values?.[scope]?.[year]?.[metric];
}
const differences=new Set(["pct","pp","index","ratio","score"]);
const earnings=new Set(["net","eva","nopat","grossProfit"]);
export const qualityNotes={
  thinCapital:["权益或投入资本不足总资产的 1%，该比率对分母敏感。","Equity or invested capital is below 1% of assets. The ratio is sensitive to its denominator."],
  grossConflict:["毛利率超过 105%，请核对收入与成本字段。","Gross margin exceeds 105%. Check the revenue and cost lines."],
  currency:["财报原币变更。","The reported currency changed."],
  fiscal:["财年间隔不在可比区间。","The fiscal-year gap falls outside the comparability window."],
  sign:["基数非正或当期金额为负。","The base is non-positive or the current amount is negative."],
  lowBase:["大幅变化且上年基数偏小。","Large change from a small prior-year base."],
  noPair:["两年缺少共同的可比样本。","The two years have no common comparable sample."],
  spike:["变化幅度较大，可查看原值及披露。","Large change. See the underlying values and filings."],
  volSparse:["近五年不足三次有效同比。","Fewer than three usable YoY changes in the last five years."],
  volSensitive:["窗口内含需要查看说明的同比。","The window contains YoY changes with data notes."]
};
export function annualComparison(row,metric,year,scope,aggregate,meta) {
  let before=annual(row,metric,year-1,scope,aggregate);
  let after=annual(row,metric,year,scope,aggregate);
  let revenue=annual(row,"revenue",year-1,scope,aggregate);
  let count;
  if (row.kind==="industry"&&meta.schemaVersion>=2) {
    const paired=row.agg?.[scope]?.[year]?.comparable?.[metric]?.[aggregate==="sum"?0:1];
    if (!paired) return {before,after,note:finite(before)&&finite(after)?"noPair":undefined};
    [before,after,count,revenue]=paired;
  }
  const result={before,after,count};
  if (!finite(before)||!finite(after)) return result;
  const unit=meta.metrics[metric][1],difference=differences.has(unit);
  const raw=difference?after-before:before>0?after/before-1:undefined;
  const comparability=row.comparisonNotes?.[year];
  const flags=[row.qualityFlags?.[year-1]?.[metric],row.qualityFlags?.[year]?.[metric]];
  if (comparability) return {...result,raw,note:comparability};
  if (flags.includes("grossConflict")) return {...result,raw,note:"grossConflict"};
  if (!difference&&(before<=0||after<0)) return {...result,raw,note:"sign"};
  if (!difference&&Math.abs(raw)>=3) {
    const levels=meta.years.map(y=>annual(row,metric,y,scope,aggregate)).filter(v=>finite(v)&&v>0).sort((a,b)=>a-b);
    const reference=earnings.has(metric)&&revenue>0 ? revenue : levels.length>=3 ? levels[Math.floor(levels.length/2)] : 0;
    const floor=.01*reference;
    if (before<floor) return {...result,raw,note:"lowBase"};
  }
  const threshold=unit==="index"?2000:unit==="ratio"||unit==="score"?1:difference ? .5 : 3;
  return {...result,raw,value:raw,note:flags.includes("thinCapital")?"thinCapital":Math.abs(raw)>=threshold?"spike":undefined};
}
export function annualDelta(row,metric,year,scope,aggregate,meta) {
  return annualComparison(row,metric,year,scope,aggregate,meta).value;
}
export function observation(row,metric,year,scope,aggregate,mode,meta) {
  return measure(row,metric,year,scope,aggregate,mode,meta).value;
}
export function measure(row,metric,year,scope,aggregate,mode,meta) {
  const get=y=>annual(row,metric,y,scope,aggregate);
  if (mode==="level") return {value:get(year),note:row.qualityFlags?.[year]?.[metric]};
  if (mode==="yoy") return annualComparison(row,metric,year,scope,aggregate,meta);
  if (mode.startsWith("cagr")) {
    const n=Number(mode.slice(4));
    const a=get(year),b=get(year-n);
    const comparable=!Object.keys(row.comparisonNotes||{}).some(y=>Number(y)>year-n&&Number(y)<=year);
    return {value:comparable&&!differences.has(meta.metrics[metric][1])&&a>0&&b>0?(a/b)**(1/n)-1:undefined};
  }
  if (mode.startsWith("avg")) {
    const values=Array.from({length:Number(mode.slice(3))},(_,i)=>get(year-i));
    return {value:values.every(finite)?values.reduce((sum,v)=>sum+v,0)/values.length:undefined};
  }
  if (mode!=="vol") return {};
  const comparisons=Array.from({length:5},(_,i)=>annualComparison(row,metric,year-i,scope,aggregate,meta));
  const deltas=comparisons.map(change=>change.value).filter(finite);
  const flagged=comparisons.some(change=>change.note);
  if (deltas.length<3) return {note:deltas.length||flagged?"volSparse":undefined};
  const mean=deltas.reduce((s,x)=>s+x,0)/deltas.length;
  return {value:Math.sqrt(deltas.reduce((s,x)=>s+(x-mean)**2,0)/(deltas.length-1)),note:flagged?"volSensitive":undefined};
}
export function resultUnit(metric,mode,meta) {
  const unit=meta.metrics[metric][1];
  if (mode==="level"||mode.startsWith("avg")) return unit;
  if (mode.startsWith("cagr")) return "pct";
  if (unit==="pct"||unit==="pp") return "pp";
  if (unit==="index"||unit==="ratio"||unit==="score") return unit;
  return "pct";
}
const units={
  score:["分","score"],pct:["%","%"],pp:["百分点","pp"],index:["点","points"],ratio:["倍","×"],count:["个","count"],
  people:["万人","10k persons"],vehicles:["万辆","10k vehicles"],mwh:["TWh","TWh"],
  intMoney:["亿国际元","International $ × 100m"],
  usdPerCapita:["美元／人","USD/person"],months:["月","months"],fx:["本币／美元","LCU/USD"],
  intPerCapita:["国际元／人","International $/person"],intPerWorker:["国际元／就业者","International $/worker"],
  usdPerBarrel:["美元／桶","USD/barrel"],usdPerMmbtu:["美元／百万英热单位","USD/MMBtu"],
  gasprice:["美元／加仑","USD/gal"],gasvol:["千桶／日","kb/d"]
};
export function unitLabel(metric,mode,meta,currency="USD") {
  const unit=resultUnit(metric,mode,meta);
  if (unit==="money") return pair({USD:"亿美元",EUR:"亿欧元",CNY:"亿元人民币"}[currency]??"亿 "+currency,currency+" × 100m");
  return pair(...units[unit]);
}
export function heatExtent(values) {
  values.sort((a,b)=>a-b);
  const lo=values[Math.floor((values.length-1)*.05)], hi=values[Math.ceil((values.length-1)*.95)];
  return hi>lo?[lo,hi]:null;
}
export function heatColor(value,range,reversed=false,base="") {
  if (!range||!finite(value)) return "";
  let f=Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0])));
  if (reversed) f=1-f;
  if (Math.abs(f-.5)<.05) return "";
  const tone="var("+(f>.5?"--heat-hi,223,70,77":"--heat-lo,57,112,216")+")";
  const strength=.05+Math.abs(f-.5)*.40;
  if (base) return "color-mix(in srgb,rgb("+tone+") "+(strength*100).toFixed(1)+"%,"+base+")";
  return "rgba("+tone+","+strength.toFixed(3)+")";
}
export function scale(value,metric,mode,meta) {
  return value/({money:1e8,intMoney:1e8,people:1e4,vehicles:1e4,mwh:1e6,pct:.01,pp:.01}[resultUnit(metric,mode,meta)]??1);
}
export function format(value,metric,mode,meta,axis=false) {
  if (!finite(value)) return "—";
  const unit=resultUnit(metric,mode,meta),n=scale(value,metric,mode,meta);
  const options=axis?{notation:"compact",maximumFractionDigits:1}:
    unit==="index"||unit==="count"?{maximumFractionDigits:0}:
    unit==="pct"||unit==="pp"?{minimumFractionDigits:2,maximumFractionDigits:2}:
    Math.abs(n)>0&&Math.abs(n)<.01?{maximumSignificantDigits:2}:{maximumFractionDigits:2};
  return new Intl.NumberFormat(locale(),options).format(n)+(unit==="pct"?"%":unit==="pp"?" pp":"");
}
export function roundInput(v) {
  if (v==null) return prose("缺报","Unavailable");
  return typeof v==="number"?new Intl.NumberFormat(locale(),{maximumFractionDigits:6}).format(v):String(v);
}
export function link(url,label) {
  if (typeof url!=="string"||!/^https?:\/\//i.test(url)) return "";
  return '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
}
export function host(url) {
  try {return new URL(url).hostname.replace(/^www\./,"");} catch {return "";}
}
export function options(entries,selected) {
  return entries.map(([k,v])=>'<option value="'+esc(k)+'"'+(k===selected?" selected":"")+'>'+esc(v)+'</option>').join("");
}
