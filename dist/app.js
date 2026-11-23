import {$,bindSearch,downloadCSV,esc,api,research,modes,modeLabel,modeTerm,options,finite,annual,measure,qualityNotes,observation,format,unitLabel,link,scale,heatExtent,heatColor} from "./model.js";
import {applyStatic,setLanguage,prefs,save,languages,scopeLabel,countryName,companyLocation,locale,pair,prose,nameOf,companyNames,paragraphs} from "./i18n.js";
import {bindGlossary,glossary,metricLabel,renderGlossarySettings,setAllHints} from "./glossary.js";
import {renderCharts,redraw,insertChartBelow,moveChartInRows} from "./chart.js";
import {initialScreen,matchesScreen,matchesIndustry,issuerFilterOptions,renderRules,presetOptions,presetFor,savePreset,deletePreset,isWatched,toggleWatch,pagerHTML,peerStats,tablePageSize} from "./screener.js";
import {renderDirectory} from "./directory.js";
import {renderAdvanced,requestAdvanced} from "./advanced.js";
import {renderPeerRadar,repaintPeerRadar,radarMetricOptions,selectedRadarMetrics} from "./peers.js";
import {companyEvidence,seriesEvidence,benchmarkEvidence,aggregateEvidence,timeEvidence,timeYears} from "./evidence.js";
import {wireLayout,updateFilterLayout,refreshSplitters,columnResizeHandle} from "./layout.js";
import {renderStockPrice,disposeStockPrice} from "./stock-price.js";
import {wireCollection,renderCollection,loadAISettings,resetAISettings} from "./collection.js";
import {openSaveChart,repaintSavedChart,getWorkbenchChart,persistWorkbench} from "./saved-charts.js";
import {wireWatchlist,renderWatchlist} from "./watchlist.js";
import {renderFilterPicker} from "./filter-picker.js";

const state={module:"atlas",tab:"finance",source:"unido",scope:"world",year:null,aggregate:"sum",mode:"level",region:"global",heat:prefs.heat!==false,classification:"isic",
  startLevel:[1,2,3,4].includes(prefs.startLevel)?prefs.startLevel:1,
  search:"",sort:"revenue",desc:true,detail:null,expanded:new Set(),charts:[],active:1,nextChart:3,screen:initialScreen(),page:0,
  coverage:{finance:50,screen:100},located:null,profile:null,advancedIds:null,advancedError:null,advancedPending:false};
const records=new Map(),trees=new Map(),industryViews=new Map(),gridBody=$("grid-body");
let meta,benchmark,directory,hideTip=()=>{},tabToken=0,advancedToken=0,classificationToken=0,profileTrigger;
const benchmarkPeriod={mode:"level",years:new Map()};
const statisticsPeriods=new Map(),statisticsCoverage=new Map();
let financialPeriod;
const paneOrder={atlas:["data","trends"],collection:["data","charts"]};
const graphModules=new Set(["chains","chain-values"]);
const graphModuleFromHash=()=>graphModules.has(location.hash.slice(1))?location.hash.slice(1):"";
let lastGraphModule="chains";
const phoneLayout=matchMedia("(max-width:700px), (max-width:1000px) and (pointer:coarse)");
const sources={
  unido:["UNIDO · 工业调查","UNIDO · Industrial survey"],
  ama:["联合国 · 国民账户","United Nations · National accounts"],
  euro:["Eurostat · 欧盟企业","Eurostat · EU enterprises"],
  nbs:["国家统计局 · 规上工业","China NBS · Industrial enterprises"],
  macro:["OpenBB · 利率","OpenBB · Interest rates"]
};
const notes={
  finance:["上市公司样本按主要经营归属归类，金额为现价美元。","Listed company sample by issuer economy. Amounts are in current USD."],
  screen:["各规则同时满足。点公司名称打开十年财报，点数值查来源。","Rules are combined with AND. Open a company name for financial history or a value for evidence."],
  benchmark:["Damodaran 原始行业和地区定义，参考年对应次年年初快照。","Damodaran’s industry and region definitions. Reference years correspond to the early following-year snapshot."],
  markets:["按各行定义的产品和地理市场统计。","Product and geographic market definitions vary by series."],
  unido:["地区汇总覆盖以实际报告经济体为准。","Regional totals cover economies that actually reported."],
  ama:["海外按世界与中国大陆序列差额计算。","Outside mainland China is the published world total less mainland China."],
  euro:["欧盟 27 国子集，金额为欧元。","EU-27 subset, with amounts in EUR."],
  nbs:["中国大陆规模以上工业，金额为人民币。","Industrial enterprises above the designated size in mainland China. Amounts are in CNY."],
  macro:["美国固定期限国债与欧元区 AAA 国债票面收益率，采用年末最后一个同日有效观测。","US constant-maturity and euro area AAA government par yields. The last jointly available observation in each calendar year is used."]
};
const providerLabels={sec:["SEC","SEC"],esef:["ESEF","ESEF"],cn:["A 股","A-share"],issuer:["公司披露","Company filing"],hk:["港股财报","Hong Kong filings"]};
const preferred=["revenue","net","grossMargin","netMargin","roe","roic","spread","eva","fcfMargin"];
const presets={
  core:["核心","Core",preferred],
  profit:["利润","Profitability",["revenue","grossProfit","ebit","net","grossMargin","operatingMargin","netMargin","roa","roe","roic"]],
  cash:["现金流","Cash flow",["revenue","ocf","capex","fcf","fcfMargin","cashConversion","ebitda","ebitdaMargin","capitalIntensity"]],
  risk:["偿债与资本","Solvency and capital",["assets","debtAssets","currentRatio","quickRatio","interestCover","roic","wacc","spread","eva"]],
  quality:["财务诊断","Financial diagnostics",["netMargin","assetTurnover","equityMultiplier","dupontRoe","altmanZ2","zmijewski"]]
};
const themeOptions=[["hm-slate-soft","石板蓝 · 标准"],["hm-cobalt-soft","湖蓝 · 标准"],["hm-cobalt-deep","钴蓝 · 标准"],["hm-slate","石板蓝 · 高对比亮"],["hm-cobalt","钴蓝 · 高对比亮"],["hm-slate-dark","石板蓝 · 高对比暗"],["hm-slate-blue","湖蓝 · 高对比暗"],["hm-vscode-hc","纯黑 · 高对比暗"]];
const profileGroups={
  income:["损益","Income",["revenue","grossProfit","ebit","net","nopat","ebitda"]],
  balance:["资产与偿债","Assets and solvency",["assets","assetTurnover","debtAssets","currentRatio","quickRatio","interestCover"]],
  cash:["现金流","Cash flow",["ocf","capex","fcf","fcfMargin","cashConversion","capitalIntensity"]],
  ratios:["盈利与回报","Margins and returns",["grossMargin","operatingMargin","netMargin","roa","roe","roic","wacc","spread","eva","researchIntensity"]],
  quality:["财务诊断","Financial diagnostics",["netMargin","assetTurnover","equityMultiplier","dupontRoe","altmanZ2","zmijewski"]]
};
const number=n=>Number(n).toLocaleString(locale());
const activeScope=()=>state.tab==="benchmark"?state.region:state.scope;
const periodOptions=(selected,keys=Object.keys(modes))=>options(keys.map(k=>[k,modeLabel(k)]),selected);
const visibleInScope=(row,scope)=>scope==="world"||row.region===scope;
const industryView=(scheme=state.classification)=>industryViews.get(scheme);
const issuerFor=id=>industryView().issuers.get(id);
const profileIssuer=profile=>industryView(profile.source?.scheme??state.classification).issuers.get(profile.id);
const classificationTabs=new Set(["finance","screen"]);
const outlineLevel=row=>row.kind==="company"?4:row.level??(row.parent?Math.min(4,(records.get(row.parent)?.level??1)+1):1);

function register(key,items,tree=true) {
  const children=new Map();
  for (const r of items) {
    if (r.kind!=="company") records.set(r.id,r);
    if (tree&&r.parent) {
      if (!children.has(r.parent)) children.set(r.parent,[]);
      children.get(r.parent).push(r.id);
    }
  }
  trees.set(key,{items,children});
}
function registerIndustryView(scheme,taxonomy,companies,aggregates,coverage) {
  const nodes=taxonomy.map(row=>({...row,scheme,kind:"industry",currency:"USD",agg:aggregates[row.id]}));
  const issuers=new Map(companies.map(row=>[row.id,row]));
  for (const row of companies) for (const alias of row.aliases??[]) issuers.set(alias.id,row);
  industryViews.set(scheme,{nodes,companies,issuers,coverage});
  register("finance-"+scheme,[...nodes,...companies]);
  register("screen-"+scheme,companies,false);
}
async function loadEconomicData(financialMeta) {
  const data=await api("economic-functions");
  if (data.version!==1||data.builtFrom!==financialMeta.built) {
    throw new Error("The economic-function dataset does not match the financial dataset.");
  }
  return data;
}
async function loadEconomicView() {
  if (industryViews.has("economic")) return;
  const data=await loadEconomicData(meta);
  if (industryViews.has("economic")) return;
  const original=industryView("isic").companies;
  const companies=[],byId=new Map();
  for (const row of original) {
    const classification=data.assignments[row.id];
    if (!classification) throw new Error("Missing economic-function assignment: "+row.id);
    if (classification.canonical) continue;
    const classified={...row,parent:classification.group,originalParent:row.parent,classification,aliases:[]};
    companies.push(classified);
    byId.set(row.id,classified);
  }
  for (const row of original) {
    const canonical=data.assignments[row.id].canonical;
    if (!canonical) continue;
    const issuer=byId.get(canonical);
    issuer.aliases.push({id:row.id,code:row.code,name:row.name,en:row.en});
    if (!issuer.zh&&/\p{Script=Han}/u.test(row.name)) issuer.zh=row.name;
  }
  registerIndustryView("economic",data.taxonomy.filter(node=>data.aggregates[node.id]),companies,data.aggregates,data.coverage);
}
function industryPath(id) {
  const path=[];
  for (let node=records.get(id);node;node=records.get(node.parent)) path.unshift(node);
  return path;
}
function registerStats(key,rows) {
  const coverage=new Map();
  for (const row of rows) for (const [scope,annual] of Object.entries(row.values)) {
    if (!coverage.has(scope)) coverage.set(scope,new Set());
    for (const [year,values] of Object.entries(annual)) {
      if (Object.keys(values).length) coverage.get(scope).add(Number(year));
    }
  }
  statisticsCoverage.set(key,coverage);
  if (key==="ama"||key==="macro") {register(key,rows.map(r=>({...r,kind:"stat"})),false);return;}
  const idOf=code=>key+"-class-"+code,groups=new Map(),extras=[];
  for (const raw of rows) {
    const code=raw.parent;
    let group=records.get(code);
    const row={...raw,kind:"stat",isic:code,parent:group?idOf(code):null};
    if (!group) {extras.push(row);continue;}
    if (key!=="nbs") Object.assign(row,{id:idOf(code),auditId:raw.id,parent:group.parent?idOf(group.parent):null,
      code,level:group.level,kind:"stat-group",en:raw.name===group.name?group.en:raw.name});
    else extras.push(row);
    while (group) {
      const id=idOf(group.id),parent=group.parent?idOf(group.parent):null;
      const old=groups.get(id)??{...group,id,parent,kind:"stat-group",scopes:[],currency:raw.currency,source:raw.source};
      const item=key!=="nbs"&&group.id===code?{...old,...row}:old;
      item.scopes=[...new Set([...old.scopes,...row.scopes])];
      groups.set(id,item);group=records.get(group.parent);
    }
  }
  register(key,[...groups.values(),...extras]);
}
async function loadStatistics(key) {
  if (!trees.has(key)) registerStats(key,await api(key));
}
async function loadBenchmark() {
  if (!benchmark) {
    benchmark=await research("benchmark");
    register("benchmark",benchmark.rows,false);
  }
}
function registerMarkets(markets) {
  const groups=new Map(),groupId=id=>"market-class-"+id;
  const rows=markets.map(raw=>{
    const path=industryPath(raw.parent);
    for (const node of path) {
      const id=groupId(node.id);
      const group=groups.get(id)??{...node,id,parent:node.parent?groupId(node.parent):null,kind:"market-group",scopes:[]};
      group.scopes=[...new Set([...group.scopes,...raw.scopes])];
      groups.set(id,group);
    }
    return {...raw,kind:"market",isic:raw.parent,parent:path.length?groupId(raw.parent):null};
  });
  register("markets",[...groups.values(),...rows]);
}

const financialColumns=view=>["finance","screen","watchlist"].includes(view);
function allColumns(view=state.tab) {
  if (financialColumns(view)) return meta.finColumns;
  if (view==="benchmark") return benchmark?.columns??["firms","wacc"];
  if (view==="markets") return meta.marketColumns;
  return meta.stats[state.source]?.columns??[];
}
function columnKey(view=state.tab){return view==="statistics"?state.source:view;}
function columns(view=state.tab) {
  const all=allColumns(view),saved=prefs.columns[columnKey(view)]?.filter(k=>all.includes(k));
  return saved?.length?saved:financialColumns(view)?preferred.filter(k=>all.includes(k)):all;
}
function currency(){return state.tab==="statistics"?({euro:"EUR",nbs:"CNY"}[state.source]??"USD"):"USD";}
function value(row,key,year=state.year){return observation(row,key,year,activeScope(),state.aggregate,state.mode,meta);}
function visible(row) {
  if (!activeScope()) return false;
  if (row.kind==="benchmark") return Boolean(row.values?.[state.region]?.[state.year]);
  if (row.kind==="industry") return row.scheme!=="economic"||Boolean(row.agg?.[activeScope()]);
  if (row.kind==="company") return visibleInScope(row,state.scope)&&
    (state.tab!=="screen"||matchesScreen(row,state.screen,state,meta,records));
  return row.scopes?.includes(activeScope());
}
function compare(a,b) {
  if (state.sort!=="name") {
    const av=value(a,state.sort),bv=value(b,state.sort);
    if (finite(av)!==finite(bv)) return finite(av)?-1:1;
    if (finite(av)&&av!==bv) return state.desc?bv-av:av-bv;
  }
  const d=(a.code||nameOf(a)).localeCompare(b.code||nameOf(b),locale(),{numeric:true});
  return state.sort==="name"&&state.desc?-d:d;
}
function representatives(companies,percentage) {
  const groups=new Map(),chosen=new Set();
  for (const row of companies) {
    if (!groups.has(row.parent)) groups.set(row.parent,[]);
    const year=meta.years.findLast(y=>y<=state.year&&row.finance[y]?.revenue>0);
    groups.get(row.parent).push({row,year:year??0,revenue:row.finance[year]?.revenue??0});
  }
  for (const group of groups.values()) {
    group.sort((a,b)=>b.revenue-a.revenue||b.year-a.year||a.row.code.localeCompare(b.row.code));
    group.slice(0,Math.ceil(group.length*percentage/100)).forEach(({row})=>chosen.add(row.id));
  }
  return chosen;
}
function visibleScreenEntries(entries) {
  if (state.tab!=="screen"||state.coverage.screen===100||state.search.trim()) return entries;
  const chosen=representatives(entries.map(({row})=>row),state.coverage.screen);
  return entries.filter(({row})=>chosen.has(row.id));
}
function matchesSearch(row,q) {
  const terms=[row.name,row.en,row.code,row.id,row.parent,...(row.kind==="company"?companyNames(row):[])];
  if (state.classification==="economic"&&classificationTabs.has(state.tab)) {
    terms.push(...industryPath(row.kind==="company"?row.parent:row.id).flatMap(node=>[node.name,node.en]));
    for (const alias of row.aliases??[]) terms.push(alias.code,alias.name,alias.en);
  }
  return terms.some(term=>String(term||"").toLowerCase().includes(q));
}
function outline() {
  const key=classificationTabs.has(state.tab)?state.tab+"-"+state.classification:state.tab==="statistics"?state.source:state.tab;
  const tree=trees.get(key);
  if (!tree) return [];
  const hierarchy=!["screen","benchmark"].includes(state.tab);
  const available=new Map(tree.items.filter(row=>visible(row)&&(state.tab!=="finance"||outlineLevel(row)>=state.startLevel))
    .map(row=>[row.id,row])),found=new Set();
  const q=state.search.trim().toLowerCase();
  const chosen=state.tab==="finance"&&!q&&state.coverage.finance<100?
    representatives([...available.values()].filter(row=>row.kind==="company"),state.coverage.finance):null;
  for (const row of available.values()) {
    if (chosen&&row.kind==="company"&&!chosen.has(row.id)) continue;
    if (q&&!matchesSearch(row,q)) continue;
    found.add(row.id);
    let parent=hierarchy?row.parent:null;
    while (available.has(parent)) {found.add(parent);parent=available.get(parent).parent;}
  }
  const output=[];
  function visit(row,depth,tier) {
    const children=(tree.children.get(row.id)??[]).filter(id=>found.has(id)).map(id=>available.get(id)).sort(compare);
    const open=children.length>0&&(state.expanded.has(row.id)||Boolean(q));
    output.push({row,depth,open,children:children.length,tier});
    if (!open) return;
    const ranks=new Map();
    if (row.kind==="industry"&&row.level===3) {
      const eligible=(tree.children.get(row.id)??[]).map(id=>available.get(id))
        .filter(c=>c?.kind==="company"&&finite(c.finance[state.year]?.netMargin))
        .sort((a,b)=>b.finance[state.year].netMargin-a.finance[state.year].netMargin);
      if (eligible.length>=3) eligible.forEach((r,i)=>ranks.set(r.id,i<Math.ceil(eligible.length/3)?"high":
        i>=Math.ceil(2*eligible.length/3)?"low":"mid"));
    }
    children.forEach(c=>visit(c,depth+1,ranks.get(c.id)));
  }
  [...found].map(id=>available.get(id)).filter(r=>!hierarchy||!found.has(r.parent)).sort(compare).forEach(r=>visit(r,0));
  return output;
}
function heatRanges(entries,cols,read=(entry,col)=>value(entry.row,col)) {
  const result=new Map();
  if (!state.heat) return result;
  for (const col of cols) {
    const groups=new Map();
    for (const entry of entries) {
      const {row,depth}=entry,v=read(entry,col);
      if (!finite(v)) continue;
      const level=row.kind==="company"?"company":depth;
      if (!groups.has(level)) groups.set(level,[]);
      groups.get(level).push(v);
    }
    for (const [level,arr] of groups) {
      const range=heatExtent(arr);
      if (range) result.set(col+"-"+level,range);
    }
  }
  return result;
}
function heat(v,range,metric,mode=state.mode) {
  if (!range) return "";
  if (["hhi","elasticity","capitalIntensity","researchIntensity","firms","currentRatio","quickRatio","equityMultiplier","treasury2","treasury10","yieldSlope"].includes(metric)&&mode!=="vol") return "";
  const reversed=mode==="vol"||((mode==="level"||mode.startsWith("avg"))&&["wacc","debtAssets","zmijewski"].includes(metric));
  const color=heatColor(v,range,reversed);
  return color?' style="background-color:'+color+'"':"";
}
function status(text){$("status").textContent=text;}
function rowSub(row) {
  if (row.kind==="company") return [countryName(row.country),pair(...(providerLabels[row.provider]??[row.provider])),
    state.tab==="screen"?nameOf(records.get(row.parent)):null,...(row.aliases??[]).map(alias=>alias.code)].filter(Boolean).join(" · ");
  if (row.kind==="industry") {
    const counts=row.agg?.[state.scope]?.[state.year]?.counts?.revenue,n=counts?.[state.aggregate==="sum"?0:1];
    return n?pair("营收样本 "+number(n)+" 家","Revenue sample n = "+number(n)):
      row.scheme==="economic"?pair("产业链功能","Economic function"):"ISIC Rev.4";
  }
  const code=row.isic||(row.parent&&records.get(row.parent)?.kind==="industry"?row.parent:null);
  const src=state.tab==="statistics"?pair(...sources[state.source]):row.source;
  return [code&&!row.code?"ISIC "+code:null,src].filter(Boolean).join(" · ");
}
function icon(className,attr,title,symbol,extra="") {
  return '<button type="button" class="'+className+'" '+attr+' title="'+esc(title)+'" aria-label="'+esc(title)+'" '+extra+'>'+symbol+'</button>';
}
function tableNote(scope) {
  const key=state.tab==="statistics"?state.source:state.tab;
  const note=[...notes[key]];
  if (state.classification==="economic"&&classificationTabs.has(key)) {
    note[0]+=" 按主要经济功能分组，同一合并主体只计一次。";
    note[1]+=" Grouped by primary economic function, with one observation per consolidated issuer.";
  }
  if (state.tab==="statistics"&&scope&&statisticsCoverage.has(key)&&!statisticsYears().length) {
    note[0]+=" 该统计来源不覆盖所选地域。";
    note[1]+=" This source has no observations for the selected scope.";
  }
  const coverage=state.coverage[key];
  if (coverage<100&&!state.search.trim()) {
    note[0]+=" 每组按最近可用营收展示 "+coverage+"% 的企业。";
    note[1]+=" Showing "+coverage+"% per industry group, prioritized by latest available revenue.";
  }
  if (key==="benchmark") {
    const available=benchmark?.sources[scope]?.[state.year];
    if (!available) {
      note[0]+=" 所选地区没有该参考年的原表。";
      note[1]+=" The provider has no workbook for this region and reference year.";
    } else if (!available.eva) {
      note[0]+=" 该年的资本回报表缺档或日期未通过校验。ROE、ROIC、回报利差和 EVA 留空。";
      note[1]+=" No verified returns workbook for this year. ROE, ROIC, the return spread and EVA are blank.";
    } else if (!available.margin || !available.wacc) {
      note[0]+=" 所选地区和参考年仅有部分原表。";
      note[1]+=" Some workbooks are missing for this region and reference year.";
    }
  }
  return prose(...note);
}
function renderTableContext(scope) {
  const label=(id,value)=>[...$(id).options].find(option=>option.value===String(value))?.textContent;
  const tags=[
    Number.isFinite(state.year)&&prose(state.year+" 年",String(state.year)),
    classificationTabs.has(state.tab)&&label("classification",state.classification),
    state.tab==="finance"&&label("start-level",state.startLevel),
    modeLabel(state.mode),
    state.tab==="finance"&&label("aggregate",state.aggregate),
    state.tab in state.coverage&&pair("展示企业 "+state.coverage[state.tab]+"%",state.coverage[state.tab]+"% of companies")
  ];
  const context=$("table-context");
  const html='<span id="scope-label">'+esc(scopeLabel(scope))+'</span>'+
    tags.filter(Boolean).map(text=>'<span>'+esc(text)+'</span>').join("");
  if (context.innerHTML!==html) context.innerHTML=html;
}
function renderTable(targetId=null) {
  if (!meta||state.tab==="directory") return;
  hideTip();
  const all=visibleScreenEntries(outline()),cols=columns(),scope=activeScope(),flatScreen=state.tab==="screen";
  renderTableContext(scope);
  $("table-note").textContent=tableNote(scope);
  const targetIndex=targetId===null?-1:all.findIndex(({row})=>row.id===targetId);
  if (targetIndex>=0) state.page=Math.floor(targetIndex/tablePageSize);
  state.page=Math.min(state.page,Math.max(0,Math.ceil(all.length/tablePageSize)-1));
  const entries=all.slice(state.page*tablePageSize,(state.page+1)*tablePageSize),ranges=heatRanges(all,cols);
  function heading(k,name,unit) {
    const sort=state.sort===k?(state.desc?"descending":"ascending"):"none";
    const text='<span'+(k!=="name"&&prefs.hints[k]!==false?' data-term-hover="'+esc(k)+'"':"")+">"+esc(name)+
      (sort==="descending"?" ↓":sort==="ascending"?" ↑":" ↕")+"</span>";
    return '<th scope="col" aria-sort="'+sort+'">'+
      (k==="name"?columnResizeHandle("name-column","grid",pair("调整行业／企业列宽","Resize industry/company column")):"")+
      '<div class="grid-head-wrap"><button type="button" data-sort="'+k+'">'+text+
      (unit?'<span class="unit">'+esc(unit)+'</span>':"")+'</button></div></th>';
  }
  $("grid-head").innerHTML="<tr>"+heading("name",pair("行业／企业","Industry / company"),null)+
    cols.map(k=>heading(k,metricLabel(k,meta),unitLabel(k,state.mode,meta,currency()))).join("")+"</tr>";
  const detail=state.detail;
  gridBody.innerHTML=entries.map(({row,depth,children,open,tier})=>{
    const label=nameOf(row),company=row.kind==="company",inline=detail?.id===row.id;
    const selected=inline?detail:state.profile?.id===row.id?state.profile:null;
    const eligible=allColumns().some(k=>meta.years.some(y=>finite(annual(row,k,y,scope,state.aggregate))));
    const tierLabels={high:["上","High"],mid:["中","Mid"],low:["下","Low"]};
    const tierHtml=tier?'<span class="tier '+tier+'" title="'+esc(pair("同组净利率三分位","Net-margin tercile within industry group"))+'">'+esc(pair(...tierLabels[tier]))+'</span>':"";
    const disclosure=children?icon("chevron","data-expand",pair(open?"收起":"展开",open?"Collapse":"Expand")+" "+label,open?"▾":"▸",
      'aria-expanded="'+open+'"'):flatScreen?"":'<button class="chevron" disabled aria-hidden="true" tabindex="-1">·</button>';
    const watched=company&&isWatched(row);
    const watch=company?icon("star","data-watch",pair("切换自选","Toggle watchlist"),watched?"★":"☆",
      'aria-pressed="'+watched+'"'):"";
    const first='<td><div class="name-cell" style="--depth:'+depth+'">'+disclosure+
      '<button class="row-label" type="button" '+(company?'data-open-profile="'+esc(row.id)+'"':children?'data-expand':"data-row-label")+
      ' title="'+esc(label)+'"><span class="name-main">'+(row.code?'<span class="code">'+esc(row.code)+'</span>':"")+
      '<span class="row-name"><b>'+esc(label)+'</b>'+tierHtml+'</span></span><small>'+esc(rowSub(row))+'</small></button>'+watch+
      icon("pin","data-pin",pair("添加到趋势图","Add to chart")+" "+label,"＋",eligible?"":"disabled")+'</div></td>';
    const cells=cols.map(k=>{
      const {value:v,note}=measure(row,k,state.year,scope,state.aggregate,state.mode,meta),warning=qualityNotes[note];
      if (!finite(v)&&!warning) return '<td><span class="missing">—</span></td>';
      const tint=finite(v)?heat(v,ranges.get(k+"-"+(company?"company":depth)),k):"";
      return '<td'+tint+'><button type="button" class="cell-value" data-metric="'+k+
        '" aria-expanded="'+Boolean(selected?.metric===k&&selected.year===state.year)+'" title="'+
        esc(warning?prose(...warning):pair("展开来源与计算","Show source and calculation"))+'">'+format(v,k,state.mode,meta)+
        (warning?'<sup class="data-marker" aria-label="'+esc(pair("有数据说明","Data note available"))+'">!</sup>':"")+'</button></td>';
    }).join("");
    const level=["finance","statistics","markets"].includes(state.tab)?' data-outline-level="'+outlineLevel(row)+'"':"";
    return '<tr data-row="'+esc(row.id)+'"'+level+' class="'+row.kind+" level-"+(row.level||0)+
      (selected?" selected":"")+(state.located===row.id?" located":"")+'">'+first+cells+'</tr>'+
      (inline?'<tr class="detail-row"><td colspan="'+(cols.length+1)+'"><div class="detail-inner" id="detail-content" role="region"></div></td></tr>':"");
  }).join("")||'<tr><td class="empty-cell" colspan="'+(cols.length+1)+'">'+
    esc(scope?pair("当前条件下没有记录。","No observations match the current filters."):pair("请选择地域范围。","Choose a geographic scope."))+'</td></tr>';
  $("table-pagination").innerHTML=pagerHTML(state.page,all.length,tablePageSize,"table");
  status(number(all.length)+" "+pair("行 · 点击数值查看证据 · ! 有数据说明","rows · Click a value for evidence · ! indicates a data note"));
  if (detail&&$("detail-content")) void showDetail(detail,$("detail-content"));
  refreshSplitters();
}

function evidenceSource(row,metric,y,scope,aggregate,audit) {
  if (row.kind==="benchmark") return benchmarkEvidence(row,metric,y,scope,benchmark);
  if (row.kind==="industry") return aggregateEvidence(row,metric,y,scope,aggregate,industryView(row.scheme).companies,records,meta);
  if (row.kind==="company") return companyEvidence(row,audit,metric,y,scope);
  if (row.kind==="stat-group"&&!row.auditId) return "<p>"+esc(pair("展开下级查看原始统计序列。","Expand for published series."))+"</p>";
  return seriesEvidence(audit?.[scope]?.[y]);
}
function auditFor(row) {
  return ["industry","benchmark"].includes(row.kind)||(row.kind==="stat-group"&&!row.auditId)?
    Promise.resolve(null):api("evidence/"+(row.auditId||row.id));
}
function peersHTML(row,metric,mode,year,scope,companies=industryView().companies,countries=state.tab==="screen"?state.screen.country:[]) {
  if (row.kind!=="company") return "";
  const p=peerStats(row,metric,mode,year,scope,countries,companies,meta);
  if (!p) return "";
  const f=v=>format(v,metric,mode,meta);
  const rank=finite(p.percentile)?(p.percentile*100).toFixed(1)+"%":"—";
  return "<p><strong>"+esc(pair("同业样本","Peer sample"))+"</strong> · "+esc(nameOf(records.get(row.parent)))+
    " · n = "+number(p.n)+" · P25 "+f(p.p25)+" · "+esc(pair("中位数","Median"))+" "+f(p.median)+
    " · P75 "+f(p.p75)+" · "+esc(pair("本企业分位","Issuer percentile"))+" "+rank+"</p>";
}
async function showDetail(selection,element) {
  const row=records.get(selection.id),metric=selection.metric,y=selection.year,mode=state.mode,scope=activeScope(),aggregate=state.aggregate;
  element.textContent=prose("正在读取来源…","Loading evidence…");
  try {
    const audit=await auditFor(row);
    if (!element.isConnected||selection!==state.detail) return;
    const detail=year=>evidenceSource(row,metric,year,scope,aggregate,audit);
    const history=timeYears(y,mode).map(year=>'<details><summary>'+year+'</summary>'+detail(year)+'</details>').join("");
    const years=meta.years.map(year=>'<button class="quiet" type="button" data-detail-year="'+year+'" aria-pressed="'+(year===y)+'">'+year+
      " · "+format(observation(row,metric,year,scope,aggregate,mode,meta),metric,mode,meta)+'</button>').join("");
    element.innerHTML='<div class="detail-head"><b>'+esc(nameOf(row)+" · "+metricLabel(metric,meta)+" · "+y)+'</b><span>'+
      format(observation(row,metric,y,scope,aggregate,mode,meta),metric,mode,meta)+'</span>'+
      '<button class="quiet" type="button" data-close-detail>'+esc(pair("收起明细","Close evidence"))+'</button></div>'+
      (row.note?'<p>'+esc(row.note)+'</p>':"")+timeEvidence(row,metric,y,scope,aggregate,mode,meta)+peersHTML(row,metric,mode,y,scope)+
      detail(y)+(history?'<details><summary>'+esc(pair("比较期间的来源","Source periods"))+'</summary>'+history+'</details>':"")+
      '<div class="detail-actions"><button type="button" class="quiet" data-chart-metric="'+esc(metric)+'">'+
      esc(pair("将此指标绘图","Chart this metric"))+'</button></div><div class="years-list">'+years+'</div>';
  } catch (error) {if (element.isConnected) element.textContent=error.message;}
}
function showProfile(id,requestedMetric=null,requestedYear=null,mode="level",trigger=document.activeElement,source=null) {
  const row=industryView(source?.scheme??state.classification).issuers.get(id);
  if (!row||row.kind!=="company") return;
  id=row.id;
  const metric=meta.finColumns.includes(requestedMetric)?requestedMetric:"revenue";
  const group=Object.keys(profileGroups).find(k=>profileGroups[k][2].includes(metric))||"income";
  const panel=$("profile-panel"),fresh=state.profile?.id!==id;
  profileTrigger=trigger;
  const preferredScheme=prefs.peerScheme??source?.scheme??state.classification;
  state.profile={id,group,mode,metric,year:requestedYear??state.year,source,
    peerScheme:industryViews.has(preferredScheme)?preferredScheme:state.classification};
  panel.hidden=false;
  if (state.module!=="chains") setWorkspaceView();
  if (state.module==="atlas") renderTable(state.located===id?id:null);
  renderProfile(fresh);
  if (fresh) panel.querySelector("[data-profile-close]").focus({preventScroll:true});
  if (!industryViews.has(preferredScheme)) void setProfilePeerScheme(preferredScheme);
}
function chainCompanyRow(tickers) {
  if (!tickers?.length) return null;
  const view=industryView("isic");
  return view?.companies.find(company=>[company.code,...(company.aliases??[]).map(a=>a.code)]
    .some(code=>tickers.includes(code)))??null;
}
function chainCompanyWatched(tickers) {
  const row=chainCompanyRow(tickers);
  return Boolean(row&&isWatched(row));
}
function showChainCompany(tickers,trigger) {
  const row=chainCompanyRow(tickers);
  if (!row||state.module!=="chains") return false;
  $("chain-inspector").append($("profile-panel"));
  showProfile(row.id,null,null,"level",trigger,{scheme:"isic"});
  return true;
}
let peerSchemeToken=0;
async function setProfilePeerScheme(scheme) {
  const token=++peerSchemeToken,id=state.profile?.id;
  if (!id||!["isic","economic"].includes(scheme)) return;
  if (!industryViews.has(scheme)) {
    const selector=$("profile-peer-scheme");
    if (selector) selector.disabled=true;
    try {await loadEconomicView();}
    catch {
      if (token===peerSchemeToken&&state.profile?.id===id) {
        const current=$("profile-peer-scheme");
        if (current) {current.disabled=false;current.value=state.profile.peerScheme;}
        $("profile-peer-status").textContent=prose("暂时无法读取产业链分类。","Economic classification is unavailable.");
      }
      return;
    }
  }
  if (token!==peerSchemeToken||state.profile?.id!==id) return;
  prefs.peerScheme=scheme;save();
  state.profile={...state.profile,peerScheme:scheme};
  const selector=$("profile-peer-scheme"),profile=state.profile;
  selector.disabled=false;
  selector.value=scheme;
  const row=profileIssuer(profile),{peerIssuer}=profilePeerGroup(profile,row);
  selector.nextElementSibling.textContent=profileClassificationLabel(profile,peerIssuer);
  const bio=$("profile-industry-bio");
  if (bio) bio.textContent=profileIndustryBio(peerIssuer);
  $("profile-peer-status").textContent="";
  refreshProfileRadar();
  void showProfileEvidence(profile,$("profile-evidence"));
}
function closeProfile(restoreFocus=false) {
  if (!state.profile) return;
  const id=state.profile.id,panel=$("profile-panel");
  state.profile=null;
  peerSchemeToken++;
  disposeStockPrice();
  panel.hidden=true;
  panel.removeAttribute("data-related-view");
  hideTip();
  if (state.module!=="chains") setWorkspaceView();
  if (restoreFocus) {
    if (state.module==="chains") {
      $("chain-page").dispatchEvent(new Event("chain-profile-close"));
      return;
    }
    if (state.module==="atlas") renderTable();
    const target=profileTrigger?.isConnected?profileTrigger:gridBody.querySelector('[data-row="'+CSS.escape(id)+'"] [data-open-profile]');
    target?.focus({preventScroll:true});
  }
}
function profilePeerGroup(profile,row) {
  const view=industryView(profile.peerScheme)??industryView();
  return {view,peerIssuer:view.issuers.get(row.id)??row};
}
function profileClassificationLabel(profile,peerIssuer) {
  return profile.peerScheme==="economic"?industryPath(peerIssuer.parent).map(nameOf).join(" › "):nameOf(records.get(peerIssuer.parent));
}
function profileIndustryBio(peerIssuer) {
  const industry=nameOf(records.get(peerIssuer.parent));
  return prose("主要业务归入 "+industry+"。","Primary activity is classified as "+industry+".");
}
function profileYearControl(year,kind) {
  const index=meta.years.indexOf(year);
  const arrow=(direction,label,glyph,enabled)=>'<button type="button" class="quiet" data-profile-year-step="'+direction+'" data-year-control="'+kind+
    '" aria-label="'+esc(label)+'"'+(enabled?"":" disabled")+'>'+glyph+'</button>';
  return '<div class="profile-year-control" role="group" aria-label="'+esc(pair("观察年度","Observation year"))+'">'+
    arrow(-1,pair("上一年","Previous year"),"‹",index>0)+'<output>'+year+'</output>'+
    arrow(1,pair("下一年","Next year"),"›",index>=0&&index<meta.years.length-1)+'</div>';
}
function refreshProfileRadar() {
  const profile=state.profile;
  if (!profile) return;
  const row=profileIssuer(profile),{view,peerIssuer}=profilePeerGroup(profile,row);
  const preferredScope=profile.source?.scope??state.scope;
  const scope=preferredScope&&visibleInScope(row,preferredScope)?preferredScope:"world";
  renderPeerRadar(row,view.companies,profile.year,scope,meta,profileYearControl(profile.year,"peer"),peerIssuer);
  refreshSplitters();
}
function profileHistoryTable(row,p) {
  const table="profile-history-table";
  const scope=row.region,years=meta.years.slice().reverse();
  const metrics=profileGroups[p.group][2].filter(k=>meta.metrics[k]);
  const heading='<th scope="col">'+esc(pair("财年","Fiscal year"))+
    columnResizeHandle("history-column",table,pair("调整财年列宽","Resize fiscal-year column"))+"</th>"+
    metrics.map(k=>'<th scope="col">'+esc(metricLabel(k,meta))+'<small>'+esc(unitLabel(k,p.mode,meta))+'</small></th>').join("");
  const history=years.map(year=>'<tr><th scope="row">'+year+'</th>'+metrics.map(k=>{
    const {value,note}=measure(row,k,year,scope,"sum",p.mode,meta),warning=qualityNotes[note];
    return "<td>"+(finite(value)||warning?'<button type="button" class="cell-value" data-profile-metric="'+k+'" data-year="'+year+
      '"'+(warning?' title="'+esc(prose(...warning))+'"':"")+'>'+format(value,k,p.mode,meta)+(warning?'<sup class="data-marker">!</sup>':"")+
      '</button>':'<span class="missing">—</span>')+"</td>";
  }).join("")+"</tr>").join("");
  return '<div class="profile-table profile-grid" tabindex="0" aria-label="'+esc(pair("十年财务","Ten-year financials"))+'">'+
    '<table id="'+table+'"><thead><tr>'+heading+'</tr></thead><tbody>'+history+'</tbody></table></div>';
}
function refreshProfileHistory(p) {
  const grid=$("profile-history").querySelector(".profile-grid"),scroll=grid.scrollLeft;
  grid.outerHTML=profileHistoryTable(profileIssuer(p),p);
  $("profile-history").querySelector(".profile-grid").scrollLeft=scroll;
  refreshSplitters();
}
function renderProfile(fresh=false) {
  const p=state.profile;
  if (!p) return;
  hideTip();
  const profile=$("profile");
  const grid=$("profile-history")?.querySelector(".profile-grid");
  const scroll=fresh?0:grid?.scrollLeft||0;
  const radarScroll=fresh?0:$("profile-peers")?.querySelector(".radar-values")?.scrollLeft||0;
  const bodyScroll=fresh?0:$("profile-body")?.scrollTop||0;
  const row=profileIssuer(p);
  const info=row.profile||{};
  const logo=info.logo&&/^data\/logos\/[\w.-]+$/.test(info.logo)?'<img class="profile-logo" src="'+esc(info.logo)+'" alt="">':"";
  const initials=row.code.match(/^[A-Z]{1,4}/)?.[0]||Array.from(nameOf(row)).slice(0,2).join("");
  const profileSources=[link(info.website,pair("企业官网","Company website"))||esc(pair("官网待核实","Website unavailable")),
    link(info.profileSource,pair("资料来源","Profile source")),
    link(info.directorySource,"FinanceDatabase")].filter(Boolean).join(" · ");
  const {peerIssuer}=profilePeerGroup(p,row);
  const classificationLabel=profileClassificationLabel(p,peerIssuer);
  const isic=industryView("isic").issuers.get(row.id);
  const classificationOptions=options([["isic",isic?"ISIC "+isic.parent:"ISIC Rev.4"],
    ["economic",pair("产业链功能","Economic function")]],p.peerScheme);
  const zhDescription=info.descriptionZh&&prefs.language!=="en"?
    '<p class="profile-bio-zh" lang="zh-CN">'+esc(info.descriptionZh)+'</p>':"";
  const bio='<div class="profile-bio"><p'+(info.description?"":' id="profile-industry-bio"')+'>'+
    esc(info.description||profileIndustryBio(peerIssuer))+'</p>'+zhDescription+
    (info.address?'<p class="profile-address">'+esc(info.address)+'</p>':"")+'<p class="profile-sources">'+profileSources+'</p></div>';
  const watched=isWatched(row);
  profile.innerHTML='<div class="profile-header"><div class="profile-brand"><div class="profile-logo-slot">'+
    '<span aria-hidden="true">'+esc(initials)+'</span>'+logo+'</div><div><p class="profile-kicker">'+esc(row.code+" · "+companyLocation(row))+
    '</p><h2 id="profile-title">'+esc(nameOf(row))+'</h2></div></div>'+
    '<div class="profile-window-controls">'+
    icon("quiet profile-star","data-profile-watch",pair("自选","Watchlist"),watched?"★":"☆",'aria-pressed="'+watched+'"')+
    icon("quiet","data-profile-close",pair("关闭","Close"),"×")+'</div>'+
    '<div class="profile-industry"><select id="profile-peer-scheme" aria-label="'+
    esc(pair("行业分类方式","Industry classification"))+'" aria-describedby="profile-peer-status">'+classificationOptions+
    '</select><span>'+esc(classificationLabel)+'</span></div>'+
    '<div class="profile-actions"><button type="button" class="quiet" data-profile-peers>'+esc(pair("同组企业","Industry peers"))+'</button>'+
    (row.benchmark?'<button type="button" class="quiet" data-profile-bench>'+esc(pair("行业基准","Industry benchmark"))+'</button>':"")+'</div></div>'+
    '<div id="profile-body"><div id="profile-overview"><p id="profile-peer-status" class="radar-method" role="status"></p>'+bio+
    '<section id="profile-stock" class="profile-section" aria-labelledby="profile-stock-title"></section>'+
    '<section id="profile-peers" class="profile-radar" aria-labelledby="profile-peer-score-title"></section></div>'+
    '<section id="profile-history" class="profile-section" aria-labelledby="profile-history-title"><h3 id="profile-history-title">'+
    esc(pair("十年财务","Ten-year financials"))+'</h3><div class="pref-toolbar">'+
    '<select id="profile-group" aria-label="'+esc(pair("财报分类","Statement group"))+'">'+
    options(Object.entries(profileGroups).map(([k,v])=>[k,pair(v[0],v[1])]),p.group)+'</select></div>'+
    profileHistoryTable(row,p)+'</section>'+
    '<section id="profile-calculation" class="profile-section" aria-labelledby="profile-calculation-title"><h3 id="profile-calculation-title">'+
    esc(pair("计算明细","Calculation details"))+'</h3><div class="pref-toolbar profile-calculation-controls">'+
    '<select id="profile-metric" aria-label="'+esc(pair("明细指标","Evidence metric"))+'">'+
    options(meta.finColumns.map(k=>[k,metricLabel(k,meta)]),p.metric)+'</select>'+
    profileYearControl(p.year,"evidence")+
    '<select id="profile-mode" aria-label="'+esc(pair("财报时间基准","Financial history basis"))+'">'+periodOptions(p.mode)+
    '</select></div><div id="profile-evidence"></div></section></div>';
  refreshProfileRadar();
  renderStockPrice($("profile-stock"),row.code);
  const radar=$("profile-peers").querySelector(".radar-values");
  if (radar) radar.scrollLeft=radarScroll;
  $("profile-history").querySelector(".profile-grid").scrollLeft=scroll;
  $("profile-body").scrollTop=bodyScroll;
  const image=profile.querySelector("img");
  if (image) image.onerror=()=>image.remove();
  void showProfileEvidence(p,$("profile-evidence"));
}
async function showProfileEvidence(p,element) {
  const row=profileIssuer(p),k=p.metric,y=p.year,mode=p.mode,scope=row.region;
  element.setAttribute("aria-busy","true");
  if (!element.hasChildNodes()) element.textContent=prose("正在读取来源…","Loading evidence…");
  try {
    const audit=await auditFor(row);
    if (!element.isConnected||state.profile!==p) return;
    const raw=year=>companyEvidence(row,audit,k,year,scope);
    const preferredScope=p.source?.scope??state.scope;
    const peerScope=preferredScope&&visibleInScope(row,preferredScope)?preferredScope:"world";
    const {view,peerIssuer}=profilePeerGroup(p,row);
    const peers=view.companies.filter(company=>company.id!==peerIssuer.id);
    element.innerHTML="<strong>"+esc(metricLabel(k,meta)+" · "+y)+" · "+format(observation(row,k,y,scope,"sum",mode,meta),k,mode,meta)+"</strong> "+
      timeEvidence(row,k,y,scope,"sum",mode,meta)+peersHTML({...row,parent:peerIssuer.parent},k,mode,y,peerScope,peers,[])+raw(y)+
      timeYears(y,mode).map(year=>'<details><summary>'+year+'</summary>'+raw(year)+'</details>').join("");
  } catch (error) {if (element.isConnected&&state.profile===p) element.textContent=error.message;}
  finally {if (state.profile===p) element.removeAttribute("aria-busy");}
}
function screenFilters() {
  const {countries,industries}=issuerFilterOptions(industryView(),state.classification);
  const update=(key,selected)=>{changeScreen(key,selected);screenFilters();};
  renderFilterPicker($("screen-country"),countries,state.screen.country,pair("全部经济体","All economies"),selected=>update("country",selected));
  renderFilterPicker($("screen-industry"),industries,state.screen.industry,pair("全部行业","All industries"),selected=>update("industry",selected));
}
function screenControls() {
  const s=state.screen;
  screenFilters();
  $("screen-only-watch").checked=s.onlyWatch===true;
  $("screen-preset").innerHTML=presetOptions(s.preset);
  $("delete-preset").hidden=!prefs.presets.some(p=>p.id===s.preset);
  renderRules($("rules"),s.rules,meta);
  if ($("advanced-input").value!==s.expression) $("advanced-input").value=s.expression;
  renderAdvanced(meta);
  advancedStatus();
}
function benchmarkYears() {
  return meta.years.filter(year=>benchmark.sources[state.region]?.[year]);
}
function useBenchmarkYear() {
  const years=benchmarkYears(),remembered=benchmarkPeriod.years.get(state.region);
  state.year=years.includes(remembered)?remembered:years.findLast(year=>{
    const sources=benchmark.sources[state.region][year];
    return sources.margin&&sources.wacc&&sources.eva;
  })??years.at(-1)??state.year;
  if (years.length<=1) state.mode="level";
}
function statisticsYears() {
  const years=statisticsCoverage.get(state.source)?.get(state.scope);
  return meta.years.filter(year=>years?.has(year));
}
const statisticsPeriodKey=()=>state.source+":"+state.scope;
function useStatisticsYear() {
  const years=statisticsYears(),period=statisticsPeriods.get(statisticsPeriodKey()),remembered=period?.year;
  state.year=years.includes(remembered)?remembered:years.at(-1)??state.year;
  state.mode=years.length<=1?"level":period?.mode??"level";
}
function syncControls() {
  const bench=state.tab==="benchmark"&&benchmark;
  const stats=state.tab==="statistics"&&statisticsCoverage.has(state.source);
  const years=bench?benchmarkYears():stats?statisticsYears():meta.years;
  $("year").disabled=!years.length;
  $("year").innerHTML=options([...years].reverse().map(y=>[y,prose(y+" 年",String(y))]),state.year);
  $("series-mode").innerHTML=periodOptions(state.mode,(bench||stats)&&years.length<=1?["level"]:undefined);
  $("stat-source").innerHTML=options(Object.entries(sources).filter(([id])=>meta.stats[id]).map(([id,v])=>[id,pair(...v)]),state.source);
  if (benchmark) $("benchmark-region").innerHTML=options(Object.keys(benchmark.regions).map(id=>[id,scopeLabel(id)]),state.region);
  $("search").value=state.search;$("aggregate").value=state.aggregate;
  $("scope-cn").checked=state.scope==="world"||state.scope==="cn";
  $("scope-ex").checked=state.scope==="world"||state.scope==="ex";
  $("version").textContent=pair("上次数据更新时间","Last data update")+" "+meta.built.slice(0,10);
  $("period-controls").hidden=state.tab==="directory";
  $("classification-control").hidden=!classificationTabs.has(state.tab);
  $("start-level-control").hidden=state.tab!=="finance";
  $("start-level").value=String(state.startLevel);
  $("scope-control").hidden=state.tab==="benchmark";
  $("benchmark-control").hidden=state.tab!=="benchmark";
  $("aggregate-control").hidden=state.tab!=="finance";
  $("coverage-control").hidden=!(state.tab in state.coverage);
  if (state.tab in state.coverage) $("company-coverage").value=String(state.coverage[state.tab]);
  $("source-control").hidden=state.tab!=="statistics";
  for (const id of ["screen-tools","screen-country-control","screen-industry-control","screen-watch-control"]) $(id).hidden=state.tab!=="screen";
  $("collapse").hidden=["screen","benchmark"].includes(state.tab);
  $("financial-view").hidden=state.tab==="directory";$("directory-view").hidden=state.tab!=="directory";
  updateFilterLayout(state.tab);
  for (const b of document.querySelectorAll("[data-tab]")) {
    if (b.dataset.tab===state.tab) b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
  }
  if (state.tab==="screen") screenControls();
}
async function setClassification(scheme,{locating=false}={}) {
  if (!["isic","economic"].includes(scheme)) return false;
  const token=++classificationToken,select=$("classification"),feedback=$("classification-status");
  select.value=scheme;
  select.removeAttribute("aria-busy");
  feedback.textContent="";
  if (scheme===state.classification) return true;
  if (scheme==="economic"&&!industryViews.has(scheme)) {
    select.setAttribute("aria-busy","true");
    feedback.textContent=prose("正在读取产业链分类…","Loading economic-function classification…");
    try {
      await loadEconomicView();
    } catch (error) {
      if (token!==classificationToken) return false;
      console.warn("Economic-function classification unavailable",error);
      select.removeAttribute("aria-busy");
      select.value=state.classification;
      feedback.textContent=prose("产业链分类暂未载入，请刷新页面后重试。","Economic-function classification could not load. Refresh the page and try again.");
      if (classificationTabs.has(state.tab)) status(feedback.textContent);
      return false;
    }
  }
  if (token!==classificationToken) return false;
  state.classification=scheme;
  if (!locating) {prefs.classification=scheme;save();}
  select.removeAttribute("aria-busy");
  feedback.textContent=prose("分类已切换。","Classification updated.");
  const industry=state.screen.industry.filter(id=>industryView().nodes.some(node=>node.id===id));
  if (industry.length!==state.screen.industry.length) {
    state.screen.industry=industry;
    state.screen.preset="";
  }
  state.expanded.clear();
  resetPage();
  syncControls();
  renderMethods();
  renderTable();
  if (!locating) {
    for (const chart of state.charts) if (chart.defaultPins) chart.pins=defaultPins();
    showCharts(true);
  }
  if (state.profile) {
    state.profile={...state.profile,id:profileIssuer(state.profile).id};
    renderProfile();
  }
  return true;
}
async function switchTab(tab,config={}) {
  const token=++tabToken;
  if (config.keepProfile) {
    $("profile-panel").setAttribute("data-related-view","");
    updateViewPanel("data",true);
  } else closeProfile();
  const fromPublished=["benchmark","statistics"].includes(state.tab),toPublished=["benchmark","statistics"].includes(tab);
  if (state.tab==="benchmark") benchmarkPeriod.mode=state.mode;
  if (state.tab==="statistics"&&statisticsCoverage.has(state.source)) {
    statisticsPeriods.set(statisticsPeriodKey(),{year:state.year,mode:state.mode});
  }
  if (!fromPublished&&toPublished) financialPeriod={year:state.year,mode:state.mode};
  if (fromPublished&&!toPublished) Object.assign(state,financialPeriod);
  if (config.source) state.source=config.source;
  if (tab==="benchmark") state.mode=benchmarkPeriod.mode;
  if (tab==="statistics") state.mode="level";
  if (tab==="benchmark"&&config.keepProfile) state.mode="level";
  state.tab=tab;state.search=config.search??"";state.expanded.clear();state.detail=null;state.located=null;state.page=0;state.desc=true;
  if (tab==="markets") for (const row of trees.get("markets").items) if (row.kind==="market-group") state.expanded.add(row.id);
  if (tab==="benchmark"&&benchmark) useBenchmarkYear();
  if (tab==="statistics"&&statisticsCoverage.has(state.source)) useStatisticsYear();
  syncControls();
  if (tab!=="directory") {gridBody.replaceChildren();$("grid-head").replaceChildren();status(prose("正在读取…","Loading…"));}
  try {
    if (tab==="statistics") await loadStatistics(state.source);
    if (tab==="benchmark") await loadBenchmark();
    if (tab==="directory") {
      $("directory-results").textContent=prose("正在读取证券目录…","Loading securities directory…");
      directory??=await research("directory");
    }
    if (token!==tabToken) return;
    if (tab==="benchmark") useBenchmarkYear();
    if (tab==="statistics") useStatisticsYear();
    state.sort=tab==="benchmark"?"wacc":columns()[0]??"name";
    syncControls();
    if (tab==="directory") renderDirectory(directory,showProfile,industryView("isic").companies);
    else if (tab==="screen") void applyAdvanced();else renderTable();
  } catch (error) {
    if (token!==tabToken) return;
    if (tab==="directory") $("directory-results").textContent=error.message;else status(error.message);
  }
}
function snapshot(row,scope=activeScope()) {
  return {row,scope,aggregate:state.aggregate,source:row.kind.startsWith("stat")?state.source:null,
    scheme:row.kind==="company"?state.classification:row.scheme};
}
function relaxScreenFor(row) {
  const defaults=initialScreen(),current=state.screen,next={...current};
  if (current.onlyWatch&&!isWatched(row)) next.onlyWatch=false;
  if (current.country.length&&!current.country.includes(row.country)) next.country=[...current.country,row.country];
  if (!matchesIndustry(row,current.industry,records)) next.industry=[...current.industry,row.parent];
  if (current.expression&&!matchesScreen(row,{...defaults,expression:current.expression},state,meta,records)) next.expression="";
  next.rules=current.rules.filter(rule=>matchesScreen(row,{...defaults,rules:[rule]},state,meta,records));
  if (["country","industry","onlyWatch","expression"].every(key=>next[key]===current[key])&&next.rules.length===current.rules.length) return;
  if (next.expression!==current.expression) {
    advancedToken++;
    state.advancedIds=state.advancedError=null;
    state.advancedPending=false;
  }
  state.screen={...next,preset:""};
}
function revealBenchmark(pin) {
  if (visible(pin.row)) return;
  const regions=[...new Set([state.region,pin.scope,...Object.keys(benchmark.regions)])];
  const region=regions.find(key=>Object.hasOwn(pin.row.values??{},key)&&Object.keys(pin.row.values[key]).length);
  if (!region) return;
  const dates=pin.row.values[region];
  state.region=region;
  if (!dates[state.year]) {
    state.year=meta.years.filter(year=>dates[year]).reduce((best,year)=>
      best===null||Math.abs(year-state.year)<=Math.abs(best-state.year)?year:best,null)??state.year;
  }
  if (benchmarkYears().length<=1) state.mode="level";
}
function revealScope(row,preferred) {
  if (row.kind==="benchmark") return;
  const eligible=scope=>row.kind==="company"?visibleInScope(row,scope):
    row.kind==="industry"?row.scheme!=="economic"||Boolean(row.agg?.[scope]):row.scopes?.includes(scope);
  if (state.scope&&eligible(state.scope)) return;
  const bits={world:3,cn:1,ex:2};
  const distance=scope=>{
    const diff=bits[scope]^(bits[state.scope]??0);
    return diff===3?2:Number(Boolean(diff));
  };
  const previousYear=state.year,previousMode=state.mode;
  state.scope=[...new Set([preferred,"world","cn","ex"])].filter(scope=>scope&&eligible(scope))
    .sort((a,b)=>distance(a)-distance(b))[0]??state.scope;
  if (state.tab==="statistics") {
    useStatisticsYear();
    const years=statisticsYears();
    if (years.includes(previousYear)) state.year=previousYear;
    if (years.length>1) state.mode=previousMode;
  }
}
let locateToken=0;
function clearLocatedRow() {
  locateToken++;
  if (state.located===null) return;
  state.located=null;
  const row=gridBody.querySelector(".located");
  if (row?.contains(document.activeElement)&&document.activeElement.matches(".row-label")) document.activeElement.blur();
  row?.classList.remove("located");
}
async function locateSeries(pin,trigger) {
  const token=++locateToken;
  const {row:original}=pin;
  const company=original.kind==="company";
  const tab=company&&state.tab==="screen"?"screen":company||original.kind==="industry"?"finance":
    original.kind==="benchmark"?"benchmark":pin.source?"statistics":"markets";
  if (state.tab!==tab||(pin.source&&state.source!==pin.source)) {
    const switching=switchTab(tab,{source:pin.source,search:state.search});
    const expectedTab=tabToken;
    await switching;
    if (token!==locateToken||expectedTab!==tabToken) return;
  }
  if (original.kind==="industry"&&original.scheme!==state.classification) {
    if (!await setClassification(original.scheme,{locating:true})||token!==locateToken||state.tab!==tab) return;
  }
  const row=company?issuerFor(original.id):records.get(original.id);
  if (!row) return;
  if (tab==="benchmark") revealBenchmark(pin);
  else revealScope(row,pin.scope);
  if (tab==="finance") state.startLevel=Math.min(state.startLevel,outlineLevel(row));
  if (tab==="screen") relaxScreenFor(row);
  const query=state.search.trim().toLowerCase();
  if (query&&!matchesSearch(row,query)&&!outline().some(item=>item.row.id===row.id)) state.search="";
  if (company&&!state.search.trim()&&state.coverage[tab]<100) {
    const peers=industryView().companies.filter(peer=>peer.parent===row.parent&&visible(peer));
    state.coverage[tab]=[25,50,75,100].find(pct=>pct>=state.coverage[tab]&&representatives(peers,pct).has(row.id))??100;
  }
  for (const parent of industryPath(row.parent)) state.expanded.add(parent.id);
  state.detail=null;
  state.located=row.id;
  updateViewPanel("data",true);
  syncControls();
  if (company) showProfile(row.id,null,null,"level",trigger);
  else renderTable(row.id);
  const target=gridBody.querySelector('[data-row="'+CSS.escape(row.id)+'"]');
  if (!target) {
    status(pair("当前数据中找不到该序列","This series could not be located")+" · "+nameOf(row));
    return;
  }
  const table=target.closest(".table-scroll"),box=table.getBoundingClientRect(),bounds=target.getBoundingClientRect();
  const header=$("grid-head").offsetHeight;
  if (bounds.top<box.top+header||bounds.bottom>box.bottom) {
    table.scrollTop+=bounds.top-box.top-header-Math.max(0,(table.clientHeight-header-bounds.height)/2);
  }
  if (!company) target.querySelector(".row-label").focus({preventScroll:true});
}
function nextChartRow() {return (state.charts.at(-1)?.row??-1)+1;}
function defaultPins() {
  const ids=state.classification==="economic"?["ef-consumer","ef-tools"]:["C","J"];
  return ids.filter(id=>records.has(id)).map(id=>snapshot(records.get(id),state.scope||"world"));
}
function persistTrendCharts() {
  // Save series references so restored trends use the current data snapshot.
  const charts=state.charts.map(chart=>({...chart,pins:chart.pins.map(({row,...pin})=>{
    const {id,kind,scheme,name,en,zh,code,region,country,currency}=row;
    return {...pin,row:{id,kind,scheme,name,en,zh,code,region,country,currency}};
  })}));
  prefs.trendCharts={charts,active:state.active,nextId:state.nextChart};
  if (!save()) status(prose("本地存储已满，趋势对照未能保存。","Local storage is full. Trend changes could not be saved."));
}
async function restoreTrendCharts() {
  const saved=prefs.trendCharts,charts=Array.isArray(saved?.charts)?saved.charts:null;
  const valid=charts?.filter(chart=>Number.isSafeInteger(chart?.id)&&Array.isArray(chart.pins));
  const pins=valid?.flatMap(chart=>chart.pins).filter(pin=>typeof pin?.row?.id==="string"&&typeof pin.row.kind==="string")??[];
  const sources=new Set(pins.map(pin=>pin.source).filter(source=>Object.hasOwn(meta.stats,source)));
  const loads=[...sources].map(loadStatistics);
  if (pins.some(pin=>pin.row.kind==="benchmark")) loads.push(loadBenchmark());
  if (prefs.classification==="economic"||pins.some(pin=>(pin.scheme??pin.row.scheme)==="economic")) loads.push(loadEconomicView());
  await Promise.allSettled(loads);
  if (prefs.classification==="economic"&&industryView("economic")) state.classification="economic";
  if (!valid) {
    const defaults=defaultPins();
    state.charts=[{id:1,row:0,metric:"revenue",mode:"level",pins:[...defaults],defaultPins:true},
      {id:2,row:1,metric:"roic",mode:"level",pins:[...defaults],defaultPins:true}];
    return;
  }
  const restoredPins=new Map(pins.map(pin=>{
    const {row}=pin,scheme=pin.scheme??row.scheme??"isic";
    const current=row.kind==="company"?industryView(scheme)?.issuers.get(row.id):
      pin.source?trees.get(pin.source)?.items.find(item=>item.id===row.id):records.get(row.id);
    return [pin,{...pin,row:current??row}];
  }));
  state.charts=valid.map((chart,i)=>({...chart,
    row:Number.isSafeInteger(chart.row)?chart.row:i,
    metric:Object.hasOwn(meta.metrics,chart.metric)?chart.metric:"revenue",
    mode:Object.hasOwn(modes,chart.mode)?chart.mode:"level",
    pins:chart.pins.map(pin=>restoredPins.get(pin)).filter(Boolean)
  }));
  state.active=state.charts.find(chart=>chart.id===saved.active)?.id??state.charts.at(-1)?.id;
  state.nextChart=state.charts.reduce((next,chart)=>Math.max(next,chart.id+1),
    Number.isSafeInteger(saved.nextId)?Math.max(3,saved.nextId):3);
}
function showCharts(persist=false) {
  renderCharts($("charts"),state.charts,state.active,meta,profileGroups);
  refreshSplitters();
  if (persist) persistTrendCharts();
}
function pin(row,key=null,mode=state.mode,scope=activeScope()) {
  if (!scope) return;
  let chart=state.charts.find(c=>c.id===state.active);
  if (key&&chart?.pins.length&&chart.metric!==key) chart=null;
  if (!chart) {
    chart={id:state.nextChart++,row:nextChartRow(),metric:key??columns()[0]??"revenue",mode,pins:[]};
    state.charts.push(chart);state.active=chart.id;
  }
  if (!chart.pins.some(p=>p.row.id===row.id&&p.scope===scope&&p.aggregate===state.aggregate)) {
    chart.pins.push(snapshot(row,scope));
    chart.defaultPins=false;
  }
  if (key) {chart.metric=key;chart.mode=mode;}
  else if (!chart.pins.some(p=>meta.years.some(y=>finite(annual(p.row,chart.metric,y,p.scope,p.aggregate))))) {
    chart.metric=allColumns().find(k=>meta.years.some(y=>finite(annual(row,k,y,scope,state.aggregate))))||chart.metric;
  }
  status(pair("已添加趋势序列","Added chart series")+" · "+nameOf(row));showCharts(true);
}
let columnView;
function openColumns(view=state.tab) {
  columnView=view;
  renderColumns();
  $("columns-dialog").showModal();
}
function renderColumns() {
  const all=allColumns(columnView),selected=columns(columnView),financial=financialColumns(columnView);
  $("column-groups").innerHTML=(financial?Object.entries(presets).map(([key,v])=>'<button class="quiet" type="button" data-column-preset="'+key+'">'+
    esc(pair(v[0],v[1]))+'</button>').join(""):"")+'<button class="quiet" type="button" data-column-preset="all">'+esc(pair("全部","All"))+
    '</button><button class="quiet" type="button" data-column-preset="default">'+esc(pair("恢复默认","Reset"))+'</button>';
  $("column-glossary").checked=Boolean(prefs.columnGlossary);
  $("column-list").innerHTML=all.map(k=>{
    const entry=glossary[k],formula=entry?.[4];
    const description=entry&&(formula&&/[÷×−+≈Σ√^]/.test(formula)?paragraphs(formula,entry[5]):paragraphs(entry[2],entry[3]));
    return '<div class="column-card"><label><input type="checkbox" data-column="'+esc(k)+'"'+
      (selected.includes(k)?" checked":"")+">"+esc(metricLabel(k,meta))+"</label>"+
      (prefs.columnGlossary&&description?'<p class="term-formula">'+esc(description)+'</p>':"")+"</div>";
  }).join("");
}
function setColumns(keys) {
  const k=columnKey(columnView);
  if (keys?.length) prefs.columns[k]=keys;else delete prefs.columns[k];
  save();renderColumns();
  if (columnView==="watchlist") {renderWatchlist();return;}
  if (!columns().includes(state.sort)&&state.sort!=="name") state.sort=columns()[0];
  state.detail=null;renderTable();
}
function exportTable() {
  const cols=columns(),scope=activeScope();
  const economic=state.classification==="economic"&&classificationTabs.has(state.tab);
  const headers=[pair("层级","Depth"),pair("代码","Code"),pair("名称","Name"),
    ...(economic?[pair("产业链功能","Economic-function group")]:[]),pair("范围","Scope"),pair("年份","Year"),pair("基准","Time basis"),
    ...cols.map(k=>metricLabel(k,meta)+" ("+unitLabel(k,state.mode,meta,currency())+")")];
  const rows=[headers,...visibleScreenEntries(outline()).map(({row,depth})=>[depth+1,row.code||row.id,nameOf(row),
    ...(economic?[industryPath(row.kind==="company"?row.parent:row.id).map(nameOf).join(" › ")]:[]),scopeLabel(scope),state.year,modeLabel(state.mode),
    ...cols.map(k=>finite(value(row,k))?scale(value(row,k),k,state.mode,meta):"")])];
  downloadCSV(rows,"AlphaNode-"+state.tab+(economic?"-economic":"")+"-"+state.year+".csv");
}
function renderMethods() {
  const coverage=meta.coverage;
  const counts=[[coverage.companies,"原财报样本记录","Original company records"],[coverage.companyYears,"原财报年度观测","Original company-year observations"],
    [Object.keys(coverage.locations).length,"经营归属经济体","Issuer economies"]];
  const sections=[
    ["财报与地域","Financial sample and geography",
      "企业地理范围按主要经营归属。合并财报包含集团全球经营。金额可以加总，比率按相应分母加权，另有等权均值。",
      "Issuer geography follows operating attribution, and consolidated statements include global operations. Amounts are summed and ratios are denominator-weighted, with an equal-weight option."],
    ["时间与同业","Time basis and peers",
      "观察年度按财年截止年份。历史均值要求每年有效，复合增速要求正的期初和期末金额或数量。同业分位要求同组至少五家有效企业。",
      "Observations follow fiscal year end. Averages require each year. CAGR requires positive endpoint amounts or counts. Peer percentiles require five comparable observations."],
    ["产业链功能分类","Economic-function classification",
      "Bench 自定义研究分类，将企业按主要产品用途和所承担的产业链功能分为消费、生产工具、源材料、服务／金融／医疗。消费渠道按自营和撮合区分，医疗产品与服务统一放在医疗健康。按可辨认的主营业务归类，未逐家核对的企业按 ISIC 映射。跨类集团使用整份合并财报，历史各年沿用同一归属，已识别的同主体多地上市只计一次。行业汇总、可比同比与同业样本使用该分组。",
      "Bench’s custom research classification groups issuers by the use of their main products and their role in the value chain. Inventory-led retail and marketplaces are separate. Healthcare includes products and services. Company-specific assignments use the identifiable primary business; other assignments use an ISIC mapping. Consolidated figures and a fixed historical assignment are used, and known duplicate listings count once. Group aggregates, comparable growth and peer samples use this classification."],
    ["行业基准","Industry benchmarks",
      "企业估算采用全球美元同业 WACC。产业链功能视图按新分组汇总企业原有 EVA 估算。Damodaran 基准页沿用其行业、地域及工作簿日期。",
      "Issuer estimates use the global sector WACC in USD. The economic-function view rolls existing issuer EVA estimates into the new groups. The Damodaran view follows the original industry, geography and workbook date."],
    ["证券目录与市场","Directory and product markets",
      "目录采用 FinanceDatabase 的证券级分类。财报通过证券代码与经济体匹配本地发行人。官方统计与产品市场保留各自分母。缺报或不适用显示横杠。",
      "The directory uses FinanceDatabase listing classifications. Local issuer financials are joined by ticker and economy. Published statistics and product markets retain their own denominators. A dash indicates unavailable or inapplicable data."]
  ];
  const economic=industryView("economic")?.coverage;
  const economicCounts=economic?'<p>'+esc(pair(
    "产业链功能视图当前覆盖 "+number(economic.issuers)+" 个合并主体、"+number(economic.groups)+" 个有样本的三级组。其中 "+number(economic.byBasis.issuer??0)+" 家采用企业级规则。",
    "The economic-function view covers "+number(economic.issuers)+" consolidated issuers and "+number(economic.groups)+" populated groups. Issuer-specific rules apply to "+number(economic.byBasis.issuer??0)+" issuers."
  ))+'</p>':"";
  $("methods").innerHTML='<dl class="coverage-facts">'+counts.map(([value,zh,en])=>'<div><dt>'+esc(pair(zh,en))+
    '</dt><dd>'+number(value)+'</dd></div>').join("")+'</dl>'+
    sections.map(([zh,en,body,translated])=>"<h3>"+esc(pair(zh,en))+'</h3><p class="multilingual">'+esc(paragraphs(body,translated))+"</p>").join("")+
    economicCounts+'<p><a href="data/coverage.json" target="_blank" rel="noopener">'+esc(pair("覆盖清单","Coverage file"))+'</a> · '+
    link("https://github.com/JerBouma/FinanceDatabase","FinanceDatabase")+" · "+link("https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html","NYU Damodaran")+"</p>";
}
function rerenderLanguage(lang) {
  setLanguage(lang);hideTip();syncControls();renderMethods();
  if (state.tab==="directory"&&directory) renderDirectory(directory,showProfile,industryView("isic").companies);else renderTable();
  showCharts();
  if (state.module==="collection") renderCollection();
  if (state.module==="chains") showChainPage(true);
  if (state.module==="chain-values") showChainValues();
  if ($("settings-dialog").open) {
    renderGlossarySettings();
    renderRadarSettings();
  }
  if ($("columns-dialog").open) renderColumns();
  if (state.profile) renderProfile();
}
function applyTableDisplay() {
  const align=prefs.align==="finance"?"finance":"center";
  const indent=prefs.indentHierarchy!==false,colors=prefs.colorHierarchy===true;
  $("settings-align").value=align;
  $("settings-indent").checked=indent;
  $("settings-level-colors").checked=colors;
  $("heat").checked=state.heat;
  document.documentElement.dataset.align=align;
  document.documentElement.toggleAttribute("data-flat-hierarchy",!indent);
  document.documentElement.toggleAttribute("data-level-colors",colors);
  refreshSplitters();
}
function radarSelectionCount() {
  const count=number(selectedRadarMetrics(meta).length),available=number(radarMetricOptions(meta).length);
  $("radar-selection-count").textContent=pair("已选 "+count+" / "+available+" 项财务指标",count+" / "+available+" financial metrics selected");
}
function renderRadarSettings() {
  const terms=Object.keys(glossary),metrics=terms.filter(key=>Object.hasOwn(meta.metrics,key)).length;
  $("term-coverage-count").textContent=pair(number(metrics)+" 项指标 · "+number(terms.length-metrics)+" 个其他术语",
    number(metrics)+" metrics · "+number(terms.length-metrics)+" other terms");
  const selected=new Set(selectedRadarMetrics(meta));
  $("radar-metric-list").innerHTML=radarMetricOptions(meta).map(key=>
    '<label><input type="checkbox" data-radar-metric="'+esc(key)+'"'+(selected.has(key)?" checked":"")+
    '><span>'+esc(metricLabel(key,meta))+'</span></label>').join("");
  radarSelectionCount();
}
function resetPage(){state.page=0;state.detail=null;}
function advancedStatus() {
  const el=$("advanced-status");
  if (state.advancedError) {
    el.textContent=prose("表达式未应用。","Expression could not be applied.")+" "+state.advancedError;
  } else if (state.advancedPending) {
    el.textContent=prose("正在筛选…","Running expression…");
  } else if (state.screen.expression&&state.advancedIds) {
    const count=state.classification==="economic"?
      industryView().companies.filter(row=>state.advancedIds.has(row.id)).length:state.advancedIds.size;
    el.textContent=number(count)+" "+prose("家企业符合表达式，其他筛选条件继续生效。","companies match the expression. Other screen filters still apply.");
  } else {
    el.textContent="";
  }
}
async function applyAdvanced() {
  const token=++advancedToken, expression=state.screen.expression;
  state.advancedError=null;
  state.advancedPending=Boolean(expression);
  state.advancedIds=null;
  resetPage();
  advancedStatus();
  renderTable();
  if (!expression) return;
  try {
    const result=await requestAdvanced(expression,state.year);
    if (token!==advancedToken) return;
    state.advancedIds=result;
  } catch (error) {
    if (token!==advancedToken) return;
    state.advancedError=error.message;
  }
  state.advancedPending=false;
  advancedStatus();
  if (state.tab==="screen") renderTable();
}
function setScope() {
  const cn=$("scope-cn").checked,ex=$("scope-ex").checked;
  const statistics=state.tab==="statistics"&&statisticsCoverage.has(state.source);
  if (statistics) statisticsPeriods.set(statisticsPeriodKey(),{year:state.year,mode:state.mode});
  state.scope=cn&&ex?"world":cn?"cn":ex?"ex":null;
  if (statistics) {
    useStatisticsYear();
    syncControls();
  }
  if (state.profile) {
    if (state.scope&&visibleInScope(profileIssuer(state.profile),state.scope)) renderProfile();
    else closeProfile();
  }
  resetPage();renderTable();
}
function changeScreen(field,value) {
  state.screen[field]=value;state.screen.preset="";$("screen-preset").value="";$("delete-preset").hidden=true;
  resetPage();renderTable();
}

function handleGrid(event) {
  const b=event.target.closest("button");
  if (!b) return;
  if (b.dataset.openProfile) {
    const detail=b.closest(".detail-row")?state.detail:null;
    showProfile(b.dataset.openProfile,detail?.metric,detail?.year,detail?state.mode:"level",b);
    return;
  }
  if (b.hasAttribute("data-close-detail")) {state.detail=null;renderTable();return;}
  if (b.hasAttribute("data-detail-year")) {state.detail={...state.detail,year:Number(b.dataset.detailYear)};renderTable();return;}
  if (b.hasAttribute("data-chart-metric")&&state.detail) {pin(records.get(state.detail.id),b.dataset.chartMetric);return;}
  const id=b.closest("[data-row]")?.dataset.row,row=records.get(id)??issuerFor(id);
  if (!row) return;
  if (b.hasAttribute("data-expand")) {
    if (state.expanded.has(row.id)) state.expanded.delete(row.id);else state.expanded.add(row.id);
    renderTable();
  } else if (b.hasAttribute("data-watch")) {toggleWatch(row);renderTable();}
  else if (b.hasAttribute("data-pin")) pin(row);
  else if (b.dataset.metric||b.hasAttribute("data-row-label")) {
    const metric=b.dataset.metric||columns()[0];
    if (row.kind==="company") {
      showProfile(row.id,metric,state.year,state.mode,b);
      return;
    }
    state.detail=state.detail?.id===row.id&&state.detail.metric===metric?null:{id:row.id,metric,year:state.year};
    renderTable();
  }
}
function paneSelection(module=state.module) {
  if (module==="atlas"&&["#data","#trends"].includes(location.hash)) return [location.hash.slice(1)];
  const allowed=paneOrder[module]??[];
  if (!allowed.length) return [];
  const items=allowed.filter(key=>prefs.modulePanels?.[module]?.includes(key));
  const old=prefs.chartWorkbench?.view;
  const defaults=module==="atlas"||old==="split"?allowed:old==="charts"?["charts"]:["data"];
  const selected=items.length?items:defaults;
  if (!phoneLayout.matches) return selected;
  const preferred=prefs.phonePanels?.[module];
  return [allowed.includes(preferred)?preferred:selected[0]];
}
function updateViewPanel(key,visible=!paneSelection().includes(key)) {
  if (!paneOrder[state.module]?.includes(key)) return false;
  const selected=new Set(paneSelection());
  if (visible===selected.has(key)||(!visible&&selected.size===1)) return false;
  if (visible) selected.add(key);
  else selected.delete(key);
  if (state.module==="atlas"&&["#data","#trends"].includes(location.hash)) {
    history.replaceState(null,"",location.pathname+location.search);
  }
  if (phoneLayout.matches) prefs.phonePanels={...prefs.phonePanels,[state.module]:key};
  else prefs.modulePanels={...prefs.modulePanels,[state.module]:[...selected]};
  save();
  setWorkspaceView();
  return true;
}
function setWorkspaceView() {
  const collecting=state.module==="collection",graphing=graphModules.has(state.module);
  const workspace=$("workspace");
  workspace.hidden=graphing;
  $("chain-page").hidden=$("chain-heading").hidden=state.module!=="chains";
  $("chain-values-page").hidden=$("chain-values-heading").hidden=state.module!=="chain-values";
  $("atlas-heading").hidden=$("atlas-views").hidden=state.module!=="atlas";
  $("collection-heading").hidden=$("collection-views").hidden=!collecting;
  $("chain-views").hidden=!graphing;
  if (graphing) {
    for (const button of $("chain-views").querySelectorAll("[data-chain-view]")) {
      button.setAttribute("aria-pressed",String(button.dataset.chainView===state.module));
    }
    return;
  }
  const active=paneSelection(), has=key=>active.includes(key);
  const primary=collecting?"charts":"trends";
  const split=has("data")&&has(primary);
  workspace.dataset.view=!collecting&&split?"split":has("data")?"data":"trends";
  workspace.dataset.module=state.module;
  workspace.toggleAttribute("data-collection-split",collecting&&split);
  workspace.toggleAttribute("data-profile-visible",!!state.profile);
  for (const button of $(state.module+"-views").querySelectorAll("[data-view-panel]")) {
    button.setAttribute("aria-pressed",String(has(button.dataset.viewPanel)));
  }
  $("explorer").hidden=collecting||!has("data");
  $("comparison").hidden=collecting||!has("trends");
  $("collection").hidden=!collecting||!has("data");
  $("collection-workbench").hidden=!collecting||!has("charts");
  $("profile-panel").hidden=!state.profile;
  refreshSplitters();
  requestAnimationFrame(()=>{if (collecting) repaintSavedChart();else if(has("trends")) redraw($("charts"),state.charts,meta);});
}
const modulePositions=new Map();
let atlasHash="",chainPage,chainValues;
function showChainPage(relocalize=false) {
  chainPage??=import("./chain-page.js");
  void chainPage.then(({renderChainPage})=>{
    if (state.module!=="chains") return;
    renderChainPage($("chain-page"),relocalize,{showChainCompany,closeProfile,watched:chainCompanyWatched});
    if (state.profile) {
      $("chain-inspector").append($("profile-panel"));
      if (!relocalize) renderProfile(true);
    }
  }).catch(error=>{
    chainPage=undefined;
    console.error(error);
    $("chain-page").textContent=pair("产业链图谱载入失败。","The value chain atlas could not load.");
  });
}
function showChainValues() {
  const page=$("chain-values-page");
  if (!chainValues) {
    page.textContent=pair("正在读取行业数据…","Loading industry data…");
    chainValues=Promise.all([import("./chain-values.js"),api("meta")])
      .then(async ([view,m])=>[view,m,await loadEconomicData(m)]);
  }
  void chainValues.then(([view,m,data])=>{
    if (state.module==="chain-values") view.renderChainValues(page,m,data);
  }).catch(error=>{
    chainValues=undefined;
    console.error(error);
    if (state.module==="chain-values") page.textContent=pair("产业链数值图谱载入失败。","Value Chain Metrics could not load.");
  });
}
const profileScrollSelectors=["#profile-body","#profile-peers .radar-values","#profile-history .profile-grid"];
const readScroll=element=>element?[element.scrollLeft,element.scrollTop]:null;
function restoreScroll(element,position) {
  if (element&&position) element.scrollTo(...position);
}
function selectModule(module,keepProfile=false) {
  if (state.module===module) return;
  const selectors=state.module==="collection"?"#collection,#collection .table-scroll,#collection-charts":
    "#explorer .table-scroll,#explorer .filter-pane,#charts";
  const chartRoot=state.module==="collection"?$("work-area"):$("charts");
  modulePositions.set(state.module,{
    scroll:[...document.querySelectorAll(selectors)].filter(element=>element.getClientRects().length).map(element=>[element,readScroll(element)]),
    charts:[...chartRoot.querySelectorAll(".chart-numbers[open] .chart-numbers-scroll")].filter(element=>element.getClientRects().length).map(element=>
      [element.closest("[data-chart]").dataset.chart,element.closest("[data-chart-part]")?.dataset.chartPart??"0",readScroll(element)]),
    profile:state.profile&&{...state.profile},trigger:profileTrigger,related:$("profile-panel").hasAttribute("data-related-view"),
    profileScroll:profileScrollSelectors.map(selector=>readScroll(document.querySelector(selector)))
  });
  if (!keepProfile) closeProfile();
  if (state.module==="chains") $("workspace").append($("profile-panel"));
  if (graphModules.has(module)&&location.hash!=="#"+module) {
    if (!graphModules.has(state.module)&&!graphModuleFromHash()) atlasHash=location.hash;
    history.replaceState(null,"",location.pathname+location.search+"#"+module);
  } else if (!graphModules.has(module)&&graphModules.has(state.module)&&graphModuleFromHash()) {
    history.replaceState(null,"",location.pathname+location.search+atlasHash);
  }
  state.module=module;
  if (graphModules.has(module)) lastGraphModule=module;
  for (const button of document.querySelectorAll(".module-nav [data-module]")) {
    if (button.dataset.module===module||button.dataset.module==="chains"&&graphModules.has(module)) button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  }
  const saved=modulePositions.get(module);
  if (!keepProfile&&saved?.profile) {
    const row=profileIssuer(saved.profile);
    if (row) {
      state.profile={...saved.profile,id:row.id};
      profileTrigger=saved.trigger;
      $("profile-panel").hidden=false;
      $("profile-panel").toggleAttribute("data-related-view",saved.related);
    }
  }
  setWorkspaceView();
  if (module==="chains") {showChainPage();return;}
  if (module==="chain-values") {showChainValues();return;}
  if (module==="collection") renderCollection();
  else renderTable();
  if (!keepProfile&&state.profile) {
    renderProfile(true);
    profileScrollSelectors.forEach((selector,i)=>restoreScroll(document.querySelector(selector),saved.profileScroll[i]));
  }
  for (const [element,position] of saved?.scroll??[]) restoreScroll(element,position);
  const targetCharts=module==="collection"?$("work-area"):$("charts");
  for (const [id,part,position] of saved?.charts??[]) {
    restoreScroll(targetCharts.querySelector('[data-chart="'+CSS.escape(id)+'"] [data-chart-part="'+part+'"] .chart-numbers-scroll'),position);
  }
}
function wire() {
  hideTip=bindGlossary();
  wireCollection({meta,financialGroups:profileGroups,levelOf:outlineLevel,showWorkbench:()=>updateViewPanel("charts",true),
    onSaved:title=>status(pair("已保存至工作台","Saved to workbench")+" · "+title)});
  wireWatchlist({meta,records,getView:industryView,getInitialScheme:()=>state.classification,
    getYear:()=>["benchmark","statistics"].includes(state.tab)?financialPeriod?.year??state.year:state.year,
    getColumns:()=>columns("watchlist"),loadEconomic:loadEconomicView,onColumns:()=>openColumns("watchlist"),
    heatRanges,heat,heatEnabled:()=>state.heat,hideTip,
    onProfile:(id,trigger,source,year)=>showProfile(id,null,year,"level",trigger,source)});
  document.querySelectorAll('.module-nav [data-module]:not([data-module="chains"])').forEach(button=>button.onclick=()=>selectModule(button.dataset.module));
  wireLayout(id=>getWorkbenchChart(id)??state.charts.find(chart=>chart.id===Number(id)),()=>hideTip(),
    handle=>{
      if (handle.closest("#collection-workbench")) persistWorkbench();
      else if (handle.closest("#charts")) persistTrendCharts();
    });
  $("settings-language").onchange=e=>rerenderLanguage(e.target.value);
  document.querySelectorAll("[data-tab]").forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.tab));
  $("scope-cn").onchange=setScope;$("scope-ex").onchange=setScope;
  $("year").onchange=e=>{
    state.year=Number(e.target.value);
    if (state.tab==="benchmark") benchmarkPeriod.years.set(state.region,state.year);
    else if (state.profile) {state.profile={...state.profile,year:state.year};renderProfile();}
    resetPage();if (state.tab==="screen") void applyAdvanced();else renderTable();
  };
  $("series-mode").onchange=e=>{state.mode=e.target.value;resetPage();renderTable();};
  $("classification").onchange=e=>void setClassification(e.target.value);
  $("start-level").onchange=e=>{
    state.startLevel=prefs.startLevel=Number(e.target.value);
    state.expanded.clear();save();resetPage();renderTable();
  };
  $("aggregate").onchange=e=>{state.aggregate=e.target.value;resetPage();renderTable();};
  $("company-coverage").onchange=e=>{state.coverage[state.tab]=Number(e.target.value);resetPage();renderTable();};
  $("benchmark-region").onchange=e=>{state.region=e.target.value;useBenchmarkYear();syncControls();resetPage();renderTable();};
  $("stat-source").onchange=e=>void switchTab("statistics",{source:e.target.value});
  bindSearch($("search"),value=>{state.search=value;resetPage();},renderTable);
  $("heat").onchange=e=>{
    state.heat=prefs.heat=e.target.checked;save();
    if (state.module==="collection") renderWatchlist();else renderTable();
  };
  $("collapse").onclick=()=>{state.expanded.clear();state.search="";$("search").value="";resetPage();renderTable();};
  $("export").onclick=exportTable;
  $("grid-head").onclick=e=>{
    const b=e.target.closest("[data-sort]");
    if (!b) return;
    state.desc=state.sort===b.dataset.sort?!state.desc:b.dataset.sort!=="name";
    state.sort=b.dataset.sort;resetPage();renderTable();
  };
  gridBody.onclick=handleGrid;
  $("table-pagination").onclick=e=>{
    const b=e.target.closest("[data-table-page]");
    if (b) {
      state.page=Number(b.dataset.tablePage);state.detail=null;renderTable();
      gridBody.closest(".table-scroll").scrollTop=0;
    }
  };
  $("screen-preset").onchange=async e=>{
    const previous=state.screen;
    state.screen=presetFor(e.target.value)||{...previous,preset:""};
    const group=state.screen.industry[0];
    if (group&&!await setClassification(group.startsWith("ef-")?"economic":"isic")) state.screen=previous;
    $("advanced-panel").open=Boolean(state.screen.expression);
    screenControls();void applyAdvanced();
  };
  $("reset-screen").onclick=()=>{
    state.screen=initialScreen();$("advanced-panel").open=false;screenControls();void applyAdvanced();
  };
  $("advanced-form").onsubmit=e=>{
    e.preventDefault();
    state.screen.expression=$("advanced-input").value.trim();
    state.screen.preset="";
    $("screen-preset").value="";
    $("delete-preset").hidden=true;
    void applyAdvanced();
  };
  $("advanced-fields").onclick=e=>{
    const button=e.target.closest("[data-screen-example]");
    if (!button) return;
    $("advanced-input").value=button.dataset.screenExample;
    $("advanced-form").requestSubmit();
  };
  $("add-rule").onclick=()=>{
    state.screen.rules.push({metric:"revenue",mode:"level",op:"ge",threshold:""});
    state.screen.preset="";screenControls();$("rules").querySelector(".rule-line:last-child input")?.focus();
  };
  $("rules").onchange=e=>{
    const line=e.target.closest("[data-rule]"),field=e.target.dataset.ruleField;
    if (!line||!field) return;
    const rule=state.screen.rules[Number(line.dataset.rule)];
    rule[field]=e.target.value;
    if (field==="metric"||field==="mode") line.querySelector("small").textContent=unitLabel(rule.metric,rule.mode,meta);
    changeScreen("rules",state.screen.rules);
  };
  $("rules").onclick=e=>{
    const b=e.target.closest("[data-remove-rule]");
    if (!b) return;
    state.screen.rules.splice(Number(b.closest("[data-rule]").dataset.rule),1);
    changeScreen("rules",state.screen.rules);screenControls();
  };
  $("save-preset").onclick=()=>{
    const input=$("preset-name");
    input.value="";input.setCustomValidity("");
    $("preset-dialog").returnValue="";$("preset-dialog").showModal();
  };
  $("cancel-preset").onclick=()=>$("preset-dialog").close();
  $("preset-name").oninput=event=>event.target.setCustomValidity("");
  $("preset-form").onsubmit=event=>{
    const input=$("preset-name");
    if (!input.value.trim()) {
      event.preventDefault();
      input.setCustomValidity(pair("请输入方案名称。","Enter a preset name."));
      input.reportValidity();
    }
  };
  $("preset-dialog").onclose=()=>{
    const title=$("preset-name").value.trim();
    if ($("preset-dialog").returnValue==="save"&&title) {state.screen.preset=savePreset(title,state.screen);screenControls();}
  };
  $("delete-preset").onclick=()=>{deletePreset(state.screen.preset);state.screen.preset="";screenControls();};
  $("screen-only-watch").onchange=e=>changeScreen("onlyWatch",e.target.checked);
  $("edit-columns").onclick=()=>openColumns();
  $("column-glossary").onchange=event=>{prefs.columnGlossary=event.target.checked;save();renderColumns();};
  $("column-list").onchange=()=>{
    const keys=[...$("column-list").querySelectorAll("[data-column]:checked")].map(x=>x.dataset.column);
    if (keys.length) setColumns(keys);else renderColumns();
  };
  $("column-groups").onclick=e=>{
    const key=e.target.closest("[data-column-preset]")?.dataset.columnPreset;
    if (!key) return;
    const available=allColumns(columnView);
    setColumns(key==="default"?null:key==="all"?available:presets[key][2].filter(k=>available.includes(k)));
  };
  // Older mobile browsers ignore closedby="any".
  for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
    let startedOutside=false;
    const onBackdrop=event=>{
      if (event.target!==dialog) return false;
      const {left,right,top,bottom}=dialog.getBoundingClientRect();
      return event.clientX<left||event.clientX>=right||event.clientY<top||event.clientY>=bottom;
    };
    dialog.addEventListener("pointerdown",event=>{startedOutside=event.isPrimary&&event.button===0&&onBackdrop(event);});
    dialog.addEventListener("pointercancel",()=>{startedOutside=false;});
    dialog.addEventListener("click",event=>{
      const dismiss=startedOutside&&dialog.open&&onBackdrop(event);
      startedOutside=false;
      if (dismiss) dialog.close();
    });
  }
  $("method").onclick=()=>$("method-dialog").showModal();
  $("settings-theme").onchange=e=>{
    prefs.uiTheme=e.target.value;
    if(e.target.value) document.documentElement.dataset.uiTheme=e.target.value;
    else delete document.documentElement.dataset.uiTheme;
    save();
    redraw($("charts"),state.charts,meta);
    if (state.module==="collection") repaintSavedChart();
    repaintPeerRadar();
  };
  $("settings-font").onchange=e=>{
    prefs.font=e.target.value;
    if(e.target.value) document.documentElement.dataset.font=e.target.value;
    else delete document.documentElement.dataset.font;
    save();
  };
  const displayFields={"settings-align":"align","settings-indent":"indentHierarchy","settings-level-colors":"colorHierarchy"};
  for (const [id,key] of Object.entries(displayFields)) $(id).onchange=e=>{
    prefs[key]=e.target.type==="checkbox"?e.target.checked:e.target.value;
    applyTableDisplay();
    save();
  };
  $("chain-settings-grid").onchange=()=>{
    prefs.chainExplorer={...(prefs.chainExplorer??{}),
      direction:$("chain-setting-direction").value,
      lightFirst:$("chain-setting-ramp").value==="light",
      owned:$("chain-setting-owned").value==="own",
      shared:$("chain-setting-shared").checked};
    save();
    document.dispatchEvent(new CustomEvent("chain-settings-change"));
  };
  $("radar-metric-list").onchange=e=>{
    const metric=e.target.dataset.radarMetric;
    if (!metric) return;
    const current=selectedRadarMetrics(meta);
    prefs.radarMetrics=e.target.checked?[...current,metric]:current.filter(key=>key!==metric);
    save();
    radarSelectionCount();
    refreshProfileRadar();
  };
  $("radar-defaults").onclick=()=>{
    delete prefs.radarMetrics;
    save();
    renderRadarSettings();
    refreshProfileRadar();
  };
  function syncChainSettings() {
  const p=prefs.chainExplorer??{};
  $("chain-setting-direction").value=["adaptive","horizontal","vertical"].includes(p.direction)?p.direction:"adaptive";
  $("chain-setting-ramp").value=p.lightFirst===true?"light":"dark";
  $("chain-setting-owned").value=p.owned===true?"own":"full";
  $("chain-setting-shared").checked=p.shared===true;
}
$("settings").onclick=()=>{
    $("hover-enabled").checked=prefs.hover;renderGlossarySettings();renderRadarSettings();syncChainSettings();$("settings-dialog").showModal();
    void loadAISettings();
  };
  $("hover-enabled").onchange=e=>{prefs.hover=e.target.checked;save();};
  $("term-list").onchange=e=>{if(e.target.dataset.hint){prefs.hints[e.target.dataset.hint]=e.target.checked;save();}};
  $("terms-all").onclick=()=>{setAllHints(true);renderGlossarySettings();};
  $("terms-none").onclick=()=>{setAllHints(false);renderGlossarySettings();};
  $("settings-dialog").onclose=()=>{resetAISettings();rerenderLanguage(prefs.language);};
  document.addEventListener("click",e=>{
    if (!e.target.closest("[data-locate-series],#grid tr.located .row-label")) clearLocatedRow();
  },true);
  document.addEventListener("keydown",e=>{
    if (e.key==="Escape"&&state.profile&&$("term-tooltip").hidden&&!document.querySelector("dialog[open],.filter-note:popover-open")) closeProfile(true);
  },true);
  $("profile").onclick=e=>{
    const b=e.target.closest("button"),p=state.profile;
    if (!b||!p) return;
    const row=profileIssuer(p);
    if (b.dataset.profileYearStep) {
      const year=meta.years[meta.years.indexOf(p.year)+Number(b.dataset.profileYearStep)];
      if (year===undefined) return;
      state.profile={...p,year};
      renderProfile();renderTable();
      const controls=$("profile").querySelectorAll('[data-year-control="'+b.dataset.yearControl+'"]');
      [...controls].find(button=>!button.disabled&&button.dataset.profileYearStep===b.dataset.profileYearStep)?.focus({preventScroll:true});
      return;
    }
    if (b.dataset.priceYears) {
      prefs.stockPriceYears=Number(b.dataset.priceYears);
      save();
      renderStockPrice($("profile-stock"),row.code);
      $("profile-stock").querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
      return;
    }
    if (b.hasAttribute("data-profile-close")) closeProfile(true);
    else if (b.dataset.profileMetric) {
      state.profile={...p,metric:b.dataset.profileMetric,year:Number(b.dataset.year)};
      renderProfile();renderTable();
      $("profile-calculation").scrollIntoView({block:"nearest"});
      $("profile-metric").focus({preventScroll:true});
    }
    else if (b.hasAttribute("data-profile-watch")) {
      toggleWatch(row);
      const watched=isWatched(row);
      b.textContent=watched?"★":"☆";
      b.setAttribute("aria-pressed",String(watched));
      if (state.tab!=="directory"&&state.module==="atlas") renderTable();
      if (state.module==="collection") renderWatchlist();
    }
    else if (b.hasAttribute("data-profile-peers")) {
      void (async()=>{
        if (!await setClassification(p.peerScheme,{locating:true})) return;
        const {peerIssuer}=profilePeerGroup(p,row);
        selectModule("atlas",true);
        state.screen={...initialScreen(),industry:[peerIssuer.parent]};
        await switchTab("screen",{keepProfile:true});
      })();
    } else if (b.hasAttribute("data-profile-bench")) {
      selectModule("atlas",true);
      void switchTab("benchmark",{search:row.benchmark,keepProfile:true});
    }
  };
  $("profile").onchange=e=>{
    const {id,value}=e.target,p=state.profile;
    if (!p) return;
    if (id==="profile-peer-scheme") {void setProfilePeerScheme(value);return;}
    if (id==="profile-group") {
      p.group=value;
      refreshProfileHistory(p);
    } else if (id==="profile-metric"||id==="profile-mode") {
      const updated=state.profile={...p,[id==="profile-mode"?"mode":"metric"]:value};
      if (id==="profile-mode") refreshProfileHistory(updated);
      void showProfileEvidence(updated,$("profile-evidence"));
      if (state.module==="atlas") renderTable();
    }
  };
  document.querySelectorAll("[data-view-panel]").forEach(button=>button.onclick=()=>updateViewPanel(button.dataset.viewPanel));
  const syncWorkspace=()=>{
    const module=graphModuleFromHash();
    if (module&&state.module!==module) selectModule(module);
    else if (!module&&graphModules.has(state.module)) selectModule("atlas");
    else setWorkspaceView();
  };
  window.addEventListener("hashchange",syncWorkspace);
  phoneLayout.addEventListener("change",syncWorkspace);
  syncWorkspace();
  $("add-chart").onclick=()=>{
    const chart={id:state.nextChart++,row:nextChartRow(),metric:columns()[0]??"revenue",mode:state.mode,pins:[]};
    state.charts.push(chart);state.active=chart.id;showCharts(true);
  };
  $("charts").onchange=e=>{
    const card=e.target.closest("[data-chart]");
    const chart=state.charts.find(c=>c.id===Number(card?.dataset.chart));
    if (!chart) return;
    if (e.target.matches("[data-chart-metric]")) {chart.metric=e.target.value;showCharts(true);}
    else if (e.target.matches("[data-chart-mode]")) {chart.mode=e.target.value;showCharts(true);}
    else if (e.target.matches("[data-chart-base]")) {
      chart.baseline=Number(e.target.value)||null;
      redraw($("charts"),[chart],meta);
      persistTrendCharts();
    }
  };
  $("charts").addEventListener("toggle",event=>{
    const details=event.target;
    if (!details.matches(".chart-numbers")) return;
    const chart=state.charts.find(c=>c.id===Number(details.closest("[data-chart]")?.dataset.chart));
    if (!chart||Boolean(chart.valuesOpen)===details.open) return;
    chart.valuesOpen=details.open;
    persistTrendCharts();
  },true);
  $("charts").onclick=e=>{
    const b=e.target.closest("button"),chart=state.charts.find(c=>c.id===Number(b?.closest("[data-chart]")?.dataset.chart));
    if (!b||!chart) return;
    if (b.hasAttribute("data-locate-series")) {void locateSeries(chart.pins[Number(b.dataset.locateSeries)],b);return;}
    if (b.hasAttribute("data-copy-chart")) {
      const copy={...chart,id:state.nextChart++,pins:[...chart.pins],defaultPins:false,weight:undefined};
      state.charts=insertChartBelow(state.charts,chart,copy);
      showCharts(true);
      $("charts").querySelector('[data-chart="'+copy.id+'"] [data-chart-metric]').focus();
      return;
    }
    if (b.hasAttribute("data-save-chart")) {if (chart.pins.length) openSaveChart(chart);return;}
    if (b.hasAttribute("data-move-chart")) state.charts=moveChartInRows(state.charts,chart,Number(b.dataset.moveChart));
    if (b.hasAttribute("data-chart-active")) state.active=chart.id;
    if (b.hasAttribute("data-chart-remove")) {
      state.charts=state.charts.filter(c=>c!==chart);
      for (const other of state.charts) if (other.row===chart.row) delete other.weight;
      if (state.active===chart.id) state.active=state.charts.at(-1)?.id;
    }
    if (b.hasAttribute("data-drop")) {
      chart.pins.splice(Number(b.dataset.drop),1);
      chart.defaultPins=false;
    }
    showCharts(true);
  };
}
async function init() {
  applyStatic();$("settings-language").innerHTML=options(languages,prefs.language);
  const theme=themeOptions.some(([id])=>id===prefs.uiTheme)?prefs.uiTheme:"hm-slate-soft";
  $("settings-theme").innerHTML=options(themeOptions,theme);
  $("settings-font").value=prefs.font||"";
  applyTableDisplay();
  document.documentElement.dataset.uiTheme=theme;
  if (prefs.font) document.documentElement.dataset.font=prefs.font;
  document.querySelector('.module-nav [data-module="chains"]').onclick=()=>selectModule(lastGraphModule);
  for (const button of $("chain-views").querySelectorAll("[data-chain-view]")) button.onclick=()=>selectModule(button.dataset.chainView);
  const graphModule=graphModuleFromHash();
  if (graphModule) selectModule(graphModule);
  status(prose("正在读取数据快照…","Loading the data snapshot…"));
  try {
    const [m,f,markets,x]=await Promise.all([api("meta"),api("financial"),api("markets"),research("index").catch(()=>null)]);
    meta=m;
    meta.metrics.firms=["基准样本企业数","count"];
    state.year=meta.years.at(-1);
    const companies=f.companies.map(r=>({...r,kind:"company",currency:"USD",en:x?.englishCompanyNames?.[r.id]||r.en||r.name}));
    registerIndustryView("isic",meta.taxonomy,companies,f.aggregates);
    registerMarkets(markets);
    await restoreTrendCharts();
    syncControls();renderMethods();wire();renderTable();showCharts();
    if (state.module==="chains") showChainPage();
    $("classification").disabled=false;
    $("add-chart").disabled=false;
  } catch (error) {
    console.error("AlphaNode initialization failed",error);
    status(prose("工作台载入失败。","The workbench could not load.")+" "+error.message);
  }
}
void init();
