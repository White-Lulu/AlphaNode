import {esc,finite,format,measure,qualityNotes,resultUnit,unitLabel,modes,modeLabel} from "./model.js";
import {nameOf,scopeLabel,companyLocation,pair,prose,locale} from "./i18n.js";
import {metricLabel} from "./glossary.js";
import {rebaseToPercentChange} from "./vendor/superset/percentChange.js";
import {defaultChartHeight} from "./layout.js";
import {seriesColors} from "./chart-colors.js";
import {drawScatter} from "./scatter-chart.js";

const resizeObservers=new WeakMap();
function metricOptions(selected,meta,financialGroups) {
  const remaining=new Set(Object.keys(meta.metrics));
  const statistics=Object.entries(meta.stats).filter(([id])=>id!=="macro").flatMap(([,source])=>source.columns);
  const groups=[...Object.values(financialGroups),
    ["行业统计与样本数","Industry statistics and sample counts",["firms",...statistics]],
    ["产品市场","Product markets",meta.marketColumns],
    ["利率","Interest rates",meta.stats.macro?.columns??[]]];
  const group=(zh,en,keys)=>{
    const metrics=keys.filter(key=>remaining.delete(key));
    if (!metrics.length) return "";
    return '<optgroup label="'+esc(pair(zh,en))+'">'+metrics.map(key=>
      '<option value="'+esc(key)+'"'+(key===selected?" selected":"")+'>'+esc(metricLabel(key,meta))+'</option>'
    ).join("")+"</optgroup>";
  };
  return groups.map(([zh,en,keys])=>group(zh,en,keys)).join("")+group("其他指标","Other metrics",[...remaining]);
}

const rebaseUnits=new Set(["money","count","people","vehicles","mwh","gasprice","gasvol"]);
const supportsBaseline=(chart,meta)=>chart.mode==="level"&&rebaseUnits.has(resultUnit(chart.metric,chart.mode,meta));

function baselineControl(chart,meta) {
  if (!supportsBaseline(chart,meta)) return "";
  const label=pair("比较基年","Comparison baseline");
  return '<select data-chart-base aria-label="'+esc(label)+'"><option value="">'+esc(pair("原始数值","Original values"))+'</option>'+
    meta.years.map(year=>'<option value="'+year+'"'+(chart.baseline===year?" selected":"")+'>'+
      esc(pair(year+" 年为基准","Relative to "+year))+"</option>").join("")+"</select>";
}
export function seriesName(pin) {
  if (pin.savedName) return pin.savedName;
  if (pin.row.kind==="company") {
    const row=pin.row, location=row.region==="ex"?companyLocation(row):"";
    return row.code+" "+nameOf(row)+(location?" · "+location:"");
  }
  const classification=pin.row.scheme==="economic"?" · "+pair("产业链功能","Economic function"):"";
  const mode=pin.row.kind==="industry" && pin.aggregate==="mean" ? " · "+pair("均值","Mean") : "";
  return nameOf(pin.row)+classification+" · "+scopeLabel(pin.scope)+mode;
}
export function chartRows(charts) {
  const rows=[];
  for (const chart of charts) {
    if (rows.length&&rows.at(-1)[0].row===chart.row) rows.at(-1).push(chart);
    else rows.push([chart]);
  }
  return rows;
}
export function canMoveChart(rows,index,direction) {
  return Boolean(rows[index+direction])||(rows[index]?.length??0)>1;
}
export function insertChartBelow(charts,source,copy) {
  const rows=chartRows(charts),index=rows.findIndex(row=>row.includes(source));
  rows.splice(index+1,0,[copy]);
  return numberChartRows(rows);
}
function numberChartRows(rows) {
  return rows.flatMap((row,index)=>row.map(item=>Object.assign(item,{row:index})));
}
export function moveChartInRows(charts,chart,direction) {
  const rows=chartRows(charts);
  const index=rows.findIndex(row=>row.includes(chart)),current=rows[index],adjacent=rows[index+direction];
  if (index<0||!canMoveChart(rows,index,direction)) return charts;
  current.splice(current.indexOf(chart),1);
  if (current.length) {
    current.forEach(item=>delete item.weight);
    delete chart.weight;
    rows.splice(index+(direction>0?1:0),0,[chart]);
  } else {
    if (direction<0) adjacent.push(chart);
    else adjacent.unshift(chart);
    adjacent.forEach(item=>delete item.weight);
    rows.splice(index,1);
  }
  return numberChartRows(rows);
}
export const chartRowKey=row=>row.map(chart=>chart.id).join("|");
export const chartParts=chart=>chart.parts??[chart];
export const isMergeableRow=row=>row.every(chart=>!chart.parts);

function snapshotTags(chart,meta) {
  const tags=chart.tags??[metricLabel(chart.metric,meta),modeLabel(chart.mode)];
  if (chart.baseline!=null) tags.push(pair(chart.baseline+" 年为基准","Relative to "+chart.baseline));
  return '<div class="table-context saved-chart-tags">'+tags.map(tag=>'<span>'+esc(tag)+'</span>').join("")+'</div>';
}
function plotHTML(chart,plot,meta,live,valuesOpen,interactiveLegend=live,showTags=true) {
  const legend=chart.pins.map((pin,index)=>{
    const name=seriesName(pin),text='<span class="dot"></span><span>'+esc(name)+'</span>';
    return interactiveLegend?'<span class="legend-item"><button class="quiet" type="button" data-locate-series="'+index+'" title="'+
      esc(pair("定位数据表","Locate in table")+" · "+name)+'">'+text+'</button>'+
      chartButton('data-drop="'+index+'"',pair("移除序列","Remove series")+" · "+name,"×")+'</span>':
      '<span class="legend-static">'+text+'</span>';
  }).join("");
  return (live||!showTags?"":snapshotTags(chart,meta))+'<div class="chart-legend">'+legend+'</div>'+
    '<div class="chart-frame"><canvas id="'+plot+'" role="img" aria-label="'+
    esc(metricLabel(chart.metric,meta)+" "+(chart.scatter?pair("散点图","Scatter plot"):pair("走势图","Trend chart")))+'"></canvas><span class="chart-cursor" hidden></span>'+
    '<div class="chart-tip" hidden></div></div><p class="chart-note" hidden></p>'+
    '<details class="chart-numbers"'+(valuesOpen?" open":"")+'><summary>'+esc(pair("图表数值","Chart values"))+
    '</summary><div class="chart-numbers-scroll" tabindex="0" aria-label="'+esc(pair("图表数值","Chart values"))+'"></div></details>';
}
export function chartActions(rows,index,chart,live) {
  const copyIcon='<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M6 13H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="7" y="7" width="10" height="10" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  const saveIcon='<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M4 3.5h10l2.5 2.5v10.5h-13v-13h.5Zm2.5 0V8h7V3.5m-7 13V11h7v5.5" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.4"/></svg>';
  return '<div class="chart-actions"><div class="chart-move">'+
    moveButton(-1,canMoveChart(rows,index,-1),pair("上移图表","Move chart up"))+
    moveButton(1,canMoveChart(rows,index,1),pair("下移图表","Move chart down"))+'</div>'+
    (live?chartButton("data-copy-chart",pair("复制图表","Duplicate chart"),copyIcon)+
      chartButton("data-save-chart"+(chart.pins.length?"":" disabled"),pair("保存图表","Save chart"),saveIcon):"")+
    chartButton("data-chart-remove",pair("移除图表","Remove chart"),"×")+'</div>';
}
function rowSelection(row,selected) {
  const allowed=isMergeableRow(row),key=chartRowKey(row);
  return '<div class="chart-row-selection"><label><input type="checkbox" data-merge-row="'+esc(key)+'"'+
    (selected.has(key)?" checked":"")+(allowed?"":" disabled")+'><span>'+
    esc(allowed?pair("选中此行","Select row"):pair("此行包含合并图表","Contains a merged chart"))+'</span></label></div>';
}
export function renderCharts(container,charts,active,meta,financialGroups,{readonly=false,workbench=false,selectedRows=null,interactiveLegend=false,showTags=true}={}) {
  resizeObservers.get(container)?.disconnect();
  const expanded=new Set([...container.querySelectorAll(".chart-numbers[open]")].map(details=>
    details.closest("[data-chart]").dataset.chart+"/"+details.closest("[data-chart-part]").dataset.chartPart));
  const rows=chartRows(charts),live=!readonly&&!workbench;
  container.innerHTML=rows.map((row,index)=>{
    const cards=row.map((chart,position)=>{
      const height=chart.height||defaultChartHeight,plotId=(live?"chart-plot":container.id+"-plot")+"-"+chart.id;
      const controls=live?
        '<select data-chart-metric aria-label="'+esc(pair("图表指标","Chart metric"))+'">'+metricOptions(chart.metric,meta,financialGroups)+'</select>'+
        '<select data-chart-mode aria-label="'+esc(pair("图表时间基准","Chart time basis"))+'">'+Object.keys(modes).map(k=>
        '<option value="'+k+'"'+(k===chart.mode?" selected":"")+'>'+esc(modeLabel(k))+'</option>').join("")+'</select>'+baselineControl(chart,meta)+
        '<button class="quiet" type="button" data-chart-active aria-pressed="'+(active===chart.id)+'">'+
        esc(active===chart.id?pair("接收新序列","Active chart"):pair("设为添加目标","Make active"))+'</button>':
        workbench?'<h3>'+esc(chart.title)+'</h3>':"";
      const parts=chartParts(chart).map((part,i)=>({row:part.row??i,html:'<div class="chart-part" data-chart-part="'+i+'"'+
        (chart.parts?' style="--chart-weight:'+(part.weight||1)+'"':"")+'>'+
        (chart.parts&&part.title?'<h4 class="chart-part-title" title="'+esc(part.title)+'">'+esc(part.title)+'</h4>':"")+
        plotHTML(part,plotId+(i?"-"+i:""),chartMetadata(part,meta),live,live?Boolean(chart.valuesOpen):expanded.has(chart.id+"/"+i),live||interactiveLegend,showTags)+'</div>'}));
      const plots=chart.parts?chartRows(parts).map(group=>'<div class="chart-part-row">'+group.map(part=>part.html).join("")+'</div>').join(""):parts[0].html;
      return '<article class="chart" data-chart="'+esc(chart.id)+'" style="--plot-height:'+height+'px;--chart-weight:'+(chart.weight||1)+'">'+
        (readonly?"":'<div class="chart-controls">'+controls+chartActions(rows,index,chart,live)+'</div>')+plots+
        (readonly?"":'<div class="splitter chart-height-grip" role="separator" tabindex="0" data-resize="chart-height" aria-orientation="horizontal"'+
        ' aria-controls="'+plotId+'" aria-label="'+esc(pair("调整图表高度","Resize chart height"))+'"></div>')+
        (!readonly&&position<row.length-1?'<div class="splitter chart-width-grip" role="separator" tabindex="0" data-resize="chart-width" aria-orientation="vertical"'+
        ' aria-controls="'+plotId+'" aria-label="'+esc(pair("调整相邻图表宽度","Resize adjacent charts"))+'"></div>':"")+'</article>';
    }).join("");
    const body='<div class="chart-row">'+cards+'</div>';
    return workbench&&selectedRows?'<div class="chart-row-group">'+rowSelection(row,selectedRows)+body+'</div>':body;
  }).join("");
  const cards=new Map(charts.map(chart=>[String(chart.id),chart]));
  if (typeof ResizeObserver==="function"&&cards.size) {
    const resize=new ResizeObserver(entries=>{
      for (const entry of entries) {
        const part=entry.target.closest("[data-chart-part]");
        const chart=cards.get(part.closest("[data-chart]").dataset.chart);
        draw(part,chartParts(chart)[Number(part.dataset.chartPart)],meta);
      }
    });
    container.querySelectorAll(".chart-frame").forEach(frame=>resize.observe(frame));
    resizeObservers.set(container,resize);
  }
  redraw(container,charts,meta);
}
function moveButton(direction,enabled,label) {
  return '<button class="chart-arrow" type="button" data-move-chart="'+direction+'" aria-label="'+esc(label)+
    '" title="'+esc(label)+'"'+(enabled?"":" disabled")+'></button>';
}
function chartButton(attributes,label,content) {
  return '<button class="quiet" type="button" '+attributes+' aria-label="'+esc(label)+'" title="'+esc(label)+'">'+content+'</button>';
}
const noteText=key=>qualityNotes[key]?prose(...qualityNotes[key]):"";
function renderValues(card,series,years,display,unitFor) {
  const box=card.querySelector(".chart-numbers-scroll");
  if (!series.length) {
    box.textContent=prose("暂无序列。","No series yet.");
    return;
  }
  const {scrollLeft,scrollTop}=box;
  const header=series.map(line=>'<th scope="col"><span class="dot" style="background:'+line.color+'"></span>'+
    esc(line.name)+'<small>'+esc(unitFor(line))+'</small></th>').join("");
  const rows=years.map((y,i)=>'<tr><th scope="row">'+y+'</th>'+series.map(line=>{
    const {value,note}=line.values[i],description=noteText(note);
    return '<td'+(description?' title="'+esc(description)+'"':"")+'>'+display(value)+
      (description?'<sup aria-label="'+esc(description)+'">!</sup>':"")+'</td>';
  }).join("")+'</tr>').reverse().join("");
  box.innerHTML='<table class="chart-data"><thead><tr><th scope="col">'+esc(pair("期间","Period"))+'</th>'+
    header+'</tr></thead><tbody>'+rows+'</tbody></table>';
  box.scrollLeft=scrollLeft;
  box.scrollTop=scrollTop;
}
export function chartMetadata(chart,meta) {
  return chart.metricDefinitions?{...meta,metrics:{...meta.metrics,...chart.metricDefinitions}}:meta;
}
export function chartObservations(chart,meta) {
  meta=chartMetadata(chart,meta);
  const years=chart.years??meta.years;
  const series=chart.pins.map(pin=>({
    name:seriesName(pin),currency:pin.row.currency||"USD",
    values:pin.savedValues??years.map(year=>measure(pin.row,chart.metric,year,pin.scope,pin.aggregate,chart.mode,meta))
  }));
  const baseline=supportsBaseline(chart,meta)&&years.includes(chart.baseline)?chart.baseline:null;
  return {years,baseline,series:baseline?rebasedSeries(series,years,baseline):series};
}
function draw(card,chart,meta) {
  meta=chartMetadata(chart,meta);
  const canvas=card.querySelector("canvas"),tip=card.querySelector(".chart-tip"),cursor=card.querySelector(".chart-cursor");
  const colors=seriesColors(card,chart);
  card.querySelectorAll(".chart-legend .dot").forEach((dot,i)=>{dot.style.background=colors[i];});
  const ctx=canvas.getContext("2d");
  const rect=canvas.getBoundingClientRect(), w=rect.width, h=rect.height;
  if (w<20||h<20) return;
  tip.hidden=cursor.hidden=true;
  canvas.onpointermove=null;
  const dpr=window.devicePixelRatio || 1;
  const pixelWidth=Math.round(w*dpr),pixelHeight=Math.round(h*dpr);
  if (canvas.width!==pixelWidth) canvas.width=pixelWidth;
  if (canvas.height!==pixelHeight) canvas.height=pixelHeight;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const styles=getComputedStyle(canvas);
  if(chart.scatter) {drawScatter(card,chart,meta,{canvas,ctx,w,h,styles,colors});return;}
  const axis=styles.getPropertyValue("--plot-ink").trim();
  const {years,baseline,series}=chartObservations(chart,meta);
  const money=!baseline&&resultUnit(chart.metric,chart.mode,meta)==="money";
  const currency=series.find(line=>line.values.some(m=>finite(m.value)))?.currency||series[0]?.currency||"USD";
  const tableSeries=series.map((line,i)=>({...line,color:colors[i]}));
  const active=tableSeries.filter(line=>!money||line.currency===currency);
  const display=(value,axis=false)=>baseline&&finite(value)?
    new Intl.NumberFormat(locale(),{style:"percent",maximumFractionDigits:axis?1:2}).format(value):
    format(value,chart.metric,chart.mode,meta,axis);
  const values=active.flatMap(line=>line.values.map(m=>m.value).filter(finite));
  const note=card.querySelector(".chart-note");
  note.hidden=active.length===series.length;
  note.textContent=prose("其他币种的序列可在数值表查看。","Series in other currencies are listed in the values table.");
  const numbers=card.querySelector(".chart-numbers");
  const drawValues=()=>renderValues(card,tableSeries,years,display,line=>baseline?"%":unitLabel(chart.metric,chart.mode,meta,line.currency));
  if (numbers.open) drawValues();
  numbers.ontoggle=()=>{if (numbers.open) drawValues();};
  ctx.font='11px "Microsoft YaHei UI",sans-serif';
  ctx.fillStyle=axis||"#55677c";
  if (!values.length) {
    ctx.textAlign="center";
    const message=chart.emptyMessage||(baseline?prose("基年缺少正值","No positive baseline value"):chart.pins.length?
      prose("这些序列缺少该指标","No observations for this metric"):
      prose("从上方表格添加序列","Add a series from the table"));
    ctx.fillText(message,w/2,h/2);
    return;
  }
  const max=Math.max(...values),min=Math.min(...values);
  const padding=(max-min)*.09 || Math.abs(max)*.12 || .1;
  const zeroBaseline=chart.type==="bar";
  const low=zeroBaseline?Math.min(0,min-padding):min-padding,high=zeroBaseline?Math.max(0,max+padding):max+padding;
  const area={l:w<430?58:67,r:w-16,t:25,b:h-25};
  const px=i=>area.l+(area.r-area.l)*(chart.type==="bar"?(i+.5)/Math.max(1,years.length):i/Math.max(1,years.length-1));
  const py=v=>area.b-(v-low)/(high-low)*(area.b-area.t);
  ctx.fillText(baseline?pair("相对 "+baseline+" 年变化","Change from "+baseline):unitLabel(chart.metric,chart.mode,meta,currency),8,12);
  for (let n=0;n<=4;n++) {
    const value=low+(high-low)*n/4, y=py(value);
    ctx.strokeStyle=styles.getPropertyValue("--plot-grid").trim()||"#dfe7f1";
    ctx.beginPath(); ctx.moveTo(area.l,y); ctx.lineTo(area.r,y); ctx.stroke();
    ctx.fillStyle=axis||"#4f637d"; ctx.textAlign="right";
    ctx.fillText(display(value,true),area.l-6,y+4);
  }
  ctx.textAlign="center";
  const last=years.length-1;
  const labelWidth=Math.max(34,ctx.measureText(String(years[0])).width+14,ctx.measureText(String(years[last])).width+14);
  const step=Math.max(1,Math.ceil(labelWidth*last/(area.r-area.l)));
  for (let i=0;i<=last;i+=step) {
    if (i===0 || last-i>=step) ctx.fillText(String(years[i]),px(i),area.b+17);
  }
  ctx.fillText(String(years[last]),px(last),area.b+17);
  for (const [lineIndex,line] of active.entries()) {
    if (chart.type==="bar") {
      const pitch=(area.r-area.l)/Math.max(1,years.length), bar=Math.min(28,pitch*.8/active.length);
      ctx.fillStyle=line.color;
      line.values.forEach(({value},i)=>{
        if (!finite(value)) return;
        const x=px(i)+bar*(lineIndex-active.length/2);
        ctx.fillRect(x,py(Math.max(0,value)),bar,Math.max(1,Math.abs(py(value)-py(0))));
      });
      continue;
    }
    ctx.lineWidth=2.2; ctx.lineJoin="round"; ctx.strokeStyle=line.color;
    ctx.beginPath();
    let prev=false;
    line.values.forEach(({value:v},i)=>{
      if (!finite(v)) {prev=false; return;}
      if (prev) ctx.lineTo(px(i),py(v)); else ctx.moveTo(px(i),py(v));
      prev=true;
    });
    ctx.stroke();
    ctx.fillStyle=line.color;
    line.values.forEach(({value:v,note},i)=>{
      if (!finite(v)) return;
      ctx.beginPath(); ctx.arc(px(i),py(v),note?4:2.7,0,Math.PI*2);
      if (note) ctx.stroke(); else ctx.fill();
    });
  }
  let currentYear=-1;
  canvas.onpointermove=e=>{
    const box=canvas.getBoundingClientRect();
    const fraction=(e.clientX-box.left-area.l)/(area.r-area.l);
    const i=Math.min(years.length-1,Math.max(0,chart.type==="bar"?Math.floor(fraction*years.length):Math.round(fraction*(years.length-1))));
    if (i===currentYear) return;
    currentYear=i;
    const order=line=>finite(line.values[i].value)?line.values[i].value:-Infinity;
    const ordered=[...active].sort((a,b)=>order(b)-order(a));
    tip.hidden=cursor.hidden=false;
    cursor.style.left=px(i)+"px";
    tip.classList.toggle("tip-left",px(i)>w/2);
    tip.innerHTML="<b>"+years[i]+"</b><ul>"+ordered.map(line=>{
      const {value,note}=line.values[i], description=noteText(note);
      return '<li><span class="dot" style="background:'+line.color+'"></span><span>'+esc(line.name)+'</span>'+
        '<strong>'+display(value)+'</strong>'+(description?'<small>'+esc(description)+'</small>':"")+'</li>';
    }).join("")+"</ul>";
  };
  canvas.onpointerleave=()=>{tip.hidden=cursor.hidden=true;currentYear=-1;};
}
function rebasedSeries(series,years,baseline) {
  const index=years.indexOf(baseline);
  const eligible=series.filter(line=>line.values[index].value>0);
  const dates=years.slice(index);
  const records=dates.map((year,i)=>Object.fromEntries([
    ["year",year],...eligible.map((line,j)=>["series"+j,line.values[index+i].value??null])
  ]));
  const rebased=rebaseToPercentChange(records,"year");
  return series.map(line=>{
    const position=eligible.indexOf(line);
    return {...line,values:line.values.map((m,i)=>({note:m.note,
      value:position>=0&&i>=index?rebased[i-index]["series"+position]:null}))};
  });
}
export function redraw(container,charts,meta) {
  for (const chart of charts) {
    const card=container.querySelector('[data-chart="'+CSS.escape(String(chart.id))+'"]');
    card?.querySelectorAll("[data-chart-part]").forEach((part,i)=>draw(part,chartParts(chart)[i],meta));
  }
}
