import {api,downloadCSV,esc,finite,format,heatColor,heatExtent,options,unitLabel} from "./model.js";
import {countryName,chineseEconomyName,nameOf,pair,prose,locale,prefs,save} from "./i18n.js";
import {redraw,renderCharts,chartActions,chartRows,insertChartBelow,moveChartInRows} from "./chart.js";
import {openSaveChart,compactChartSubjects} from "./saved-charts.js";
import {bindChainSplitter} from "./chain-viewport.js";
import {columnResizeHandle} from "./layout.js";
import {renderFilterPicker} from "./filter-picker.js";
import {pairScatter} from "./scatter-chart.js";

const frequencies={A:["年度","Annual"],Q:["季度","Quarterly"],M:["月度","Monthly"]};
const transformations={level:["原值","Original"],yoy:["同比增速","Year-on-year growth"],diff:["较上期变化","Change from previous period"],index:["共同首期＝100","First common period = 100"]};
const historyCache=new Map();
let repaint;
let bindings;
const loadHistory=metric=>{
  if (!historyCache.has(metric.file)) historyCache.set(metric.file,api("macro-atlas/"+metric.file.replace(/\.json$/,""))
    .catch(error=>{historyCache.delete(metric.file);throw error;}));
  return historyCache.get(metric.file);
};
const aggregates={
 WLD:["全球","World"],EMU:["欧元区","Euro area"],EUU:["欧盟","European Union"],OED:["OECD 成员","OECD members"],
 HIC:["高收入经济体","High-income economies"],MIC:["中等收入经济体","Middle-income economies"],LMY:["中低收入经济体","Low- and middle-income economies"],
};
const label=(zh,en)=>esc(pair(zh,en));
const periodIndex=(period,frequency)=>{
  if (frequency==="A") return Number(period);
  if (frequency==="Q") return Number(period.slice(0,4))*4+Number(period.at(-1))-1;
  return Number(period.slice(0,4))*12+Number(period.slice(5,7))-1;
};
export function transformMacro(history,periods,mode,frequency,baseline) {
  const shift=frequency==="M"?12:frequency==="Q"?4:1;
  const byIndex=new Map(Object.entries(history).map(([period,value])=>[periodIndex(period,frequency),value]));
  return periods.map(period=>{
    const value=history[period], before=byIndex.get(periodIndex(period,frequency)-(mode==="yoy"?shift:1));
    if (!finite(value)) return {value:null};
    if (mode==="level") return {value};
    if (mode==="diff") return {value:finite(before)?value-before:null};
    if (mode==="yoy") return {value:finite(before)&&before>0?value/before-1:null};
    const base=history[baseline];
    return {value:finite(base)&&base>0?100*value/base:null};
  });
}

export function renderMacroPage(host,catalog) {
  if (host.dataset.language===prefs.language) {repaint?.();return;}
  bindings?.abort();
  bindings=new AbortController();
  const metrics=new Map(catalog.metrics.map(item=>[item.id,item])), economies=new Map(catalog.economies.map(item=>[item.id,item]));
  const stored=prefs.macroAtlas??{};
  const columns=[...new Set((Array.isArray(stored.columns)?stored.columns:
    [stored.metric??"gdpGrowth","inflation","policyRate","governmentDebt"]).filter(id=>metrics.has(id)))];
  const state={
    metric:columns.includes(stored.metric)?stored.metric:columns[0]??"gdpGrowth",
    columns:columns.length?columns:["gdpGrowth"],
    period:["latest","common"].includes(stored.period)?stored.period:/^\d{4}/.test(stored.period??"")?stored.period.slice(0,4):"latest",
    sort:stored.sort==="value"?stored.metric:stored.sort??"economy",descending:stored.descending??false,
    selected:Array.isArray(stored.selected)?stored.selected.filter(id=>economies.has(id)):["USA","CHN","EMU","JPN"],
    width:Number.isFinite(stored.width)?stored.width:.44,panels:stored.panels??["data","charts"],
    economyWidth:Number.isFinite(stored.economyWidth)?Math.max(110,Math.min(620,stored.economyWidth)):155,
    charts:Array.isArray(stored.charts)?stored.charts.map(chart=>({...chart,type:chart.type==="area"?"line":chart.type})): [
      {id:1,indicator:"gdpGrowth",economies:["USA","CHN","EMU","JPN"],mode:"level",type:"line",range:10},
      {id:2,indicator:"cpiMonthly",economies:["USA","CHN","EMU","JPN"],mode:"level",type:"line",range:5},
      {id:3,indicator:"policyRate",economies:["USA","CHN","EMU","JPN"],mode:"level",type:"line",range:10},
    ],
  };
  state.charts=state.charts.filter(chart=>Number.isSafeInteger(chart.id)&&metrics.has(chart.indicator)&&Array.isArray(chart.economies))
    .map((chart,index)=>({...chart,row:Number.isSafeInteger(chart.row)?chart.row:index}));
  let tableToken=0,chartToken=0,rendered=new Map(),located="";
  const tableData=new Map(),tablePeriods=new Map();
  const economyName=id=>{
    const item=economies.get(id);
    return aggregates[id]?pair(...aggregates[id]):item?countryName(item.iso2):id;
  };
  const remember=()=>{prefs.macroAtlas=structuredClone(state);save();};
  const metadata=metric=>({metrics:{[metric.id]:[metric.name,metric.unit,metric.en]}});
  const display=(metric,value)=>format(value,metric.id,"level",metadata(metric));
  const unit=metric=>unitLabel(metric.id,"level",metadata(metric));
  const phone=matchMedia("(max-width:700px)");
  host.innerHTML='<section class="panel macro-data"><div class="filter-bar macro-toolbar">'+
    '<div class="control"><span id="macro-economies-title">'+label("经济体","Economies")+'</span><div id="macro-economies"></div></div>'+
    '<label class="control"><span>'+label("观察期","Observation period")+'</span><select id="macro-period"></select></label>'+
    '<button type="button" class="quiet" data-macro-columns>'+label("指标列","Columns")+'</button>'+
    '<button type="button" class="quiet" data-macro-export>'+label("导出 CSV","Export CSV")+'</button></div>'+
    '<div class="table-context macro-context"></div><div class="table-scroll macro-scroll" tabindex="0"><table id="macro-grid" class="macro-table"><thead></thead><tbody></tbody></table></div>'+
    '<p class="macro-status" role="status"></p><div class="macro-selection"><span id="macro-selected-count"></span>'+
    '<button type="button" class="quiet" data-macro-selected>'+label("所选指标绘图","Chart selected indicators")+'</button></div>'+
    '<details class="macro-definition"><summary>'+label("指标说明与来源","Definition and source")+'</summary><div id="macro-source"></div></details></section>'+
    '<span class="splitter macro-splitter" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="macro-data macro-comparison" aria-label="'+
    label("调整数据表和图表宽度","Resize data and charts")+'"></span>'+
    '<section class="panel comparison macro-comparison"><div class="comparison-head"><h2>'+label("宏观对照","Macro comparison")+'</h2>'+
    '<div class="macro-add-actions"><button type="button" class="quiet" data-macro-add-scatter>'+label("＋ 散点图","+ Scatter")+'</button>'+
    '<button type="button" class="primary" data-macro-add>'+label("＋ 添加图表","+ Add chart")+'</button></div></div><div id="macro-charts"></div></section>'+
    '<dialog id="macro-columns-dialog" aria-labelledby="macro-columns-title" closedby="any"><div class="dialog-head">'+
    '<h2 id="macro-columns-title">'+label("选择指标列","Choose columns")+'</h2></div>'+
    '<p class="macro-column-count" role="status"></p><div id="macro-column-list"></div></dialog>';
  const grid=host.querySelector(".macro-table"), output=host.querySelector(".macro-status");
  const field=id=>host.querySelector("#macro-"+id);
  const status=value=>{output.textContent=value;output.hidden=!value;};
  const panelfor=id=>host.querySelector(".macro-"+(id==="data"?"data":"comparison"));
  function applyPanels() {
    const panels=phone.matches?[state.panels.at(-1)??"data"]:state.panels;
    for (const id of ["data","charts"]) panelfor(id).hidden=!panels.includes(id);
    host.dataset.split=String(panels.length===2);
    host.querySelector(".macro-splitter").hidden=panels.length!==2;
    document.querySelectorAll("[data-macro-panel]").forEach(button=>button.setAttribute("aria-pressed",String(panels.includes(button.dataset.macroPanel))));
  }
  document.querySelectorAll("[data-macro-panel]").forEach(button=>button.onclick=()=>{
    const id=button.dataset.macroPanel;
    if (phone.matches) state.panels=[id];
    else if (state.panels.includes(id)&&state.panels.length>1) state.panels=state.panels.filter(item=>item!==id);
    else if (!state.panels.includes(id)) state.panels.push(id);
    remember();applyPanels();
  });
  phone.onchange=applyPanels;
  host.style.setProperty("--macro-data-width",state.width*100+"%");
  host.style.setProperty("--macro-economy-width-override",state.economyWidth+"px");
  bindChainSplitter(host.querySelector(".macro-splitter"),{
    limits:()=>({min:280,max:Math.max(280,host.clientWidth-330)}),
    value:()=>host.clientWidth*state.width,remember,
    apply:value=>{
      state.width=value===null ? .44 : Math.max(.2,Math.min(.75,value/host.clientWidth));
      host.style.setProperty("--macro-data-width",state.width*100+"%");
    },
  });
  const chosenEconomies=()=>state.selected.length?state.selected:catalog.economies.map(item=>item.id);
  const economyGroups=[
    {id:"macro-countries",label:pair("国家与地区","Countries and territories"),aggregate:false},
    {id:"macro-aggregates",label:pair("区域与收入组合","Regional and income aggregates"),aggregate:true},
  ];
  function renderEconomies() {
    const choices=economyGroups.flatMap(group=>[
      {id:group.id,label:group.label},
      ...catalog.economies.filter(item=>item.aggregate===group.aggregate).map(item=>({
        id:item.id,parent:group.id,label:economyName(item.id),
      })),
    ]);
    renderFilterPicker(field("economies"),choices,state.selected,pair("全部经济体","All economies"),selected=>{
      state.selected=selected.flatMap(id=>{
        const group=economyGroups.find(item=>item.id===id);
        return group?catalog.economies.filter(item=>item.aggregate===group.aggregate).map(item=>item.id):[id];
      });
      renderEconomies();remember();renderTable();
    });
  }
  function renderColumnChoices() {
    const focused=document.activeElement?.dataset.macroColumn;
    field("column-list").innerHTML=catalog.categories.map(category=>{
      const items=catalog.metrics.filter(metric=>metric.category===category.id);
      return '<section class="macro-column-group"><h3><label><input type="checkbox" data-macro-column-group="'+category.id+'">'+
        esc(nameOf(category))+'</label></h3><div class="check-grid">'+items.map(metric=>'<label><input type="checkbox" data-macro-column="'+metric.id+
        '"'+(state.columns.includes(metric.id)?" checked":"")+'><span>'+esc(nameOf(metric))+
        '<small>'+esc(pair(...frequencies[metric.frequency])+" · "+unit(metric))+'</small></span></label>').join("")+'</div></section>';
    }).join("");
    for(const input of host.querySelectorAll("[data-macro-column-group]")) {
      const items=catalog.metrics.filter(metric=>metric.category===input.dataset.macroColumnGroup);
      const count=items.filter(metric=>state.columns.includes(metric.id)).length;
      input.checked=count===items.length;
      input.indeterminate=count>0&&count<items.length;
    }
    host.querySelector(".macro-column-count").textContent=pair("已选 "+state.columns.length+" 项",state.columns.length+" selected");
    if(focused) host.querySelector('[data-macro-column="'+focused+'"]')?.focus({preventScroll:true});
  }
  field("columns-dialog").onclick=event=>{
    if(event.target!==event.currentTarget) return;
    const box=event.currentTarget.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom) event.currentTarget.close();
  };
  function history(metricId,economy) {
    return tableData.get(metricId)?.rows.find(row=>row.economy===economy)?.values??{};
  }
  function observationPeriod(metricId,economy) {
    const values=history(metricId,economy);
    if(state.period==="latest") return Object.keys(values).at(-1);
    if(state.period==="common") return tablePeriods.get(metricId);
    return Object.keys(values).findLast(period=>period.slice(0,4)===state.period);
  }
  function valueFor(metricId,economy) {
    return history(metricId,economy)[observationPeriod(metricId,economy)];
  }
  function listedRows() {
    const items=chosenEconomies().slice();
    if(state.sort!=="economy"&&!state.columns.includes(state.sort)) state.sort="economy";
    return items.sort((a,b)=>{
      if(state.sort!=="economy") {
        const x=valueFor(state.sort,a),y=valueFor(state.sort,b);
        if(!finite(x)||!finite(y)) return Number(finite(y))-Number(finite(x));
        return (x-y)*(state.descending?-1:1);
      }
      return (chosenEconomies().indexOf(a)-chosenEconomies().indexOf(b))*(state.descending?-1:1);
    });
  }
  function renderTable() {
    if(!state.columns.every(id=>tableData.has(id))) return;
    const countries=chosenEconomies();
    tablePeriods.clear();
    if(state.period==="common") for(const id of state.columns) {
      const first=history(id,countries[0]);
      tablePeriods.set(id,Object.keys(first).reverse().find(period=>countries.every(economy=>finite(history(id,economy)[period]))));
    }
    const rows=listedRows();
    const ranges=new Map(state.columns.map(id=>[id,heatExtent(rows.map(economy=>valueFor(id,economy)).filter(finite))]));
    const year=Math.max(catalog.annualEnd,...state.columns.map(id=>Number(metrics.get(id).last.slice(0,4))));
    field("period").innerHTML=options([["latest",pair("各自最新期","Latest available")],["common",pair("各指标共同最新期","Latest common period per indicator")],
      ...Array.from({length:year-catalog.start+1},(_,i)=>year-i).map(y=>[String(y),pair(y+" 年",""+y)])],state.period);
    grid.querySelector("thead").innerHTML='<tr><th scope="col"><button type="button" class="sort" data-macro-sort="economy">'+label("经济体","Economy")+
      (state.sort==="economy"?(state.descending?" ↓":" ↑"):"")+'</button>'+
      columnResizeHandle("macro-economy-column","macro-grid",pair("调整经济体列宽","Resize economy column"))+'</th>'+
      state.columns.map(id=>{
        const metric=metrics.get(id);
        return '<th scope="col"><button type="button" class="sort" data-macro-sort="'+id+'">'+esc(nameOf(metric))+
          (state.sort===id?(state.descending?" ↓":" ↑"):"")+'</button><small>'+esc(pair(...frequencies[metric.frequency])+" · "+unit(metric))+
          '</small><button type="button" class="macro-column-plot" data-macro-plot="'+id+'" aria-label="'+
          esc(pair("绘制 "+nameOf(metric),"Chart "+nameOf(metric)))+'">+</button></th>';
      }).join("")+'</tr>';
    grid.querySelector("tbody").innerHTML=rows.map(economy=>'<tr data-economy="'+economy+'"'+(located===economy?' class="located"':"")+'>'+
      '<th scope="row"><div class="macro-economy-cell"><button type="button" class="chain-text-button" data-macro-detail="'+economy+'">'+esc(economyName(economy))+'</button>'+
      '<button type="button" class="pin" data-macro-pin="'+economy+'" aria-label="'+label("为该经济体绘制所选指标","Chart selected indicators for this economy")+'">＋</button></div></th>'+
      state.columns.map(id=>{
        const value=valueFor(id,economy),period=observationPeriod(id,economy), metric=metrics.get(id);
        const color=prefs.heat!==false?heatColor(value,ranges.get(id)):"";
        return '<td data-macro-cell="'+id+'"'+(color?' style="background:'+color+'"':"")+'><button type="button" class="macro-value" data-macro-source="'+id+
          '" data-macro-detail="'+economy+'">'+display(metric,value)+'</button><small>'+esc(period??"—")+'</small></td>';
      }).join("")+'</tr>').join("");
    const columnLimits=()=>({min:110,max:Math.max(110,Math.min(620,(panelfor("data").clientWidth||host.clientWidth)-88))});
    bindChainSplitter(grid.querySelector('[data-resize="macro-economy-column"]'),{
      limits:columnLimits,value:()=>grid.querySelector("th").getBoundingClientRect().width||state.economyWidth,remember,
      apply:width=>{
        const {min,max}=columnLimits();
        state.economyWidth=width===null?155:Math.round(Math.max(min,Math.min(max,width)));
        host.style.setProperty("--macro-economy-width-override",state.economyWidth+"px");
      },
    });
    host.querySelector(".macro-context").innerHTML=[
      pair(rows.length+" 个经济体",rows.length+" economies"),
      pair(state.columns.length+" 项指标",state.columns.length+" indicators"),
      pair("频率和期间见各列","Frequency and period shown per column"),
    ].map(tag=>'<span>'+esc(tag)+'</span>').join("");
    field("selected-count").textContent=pair(rows.length+" 个经济体 · "+state.columns.length+" 项指标",rows.length+" economies · "+state.columns.length+" indicators");
    showSource(countries[0]);
  }
  function showSource(economy,metricId=state.metric) {
    const current=tableData.get(metricId);
    if(!current) return;
    state.metric=metricId;
    const source=catalog.sources[current.source], row=current.rows.find(item=>item.economy===economy);
    const remarks=row?.notes??{};
    field("source").innerHTML='<p><strong>'+esc(nameOf(current))+'</strong> · '+esc(unit(current))+' · '+pair(...frequencies[current.frequency])+'</p>'+
      '<p><a target="_blank" rel="noopener" href="'+esc(current.url)+'">'+esc(current.publisher??nameOf(source))+'</a> · '+esc(current.code)+
      (current.updated?' · '+label("来源更新","Source updated")+" "+esc(current.updated):"")+'</p>'+
      (current.note?'<p>'+esc(pair(current.note,current.noteEn??current.note))+'</p>':"")+
      (remarks.standard?'<p><strong>'+esc(economyName(economy))+'</strong> · '+esc(remarks.standard)+'</p>':"")+
      (remarks.breaks?'<p>'+esc(remarks.breaks)+'</p>':"")+
      '<details><summary>'+label("原始定义","Original definition")+'</summary><p>'+esc(current.definition)+'</p></details>'+
      '<p class="hint-copy">'+label("各列保留原始频率，并在数值下方显示实际期间。选择年度时，月度和季度指标使用该年最后可得期；共同最新期按每项指标分别确定。缺失值显示为 —。","Each column retains its source frequency and shows its actual period below the value. A selected year uses the final available monthly or quarterly observation in that year. Common periods are determined separately for each indicator. Missing values appear as —.")+'</p>'+
      '<p class="hint-copy">'+label("图表同比＝本期 ÷ 上年同期 − 1，基数须为正值。变化值＝本期 − 上期。基期指数使用所选经济体共同有正值的首期，缺失期保留为空。","Chart YoY = current / same period last year − 1, with a positive base. Change = current − preceding period. Indexing uses the first common positive period across selected economies. Missing periods remain empty.")+'</p>'+
      '<p><a target="_blank" rel="noopener" href="'+esc(source.terms)+'">'+label("来源使用条款","Source terms")+'</a> · '+label("本地数据记录","Local data record")+" "+esc(catalog.built.slice(0,10))+'</p>';
  }
  async function loadTable() {
    const token=++tableToken, ids=state.columns.slice();
    status(pair("正在读取指标…","Loading indicators…"));
    grid.querySelector("tbody").replaceChildren();
    try {
      const datasets=await Promise.all(ids.map(id=>loadHistory(metrics.get(id))));
      if(token!==tableToken) return false;
      datasets.forEach(data=>tableData.set(data.id,data));
      status("");renderTable();remember();return true;
    } catch(error) {
      if(token===tableToken) status(pair("指标读取失败，请重新选择后重试。","Indicators could not load. Select them again to retry.")+" "+error.message);
      return false;
    }
  }
  async function locateEconomy(id,metricId,otherMetric) {
    if(!economies.has(id)) return;
    if(state.selected.length&&!state.selected.includes(id)) state.selected.push(id);
    if(!state.columns.includes(metricId)) state.columns.push(metricId);
    if(otherMetric&&!state.columns.includes(otherMetric)) state.columns.push(otherMetric);
    state.metric=metricId;
    state.sort="economy";state.descending=false;
    if(phone.matches) state.panels=["data"];
    else if(!state.panels.includes("data")) state.panels.push("data");
    located=id;
    renderEconomies();remember();applyPanels();
    if(!await loadTable()) return;
    const row=grid.querySelector('[data-economy="'+id+'"]');
    row?.scrollIntoView({block:"nearest",inline:"nearest"});
    row?.querySelector("button")?.focus({preventScroll:true});
    showSource(id,metricId);
  }
  document.addEventListener("click",event=>{
    if(!located||host.hidden||event.target.closest("#macro-page [data-locate-series],#macro-page tr.located")) return;
    located="";
    grid.querySelector("tr.located")?.classList.remove("located");
  },{signal:bindings.signal,capture:true});
  const types=[["line","折线","Line"],["bar","柱状","Bar"],["scatter","散点","Scatter"]];
  const templateSelect=(attribute,entries,value)=>'<select '+attribute+'>'+options(entries,String(value))+'</select>';
  function macroChartTitle(config,metric,periods,{y,baseline,period}={}) {
    const subjects=[...new Set(config.economies)].map(id=>{
      const item=economies.get(id);
      return {id,name:aggregates[id]?prose(...aggregates[id]):item?prose(chineseEconomyName(item.iso2),item.en):id};
    }).sort((a,b)=>Number(b.id==="WLD")-Number(a.id==="WLD")||Array.from(a.name).length-Array.from(b.name).length||a.name.localeCompare(b.name,locale()));
    const names=compactChartSubjects(subjects)+(subjects.length>1?prose("等"+subjects.length+"个经济体"," ("+subjects.length+" economies)"):"");
    const span=periods.length?(periods[0]===periods.at(-1)?periods[0]:periods[0]+"–"+periods.at(-1)):prose("暂无有效期间","No valid periods");
    const frequency=prose(...frequencies[metric.frequency]),metricName=prose(metric.name,metric.en);
    if(y) {
      const date=config.scatterView==="cross"?(period??prose("暂无配对期","No paired period"))+
        (!periods.length?prose("（无有效配对）"," (no valid pairs)"):""):span;
      return names+"-"+metricName+" (X) × "+prose(y.name,y.en)+" (Y)·"+frequency+prose("散点"," scatter")+"·"+
        (config.scatterView==="cross"?prose("经济体对照","Cross-section"):prose("时间轨迹","Time trajectories"))+"·"+date;
    }
    const mode=Object.hasOwn(transformations,config.mode)?config.mode:"level";
    const basis=mode==="level"?prose(frequency+"值",frequency+" values"):frequency+"·"+prose(...transformations[mode]);
    const base=mode==="index"?"·"+(baseline?prose("基期 "+baseline,"Baseline "+baseline):prose("无共同正值基期","No common positive baseline")):"";
    const type=types.find(([id])=>id===config.type)??types[0];
    return names+"-"+metricName+"·"+basis+base+"·"+span+"·"+prose(type[1]+"图",type[2]+" chart");
  }
  function ensureScatter(config) {
    const x=metrics.get(config.indicator),y=metrics.get(config.scatterY);
    if(!y||y.frequency!==x.frequency||y.id===x.id) {
      const preferred={gdpGrowth:"inflation",inflation:"unemployment",unemployment:"inflation",policyRate:"cpiMonthly",cpiMonthly:"policyRate",housePricesYoy:"householdCredit"};
      config.scatterY=preferred[x.id]??catalog.metrics.find(item=>item.frequency===x.frequency&&item.id!==x.id)?.id;
      config.scatterPeriod="latest";
    }
    config.scatterView=config.scatterView==="time"?"time":"cross";
    config.scatterPeriod??="latest";
    config.scatterGuide??=true;
    config.scatterConnect??=false;
  }
  async function prepareScatter(config) {
    ensureScatter(config);
    const x=metrics.get(config.indicator),y=metrics.get(config.scatterY);
    const [xData,yData]=await Promise.all([loadHistory(x),loadHistory(y)]);
    const matched=pairScatter(xData.rows,yData.rows,config.economies,{view:config.scatterView,period:config.scatterPeriod,range:config.range});
    const years=[...new Set(matched.points.map(point=>point.period))].sort();
    const sampleCount=new Set(matched.points.map(point=>point.pin)).size;
    const title=macroChartTitle(config,x,years,{y,period:matched.period});
    const periodText=config.scatterView==="cross"?matched.period??"—":years.length?years[0]+"–"+years.at(-1):"—";
    return {id:config.id,macro:true,built:catalog.built,title,mode:"level",metric:y.id,type:"scatter",height:config.height??300,years,
      metricDefinitions:{[x.id]:[x.name,x.unit,x.en],[y.id]:[y.name,y.unit,y.en]},
      scatter:{x:x.id,y:y.id,frequency:x.frequency,view:config.scatterView,period:matched.period,
        points:matched.points,guide:config.scatterGuide,connect:config.scatterConnect},
      availablePeriods:matched.periods,
      tags:["X · "+nameOf(x),"Y · "+nameOf(y),pair(...frequencies[x.frequency]),
        config.scatterView==="cross"?pair("同一期经济体对照","Same-period cross-section"):pair("各经济体时间轨迹","Within-economy trajectories"),periodText,
        pair(sampleCount+"/"+config.economies.length+" 个经济体 · "+matched.points.length+" 个配对",sampleCount+"/"+config.economies.length+" economies · "+matched.points.length+" pairs"),
        ...(config.scatterView==="cross"&&config.scatterGuide?[pair("长虚线：样本中位数","Long dashes: sample medians")]:[]),
        ...(config.scatterView==="time"?[pair("实心外环为最新期；浅色为较早期","Outer rings mark latest observations; lighter points are older")]:[])],
      pins:config.economies.map((id,pin)=>({row:{id:"macro-"+x.id+"-"+y.id+"-"+id,kind:"macro",name:economyName(id),currency:"USD"},
        scope:id,aggregate:"published",isAggregate:economies.get(id)?.aggregate??false,
        source:{x:x.url,y:y.url},savedName:economyName(id),
        savedValues:years.map(period=>({value:matched.points.find(point=>point.pin===pin&&point.period===period)?.y??null}))}))};
  }
  async function prepareChart(config) {
    if(config.type==="scatter") return prepareScatter(config);
    const metric=metrics.get(config.indicator), data=await loadHistory(metric);
    const available=config.economies.map(id=>data.rows.find(row=>row.economy===id)).filter(Boolean);
    const all=[...new Set(available.flatMap(row=>Object.keys(row.values)))].sort();
    const last=all.at(-1), start=config.range?String(Number(last?.slice(0,4))-config.range+1):String(catalog.start);
    const first=all.find(period=>period>=start);
    const periods=[];
    if (first) for(let index=periodIndex(first,metric.frequency);index<=periodIndex(last,metric.frequency);index++) {
      const year=metric.frequency==="A"?index:Math.floor(index/(metric.frequency==="M"?12:4));
      const part=metric.frequency==="M"?"-"+String(index%12+1).padStart(2,"0"):metric.frequency==="Q"?"-Q"+(index%4+1):"";
      periods.push(String(year)+part);
    }
    const mode=Object.hasOwn(transformations,config.mode)?config.mode:"level";
    const baseline=mode==="index"?periods.find(period=>available.every(row=>row.values[period]>0)):null;
    const chartMetric="macro_"+metric.id+"_"+mode;
    const resultUnit=mode==="index"?"index":mode==="yoy"?"pct":mode==="diff"&&metric.unit==="pct"?"pp":metric.unit;
    const pins=config.economies.map(id=>({row:{id:"macro-"+metric.id+"-"+id,kind:"macro",name:economyName(id),currency:"USD"},
      scope:id,aggregate:"published",source:metric.url,savedName:economyName(id),
      savedValues:transformMacro(available.find(row=>row.economy===id)?.values??{},periods,mode,metric.frequency,baseline)}));
    const title=macroChartTitle(config,metric,periods.filter((period,index)=>pins.some(pin=>finite(pin.savedValues[index].value))),{baseline});
    return {id:config.id,macro:true,built:catalog.built,title,mode:"level",metric:chartMetric,type:config.type,years:periods,height:config.height??230,
      metricDefinitions:{[chartMetric]:[metric.name,resultUnit,metric.en]},
      emptyMessage:mode==="index"&&!baseline?pair("所选经济体没有共同的正值基期。","No common positive baseline for the selected economies."):
        !available.length?pair("所选经济体暂无该指标。","This indicator is unavailable for the selected economies."):"",
      tags:[pair(...frequencies[metric.frequency]),pair(...transformations[mode]),
        ...(available.length<config.economies.length?[pair(available.length+"/"+config.economies.length+" 个经济体有数据",available.length+"/"+config.economies.length+" economies with data")]:[]),
        ...(baseline?[pair("基期 "+baseline,"Baseline "+baseline)]:[])],
      pins};
  }
  async function renderChartList() {
    const token=++chartToken;
    const container=field("charts");
    const rows=chartRows(state.charts);
    container.innerHTML=rows.map((row,index)=>'<div class="chart-row">'+row.map((config,position)=>{
      if(config.type==="scatter") ensureScatter(config);
      const metric=metrics.get(config.indicator), modes=Object.entries(transformations).filter(([id])=>id!=="yoy"||!["pct","pp"].includes(metric.unit));
      const mode=templateSelect('data-macro-chart-mode aria-label="'+label("计算方式","Transformation")+'"',modes.map(([id,value])=>[id,pair(...value)]),config.mode);
      const scatter=config.type==="scatter",height=config.height??(scatter?300:230);
      return '<article class="chart macro-chart" data-macro-chart="'+config.id+'" style="--plot-height:'+height+'px;--chart-weight:'+(config.weight||1)+'">'+
        (scatter?'<div class="macro-scatter-axes"><label>X '+templateSelect('data-macro-chart-indicator',catalog.metrics.map(item=>[item.id,nameOf(item)]),config.indicator)+'</label>'+
          '<button type="button" class="quiet" data-macro-scatter-swap title="'+label("交换横纵轴","Swap axes")+'">⇄</button><label>Y '+
          templateSelect('data-macro-scatter-y',catalog.metrics.filter(item=>item.frequency===metric.frequency&&item.id!==metric.id).map(item=>[item.id,nameOf(item)]),config.scatterY)+'</label></div>':"")+
        '<div class="chart-controls macro-chart-controls">'+(scatter?"":templateSelect('data-macro-chart-indicator aria-label="'+label("图表指标","Chart indicator")+'"',catalog.metrics.map(item=>[item.id,nameOf(item)]),config.indicator)+mode)+
        templateSelect('data-macro-chart-type aria-label="'+label("图表类型","Chart type")+'"',types.map(([id,zh,en])=>[id,pair(zh,en)]),config.type)+
        (scatter?templateSelect('data-macro-scatter-view aria-label="'+label("对照方式","Comparison view")+'"',[["cross",pair("经济体对照","Cross-section")],["time",pair("时间轨迹","Time trajectories")]],config.scatterView):"")+
        (scatter&&config.scatterView==="cross"?templateSelect('data-macro-scatter-period aria-label="'+label("共同观察期","Shared observation period")+'"',[[config.scatterPeriod,config.scatterPeriod==="latest"?pair("最新可比期","Latest comparable period"):config.scatterPeriod]],config.scatterPeriod):
          templateSelect('data-macro-chart-range aria-label="'+label("时间范围","Time range")+'"',[... [5,10,20].map(n=>[String(n),pair("近 "+n+" 年","Last "+n+" years")]),["0",pair("全部","All")]],config.range))+
        '<button type="button" class="quiet" data-macro-chart-selected>'+label("接收经济体","Receive economies")+'</button>'+
        (scatter?'<label class="macro-scatter-option"><input type="checkbox" '+(config.scatterView==="cross"?'data-macro-scatter-guide'+(config.scatterGuide?' checked':""):'data-macro-scatter-connect'+(config.scatterConnect?' checked':""))+'>'+
          (config.scatterView==="cross"?label("中位数参考线","Median guides"):label("连接相邻期间","Connect consecutive periods"))+'</label>'+
          '<span class="help-dot" tabindex="0" title="'+label("横纵轴仅匹配相同频率、同一期间的原始值，不插值。最新可比期优先选择至少两个经济体有配对数据的最近期；只有一个经济体时使用其最新配对期。每个点等大，不代表经济规模。可悬停查看数值，点击定位数据表。","Axes pair original values at the same frequency and reference period, without interpolation. Latest comparable period prefers the latest with at least two economies; a single economy uses its latest pair. Equal dot sizes do not encode economic size. Hover for values; click to locate in the table.")+'">?</span>':"")+
        chartActions(rows,index,{pins:config.economies},true)+'</div>'+
        '<div id="macro-plot-'+config.id+'" class="macro-chart-content"><p class="status">'+label("正在读取数据…","Loading data…")+'</p></div>'+
        '<div class="splitter chart-height-grip" role="separator" tabindex="0" aria-orientation="horizontal" aria-controls="macro-plot-'+config.id+
        '" aria-label="'+label("调整图表高度","Resize chart height")+'"></div>'+
        (position<row.length-1?'<div class="splitter chart-width-grip" data-macro-chart-width role="separator" tabindex="0" aria-orientation="vertical"'+
          ' aria-controls="macro-plot-'+config.id+' macro-plot-'+row[position+1].id+'" aria-label="'+label("调整相邻图表宽度","Resize adjacent charts")+'"></div>':"")+'</article>';
    }).join("")+'</div>').join("");
    for (const config of state.charts) {
      const grip=container.querySelector('[data-macro-chart="'+config.id+'"] .chart-height-grip');
      bindChainSplitter(grip,{
        axis:"y",limits:()=>({min:config.type==="scatter"?220:150,max:720}),value:()=>config.height??(config.type==="scatter"?300:230),remember,
        apply:height=>{
          config.height=height===null?(config.type==="scatter"?300:230):Math.round(Math.max(config.type==="scatter"?220:150,Math.min(720,height)));
          if(rendered.has(config.id)) rendered.get(config.id).height=config.height;
          const chart=field("plot-"+config.id).querySelector(".chart");
          chart?.style.setProperty("--plot-height",config.height+"px");
        },
      });
      const card=grip.closest(".macro-chart"),widthGrip=card.querySelector("[data-macro-chart-width]");
      if(widthGrip) {
        const next=card.nextElementSibling,neighbor=state.charts.find(item=>item.id===Number(next.dataset.macroChart));
        bindChainSplitter(widthGrip,{
          limits:()=>{const total=card.getBoundingClientRect().width+next.getBoundingClientRect().width,min=Math.min(200,total*.45);return {min,max:total-min};},
          value:()=>card.getBoundingClientRect().width,remember,
          apply:width=>{
            if(width===null) {
              for(const sibling of card.parentElement.children) {
                delete state.charts.find(item=>item.id===Number(sibling.dataset.macroChart)).weight;
                sibling.style.setProperty("--chart-weight",1);
              }
              return;
            }
            const total=card.getBoundingClientRect().width+next.getBoundingClientRect().width,weight=(config.weight||1)+(neighbor.weight||1);
            config.weight=weight*width/total;neighbor.weight=weight-config.weight;
            card.style.setProperty("--chart-weight",config.weight);next.style.setProperty("--chart-weight",neighbor.weight);
          },
        });
      }
    }
    rendered=new Map();
    await Promise.all(state.charts.map(async config=>{
      try {
        const chart=await prepareChart(config);
        if(token!==chartToken) return;
        rendered.set(config.id,chart);
        const periodSelect=field("plot-"+config.id).closest(".macro-chart").querySelector("[data-macro-scatter-period]");
        if(periodSelect) periodSelect.innerHTML=options([["latest",pair("最新可比期","Latest comparable period")],
          ...[...new Set([...(config.scatterPeriod!=="latest"?[config.scatterPeriod]:[]),...chart.availablePeriods])].sort().reverse().map(period=>[period,period])],config.scatterPeriod);
        renderCharts(field("plot-"+config.id),[chart],null,{metrics:{},years:[],stats:{},marketColumns:[]},{},{readonly:true,interactiveLegend:true,showTags:false});
      } catch(error) {
        if(token!==chartToken) return;
        field("plot-"+config.id).textContent=pair("图表读取失败。","Chart could not load.")+" "+error.message;
      }
    }));
  }
  function addChart(ids=chosenEconomies(),indicators=[state.metric],type="line") {
    if(!ids.length) {status(pair("先勾选经济体。","Select economies first."));return;}
    let id=state.charts.reduce((next,chart)=>Math.max(next,chart.id+1),1),row=(state.charts.at(-1)?.row??-1)+1;
    for(const indicator of indicators) state.charts.push({id:id++,row:row++,indicator,economies:[...ids],mode:"level",type,range:10});
    if(!state.panels.includes("charts")) state.panels.push("charts");
    remember();applyPanels();void renderChartList();
  }
  host.onchange=event=>{
    const input=event.target, config=state.charts.find(item=>item.id===Number(input.closest("[data-macro-chart]")?.dataset.macroChart));
    if(input.hasAttribute("data-choice")) return;
    if(input.id==="macro-period") {state.period=input.value;remember();renderTable();return;}
    if(input.dataset.macroColumn||input.dataset.macroColumnGroup) {
      const ids=input.dataset.macroColumn?[input.dataset.macroColumn]:
        catalog.metrics.filter(metric=>metric.category===input.dataset.macroColumnGroup).map(metric=>metric.id);
      const next=input.checked?[...new Set([...state.columns,...ids])]:state.columns.filter(id=>!ids.includes(id));
      if(next.length) {
        state.columns=next;
        if(!next.includes(state.metric)) state.metric=next[0];
        remember();void loadTable();
      }
      renderColumnChoices();return;
    }
    if(config) {
      if(input.hasAttribute("data-macro-chart-indicator")) {config.indicator=input.value;config.mode="level";}
      if(input.hasAttribute("data-macro-chart-mode")) config.mode=input.value;
      if(input.hasAttribute("data-macro-chart-type")) config.type=input.value;
      if(input.hasAttribute("data-macro-chart-range")) config.range=Number(input.value);
      if(input.hasAttribute("data-macro-scatter-y")) config.scatterY=input.value;
      if(input.hasAttribute("data-macro-scatter-view")) config.scatterView=input.value;
      if(input.hasAttribute("data-macro-scatter-period")) config.scatterPeriod=input.value;
      if(input.hasAttribute("data-macro-scatter-guide")) config.scatterGuide=input.checked;
      if(input.hasAttribute("data-macro-scatter-connect")) config.scatterConnect=input.checked;
      remember();void renderChartList();return;
    }
  };
  host.onclick=event=>{
    const button=event.target.closest("button");
    if(!button) return;
    const config=state.charts.find(item=>item.id===Number(button.closest("[data-macro-chart]")?.dataset.macroChart));
    const key=button.dataset;
    if(button.hasAttribute("data-macro-columns")) {renderColumnChoices();field("columns-dialog").showModal();return;}
    if(key.macroSort) {
      state.descending=state.sort===key.macroSort?!state.descending:true;state.sort=key.macroSort;remember();renderTable();return;
    }
    if(key.macroDetail) {showSource(key.macroDetail,key.macroSource??state.metric);remember();host.querySelector(".macro-definition").open=true;return;}
    if(key.macroPlot) {addChart(chosenEconomies(),[key.macroPlot]);return;}
    if(key.macroPin) {addChart([key.macroPin],state.columns);return;}
    if(button.hasAttribute("data-macro-add")) {addChart();return;}
    if(button.hasAttribute("data-macro-add-scatter")) {addChart(chosenEconomies(),["gdpGrowth"],"scatter");return;}
    if(button.hasAttribute("data-macro-selected")) {addChart(chosenEconomies(),state.columns);return;}
    if(button.hasAttribute("data-macro-export")) {
      const rows=[["Economy","ISO3","Period","Value","Unit","Series","Source"]];
      for(const id of state.columns) {
        const metric=metrics.get(id);
        for(const economy of listedRows()) for(const [period,value] of Object.entries(history(id,economy))) rows.push([economyName(economy),economy,period,
          value,metric.unit==="pct"?"decimal fraction":metric.unit==="money"?"USD":metric.unit==="intMoney"?"International dollar":unit(metric)||metric.unit,metric.code,metric.url]);
      }
      downloadCSV(rows,"AlphaNode-macro.csv");return;
    }
    if(!config) return;
    if(button.hasAttribute("data-locate-series")) {
      const pin=rendered.get(config.id)?.pins[Number(key.locateSeries)];
      if(pin) void locateEconomy(pin.scope,config.indicator,config.type==="scatter"?config.scatterY:null);
      return;
    }
    if(button.hasAttribute("data-drop")) {
      const id=rendered.get(config.id)?.pins[Number(key.drop)]?.scope;
      if(id) config.economies=config.economies.filter(economy=>economy!==id);
      remember();void renderChartList();return;
    }
    if(button.hasAttribute("data-save-chart")) {
      const chart=rendered.get(config.id);
      if(chart) openSaveChart(chart);return;
    }
    if(button.hasAttribute("data-chart-remove")) {
      state.charts=state.charts.filter(item=>item!==config);
      for(const other of state.charts) if(other.row===config.row) delete other.weight;
    }
    if(button.hasAttribute("data-copy-chart")) {
      const id=state.charts.reduce((next,item)=>Math.max(next,item.id+1),1);
      const copy={...config,id,economies:[...config.economies]};delete copy.weight;
      state.charts=insertChartBelow(state.charts,config,copy);
    }
    if(button.hasAttribute("data-move-chart")) state.charts=moveChartInRows(state.charts,config,Number(key.moveChart));
    if(button.hasAttribute("data-macro-chart-selected")) config.economies=[...new Set([...config.economies,...chosenEconomies()])];
    if(button.hasAttribute("data-macro-scatter-swap")) [config.indicator,config.scatterY]=[config.scatterY,config.indicator];
    remember();void renderChartList();
  };
  repaint=()=>{
    if(host.hidden) return;
    renderTable();
    for (const [id,chart] of rendered) redraw(field("plot-"+id),[chart],{metrics:{},years:[]});
  };
  renderEconomies();applyPanels();
  void loadTable();void renderChartList();
  host.dataset.language=prefs.language;
}
