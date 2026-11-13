import {$,bindSearch,downloadCSV,esc,finite,format,measure,modeLabel,modes,options,qualityNotes,scale,unitLabel} from "./model.js";
import {companyNames,countryName,locale,nameOf,pair,prefs,prose,scopeLabel} from "./i18n.js";
import {glossary,metricLabel} from "./glossary.js";
import {isWatched,issuerFilterOptions,matchesIndustry,pagerHTML,tablePageSize} from "./screener.js";
import {renderFilterPicker} from "./filter-picker.js";

const filters={scope:"world",country:[],classification:null,industry:[],search:"",mode:"level",year:null,sort:null,desc:false,page:0};
let config;
const select=key=>$("watch-"+key);

function updateFilter(key,value) {
  filters[key]=value;
  filters.page=0;
  renderWatchlist();
  $("watch-table").parentElement.scrollTop=0;
}

export function wireWatchlist(input) {
  config=input;
  for (const key of ["scope","mode","year"]) select(key).onchange=event=>
    updateFilter(key,key==="year"?Number(event.target.value):event.target.value);
  bindSearch(select("search"),value=>{filters.search=value;filters.page=0;},()=>{
    renderWatchlist();$("watch-table").parentElement.scrollTop=0;
  });
  select("toggle-filters").onclick=()=>{
    const panel=select("filters");
    panel.hidden=!panel.hidden;
    select("toggle-filters").setAttribute("aria-expanded",String(!panel.hidden));
  };
  select("collapse").onclick=()=>{
    for (const block of $("collection").querySelectorAll(":scope > details")) block.open=false;
    $("watchlist-title").focus({preventScroll:true});
  };
  select("classification").onchange=async event=>{
    const scheme=event.target.value;
    const control=select("classification");
    if (!config.getView(scheme)) {
      control.disabled=true;
      try {await config.loadEconomic();}
      catch {
        control.value=filters.classification;
        select("status").textContent=pair("暂时无法读取产业链分类。","Economic classification is unavailable.");
        select("status").hidden=false;
        return;
      } finally {control.disabled=false;}
    }
    filters.classification=scheme;
    updateFilter("industry",[]);
  };
  select("columns").onclick=config.onColumns;
  $("collection-watchlist").onclick=event=>{
    const button=event.target.closest("[data-watch-issuer]");
    if (button) config.onProfile(button.dataset.watchIssuer,button,{scheme:filters.classification,scope:filters.scope},filters.year??config.getYear());
  };
  select("head").onclick=event=>{
    const key=event.target.closest("[data-watch-sort]")?.dataset.watchSort;
    if (!key) return;
    filters.desc=filters.sort===key?!filters.desc:!["name","industry"].includes(key);
    filters.sort=key;filters.page=0;
    renderWatchlist();
    $("watch-table").parentElement.scrollTop=0;
    select("head").querySelector('[data-watch-sort="'+CSS.escape(key)+'"]')?.focus({preventScroll:true});
  };
  select("pagination").onclick=event=>{
    const button=event.target.closest("[data-watch-page]");
    if (!button) return;
    filters.page=Number(button.dataset.watchPage);
    renderWatchlist();
    $("watch-table").parentElement.scrollTop=0;
  };
}

export function renderWatchlist() {
  const {meta,getView,getInitialScheme,getYear,getColumns,records}=config;
  filters.classification??=getInitialScheme();
  config.hideTip();
  select("status").hidden=true;
  const view=getView(filters.classification),year=filters.year??getYear(),metrics=getColumns();
  const {countries,industries}=issuerFilterOptions(view,filters.classification);
  select("year").innerHTML=options([...meta.years].reverse().map(value=>[value,String(value)]),year);
  select("scope").innerHTML=options(["world","cn","ex"].map(id=>[id,scopeLabel(id)]),filters.scope);
  renderFilterPicker(select("country"),countries,filters.country,pair("全部经济体","All economies"),ids=>updateFilter("country",ids));
  select("classification").innerHTML=options([["isic","ISIC Rev.4"],["economic",pair("产业链功能","Economic function")]],filters.classification);
  renderFilterPicker(select("industry"),industries,filters.industry,pair("全部行业","All industries"),ids=>updateFilter("industry",ids));
  select("mode").innerHTML=options(Object.keys(modes).map(key=>[key,modeLabel(key)]),filters.mode);

  const query=filters.search.trim().toLowerCase(),watched=view.companies.filter(isWatched);
  $("watchlist-count").textContent=" · "+watched.length.toLocaleString(locale());
  const companies=watched.filter(row=>(filters.scope==="world"||row.region===filters.scope)&&
    (!filters.country.length||filters.country.includes(row.country))&&matchesIndustry(row,filters.industry,records)&&
    (!query||[row.code,...companyNames(row),...(row.aliases??[]).flatMap(alias=>[alias.code,alias.name,alias.en])]
      .some(term=>String(term??"").toLowerCase().includes(query))));
  filters.page=Math.min(filters.page,Math.max(0,Math.ceil(companies.length/tablePageSize)-1));
  const start=filters.page*tablePageSize,mode=filters.mode,scope=filters.scope;
  if (filters.sort&&!["name","industry",...metrics].includes(filters.sort)) filters.sort=null;
  const rows=companies.map(row=>({row,name:nameOf(row),industry:nameOf(records.get(row.parent)),metrics:new Map()}));
  function observation(entry,key) {
    if (!entry.metrics.has(key)) entry.metrics.set(key,measure(entry.row,key,year,scope,"sum",mode,meta));
    return entry.metrics.get(key);
  }
  const key=filters.sort,direction=filters.desc?-1:1;
  if (key) rows.sort((a,b)=>{
    if (key==="name"||key==="industry") return direction*a[key].localeCompare(b[key],locale(),{numeric:true});
    const av=observation(a,key).value,bv=observation(b,key).value;
    if (finite(av)!==finite(bv)) return finite(av)?-1:1;
    return finite(av)&&av!==bv?direction*(av-bv):a.name.localeCompare(b.name,locale());
  });
  const ranges=config.heatEnabled()?config.heatRanges(rows,metrics,(entry,key)=>observation(entry,key).value):new Map();
  function heading(key,label,unit="") {
    const order=filters.sort===key?(filters.desc?"descending":"ascending"):"none";
    const hint=glossary[key]&&prefs.hints[key]!==false?' data-term-hover="'+esc(key)+'"':"";
    return '<th scope="col" aria-sort="'+order+'"><button type="button" data-watch-sort="'+esc(key)+'"><span'+hint+'>'+
      esc(label)+'</span><span aria-hidden="true">'+(order==="none"?" ↕":order==="ascending"?" ↑":" ↓")+'</span>'+
      (unit?'<small class="unit">'+esc(unit)+'</small>':"")+'</button></th>';
  }
  select("head").innerHTML="<tr>"+heading("name",pair("企业","Company"))+heading("industry",pair("行业分组","Industry group"))+
    metrics.map(key=>heading(key,metricLabel(key,meta),unitLabel(key,mode,meta))).join("")+"</tr>";
  $("collection-watchlist").innerHTML=rows.slice(start,start+tablePageSize).map(entry=>{
    const cells=metrics.map(key=>{
      const {value,note}=observation(entry,key);
      const tint=finite(value)?config.heat(value,ranges.get(key+"-company"),key,mode):"";
      const text=format(value,key,mode,meta),warning=qualityNotes[note];
      return '<td'+tint+'>'+esc(text)+(warning?'<sup class="data-marker" title="'+esc(prose(...warning))+'" aria-label="'+
        esc(pair("有数据说明","Data note available"))+'">!</sup>':"")+'</td>';
    }).join("");
    const {row,name,industry}=entry;
    return '<tr><td><button type="button" class="row-label" data-watch-issuer="'+esc(row.id)+'"><b>'+esc(name)+
      '</b><small>'+esc(row.code+" · "+countryName(row.country))+'</small></button></td><td>'+esc(industry)+'</td>'+cells+'</tr>';
  }).join("")||'<tr><td class="empty-cell" colspan="'+(metrics.length+2)+'">'+
    esc(watched.length?pair("当前筛选下没有自选企业。","No watched companies match these filters."):
      pair("点击企业介绍中的星标，将企业加入自选。","Star a company from its profile to add it here."))+'</td></tr>';
  select("export").onclick=()=>{
    const headers=[pair("代码","Ticker"),pair("企业","Company"),pair("归属经济体","Issuer economy"),pair("行业分组","Industry group"),
      pair("年份","Year"),pair("时间基准","Time basis"),...metrics.map(key=>metricLabel(key,meta)+" ("+unitLabel(key,mode,meta)+")")];
    const records=rows.map(entry=>[entry.row.code,entry.name,countryName(entry.row.country),entry.industry,year,modeLabel(mode),
      ...metrics.map(key=>{
        const value=observation(entry,key).value;
        return finite(value)?scale(value,key,mode,meta):"";
      })]);
    downloadCSV([headers,...records],"AlphaNode-watchlist-"+year+".csv");
  };
  select("pagination").innerHTML=pagerHTML(filters.page,companies.length,tablePageSize,"watch");
}
