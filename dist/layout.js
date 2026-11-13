import {$,esc} from "./model.js";
import {prefs,save} from "./i18n.js";

const gap=8, paneMinimum=300;
const profileMinimum=316, profileDefault=464;
const defaultRatio=.53,defaultCollectionRatio=.47;
export const defaultChartHeight=186;
const saved=prefs.layout||{};
const bounded=(value,min,max)=>Math.max(min,Math.min(max,value));
const dimension=(value,fallback,min,max)=>Number.isFinite(value)?bounded(value,min,max):fallback;
const columns={
  "name-column":{field:"nameWidth",property:"--name-width-override",min:156,max:620,reserve:88},
  "peer-column":{field:"peerLabelWidth",property:"--peer-width-override",min:76,max:300,reserve:82},
  "history-column":{field:"historyYearWidth",property:"--year-width-override",min:52,max:220,reserve:82}
};
const layout={
  table:dimension(saved.table,defaultRatio,0,1),
  collection:dimension(saved.collection,defaultCollectionRatio,0,1),
  profile:dimension(saved.profile,profileDefault,profileMinimum,900),
  filters:{...saved.filters},
  closed:{...saved.closed},
  ...Object.fromEntries(Object.values(columns).map(({field,min,max})=>[field,dimension(saved[field],undefined,min,max)]))
};
const docking=matchMedia("(min-width: 1240px)");
let viewKey="finance", chartFor;

const filterKey=id=>id==="directory"?"directory":viewKey;
const px=value=>Math.round(value)+"px";
const commit=()=>{prefs.layout=layout;save();};
const size=(element,axis)=>axis==="x"?element.getBoundingClientRect().width:element.getBoundingClientRect().height;

function applyWorkspaceSizes() {
  const workspace=$("workspace");
  workspace.style.setProperty("--table-ratio",layout.table);
  workspace.style.setProperty("--collection-ratio",layout.collection);
  workspace.style.setProperty("--profile-width",px(layout.profile));
  for (const {field,property} of Object.values(columns)) {
    if (layout[field]===undefined) workspace.style.removeProperty(property);
    else workspace.style.setProperty(property,px(layout[field]));
  }
}
export function columnResizeHandle(key,table,label) {
  return '<span class="splitter column-resize" role="separator" tabindex="0" aria-orientation="vertical"'+
    ' data-resize="'+esc(key)+'" aria-controls="'+esc(table)+'" aria-label="'+esc(label)+'"></span>';
}
function setFilters(id) {
  const key=filterKey(id), panel=$(id+"-content");
  const closed=layout.closed[key]===true;
  panel.toggleAttribute("data-collapsed",closed);
  $(id+"-filters").hidden=closed;
  document.querySelector('[data-toggle-filters="'+id+'"]').setAttribute("aria-expanded",String(!closed));
}
export function updateFilterLayout(tab) {
  if (tab!=="directory") viewKey=tab;
  setFilters(tab==="directory"?"directory":"financial");
  refreshSplitters();
}

function chartMetrics(handle) {
  const card=handle.closest("[data-chart]");
  const chart=chartFor(card.dataset.chart);
  if (!chart) return null;
  if (handle.dataset.resize==="chart-height") {
    return {axis:"y",min:150,max:560,value:size(card.querySelector("canvas"),"y"),reset:defaultChartHeight,
      write(height) {chart.height=Math.round(height);card.style.setProperty("--plot-height",px(height));}};
  }
  const next=card.nextElementSibling;
  const neighbor=next&&chartFor(next.dataset.chart);
  if (!neighbor) return null;
  const current=size(card,"x"),total=current+size(next,"x"),weight=(chart.weight||1)+(neighbor.weight||1);
  const min=Math.min(200,total*.45);
  function write(width) {
    chart.weight=weight*width/total;
    neighbor.weight=weight-chart.weight;
    card.style.setProperty("--chart-weight",chart.weight);
    next.style.setProperty("--chart-weight",neighbor.weight);
  }
  return {axis:"x",min,max:total-min,value:current,step:16,
    restore() {
      for (const item of card.parentElement.children) {
        delete chartFor(item.dataset.chart).weight;
        item.style.setProperty("--chart-weight",1);
      }
    },write};
}
function metricsFor(handle) {
  if (!handle.getClientRects().length) return null;
  const key=handle.dataset.resize;
  if (key.startsWith("chart-")) return chartMetrics(handle);
  if (Object.hasOwn(columns,key)) {
    const {field,min,max,reserve}=columns[key];
    const viewport=handle.closest(".table-scroll,.profile-table");
    return {axis:"x",min,max:bounded(viewport.clientWidth-reserve,min,max),value:size(handle.closest("th"),"x"),
      restore() {delete layout[field];applyWorkspaceSizes();},
      write(value) {layout[field]=Math.round(value);applyWorkspaceSizes();}};
  }
  if (key==="work-area"||key==="collection-work-area") {
    const collecting=key==="collection-work-area",field=collecting?"collection":"table";
    const width=size($("work-area"),"x")-gap;
    return {axis:"x",min:paneMinimum,max:width-paneMinimum,value:size($(collecting?"collection":"explorer"),"x"),
      restore() {layout[field]=collecting?defaultCollectionRatio:defaultRatio;applyWorkspaceSizes();},
      write(value) {layout[field]=value/width;applyWorkspaceSizes();}};
  }
  if (key==="profile-width") {
    const workspace=$("workspace"), width=size(workspace,"x");
    const minWork=Number.parseFloat(getComputedStyle(workspace).getPropertyValue("--min-work"));
    const max=docking.matches?width-minWork-gap:Math.min(900,width*.85);
    return {axis:"x",direction:-1,min:profileMinimum,max,value:size($("profile-panel"),"x"),
      restore() {layout.profile=profileDefault;applyWorkspaceSizes();},
      write(value) {layout.profile=Math.round(value);applyWorkspaceSizes();}};
  }
  return null;
}

function describe(handle,metrics) {
  if (!metrics) return;
  for (const [name,value] of [["min",metrics.min],["max",metrics.max],["now",metrics.value]]) {
    handle.setAttribute("aria-value"+name,String(Math.round(value)));
  }
  handle.setAttribute("aria-valuetext",px(metrics.value));
  handle.title=handle.getAttribute("aria-label");
}
export function refreshSplitters() {
  requestAnimationFrame(()=>{
    if (!chartFor) return;
    $("workspace").querySelectorAll("[data-resize]").forEach(handle=>describe(handle,metricsFor(handle)));
  });
}

export function wireLayout(resolveChart,onDragStart,onResize=()=>{}) {
  chartFor=resolveChart;
  applyWorkspaceSizes();
  setFilters("financial");
  setFilters("directory");
  const workspace=$("workspace");
  let drag;
  const set=(handle,metrics,value)=>{
    if (!metrics||metrics.max<=metrics.min) return;
    metrics.write(bounded(value,metrics.min,metrics.max));
    describe(handle,metricsFor(handle));
  };
  workspace.addEventListener("click",event=>{
    const button=event.target.closest("[data-toggle-filters]");
    if (!button) return;
    const id=button.dataset.toggleFilters, key=filterKey(id);
    layout.closed[key]=layout.closed[key]!==true;
    setFilters(id);
    refreshSplitters();
    commit();
  });
  workspace.addEventListener("pointerdown",event=>{
    const handle=event.target.closest("[data-resize]");
    if (!handle||event.button!==0||drag) return;
    const metrics=metricsFor(handle);
    if (!metrics||metrics.max<=metrics.min) return;
    event.preventDefault();
    handle.focus({preventScroll:true});
    handle.setPointerCapture(event.pointerId);
    drag={handle,metrics,id:event.pointerId,start:metrics.axis==="x"?event.clientX:event.clientY};
    document.body.dataset.resizing=metrics.axis;
    handle.classList.add("dragging");
    onDragStart();
  });
  workspace.addEventListener("pointermove",event=>{
    if (event.pointerId!==drag?.id) return;
    const {handle,metrics,start}=drag;
    const position=metrics.axis==="x"?event.clientX:event.clientY;
    set(handle,metrics,metrics.value+(position-start)*(metrics.direction??1));
  });
  function finish(event) {
    if (event.pointerId!==drag?.id) return;
    const {handle}=drag;
    handle.classList.remove("dragging");
    delete document.body.dataset.resizing;
    drag=null;
    commit();
    onResize(handle);
    refreshSplitters();
  }
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) workspace.addEventListener(type,finish);
  workspace.addEventListener("dblclick",event=>{
    const handle=event.target.closest("[data-resize]");
    if (!handle) return;
    const metrics=metricsFor(handle);
    if (!metrics) return;
    if (metrics.restore) metrics.restore();
    else set(handle,metrics,metrics.reset);
    commit();
    onResize(handle);
    refreshSplitters();
  });
  workspace.addEventListener("keydown",event=>{
    const handle=event.target.closest("[data-resize]");
    if (!handle) return;
    const metrics=metricsFor(handle);
    if (!metrics) return;
    const previous=metrics.axis==="x"?"ArrowLeft":"ArrowUp";
    const next=metrics.axis==="x"?"ArrowRight":"ArrowDown";
    const step=(metrics.step??12)*(metrics.direction??1);
    const values={[previous]:metrics.value-step,[next]:metrics.value+step,Home:metrics.min,End:metrics.max};
    if (!(event.key in values)) return;
    event.preventDefault();
    set(handle,metrics,values[event.key]);
    commit();
    onResize(handle);
    refreshSplitters();
  });
  if (typeof ResizeObserver==="function") new ResizeObserver(refreshSplitters).observe(workspace);
  refreshSplitters();
}
