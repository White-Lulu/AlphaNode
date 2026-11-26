import {$,esc,finite,measure,modeLabel,resultUnit,scale,unitLabel} from "./model.js";
import {companyNames,locale,pair,prefs,prose,save,scopeLabel} from "./i18n.js";
import {metricLabel} from "./glossary.js";
import {renderCharts,redraw,seriesName,chartRows,chartRowKey,chartParts,chartObservations,chartMetadata,isMergeableRow,moveChartInRows} from "./chart.js";
import {refreshSplitters} from "./layout.js";
import {request,message,analyzeCustomChart} from "./analysis-client.js";
import {applyAnalysisMarks,remapAnalysisMarks,setAnalysisMark,wireAnalysisSelection} from "./analysis-selection.js";
import {renderAnalysis,renderLegacyAnalysis} from "./analysis-markdown.js";

const saved=()=>prefs.savedCharts??[];
const folders=()=>prefs.savedChartFolders??[];
const find=id=>saved().find(chart=>chart.id===id);
const findFolder=id=>folders().find(folder=>folder.id===id);
const expanded=new Set(),closedFolders=new Set(),previews=new Map(),inProgress=new Set(),errors=new Map();
const selectedRows=new Set();
let meta,financialGroups,levelOf,onSaved,prepareAnalysis,showWorkbench,pendingSave,editing,drag,dropMarker,analysisSettings;
let bench=[],choosingRows=false;
const svgPaths={
  add:"M10 4v12M4 10h12",
  gear:"M8.2 3h3.6l.5 2.1 1.5.8 2.1-.6 1.8 3.1-1.6 1.5v1.6l1.6 1.5-1.8 3.1-2.1-.6-1.5.8-.5 2H8.2l-.5-2-1.5-.8-2.1.6-1.8-3.1 1.6-1.5v-1.6L2.3 8.4l1.8-3.1 2.1.6 1.5-.8.5-2.1ZM12.4 10.7a2.4 2.4 0 1 0-4.8 0 2.4 2.4 0 1 0 4.8 0Z",
  drag:"M4 6h12M4 10h12M4 14h12",
  edit:"m4 14 10-10 2 2L6 16H4v-2Zm8.5-8.5 2 2",
  trash:"M4 6h12M8 6V4h4v2M6 6l.6 10h6.8L14 6M9 9v4m2-4v4",
  folder:"M3 5h5l2 2h7v8H3z",
  done:"m4 10 4 4 8-8"
};
function icon(name) {
  return '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="'+svgPaths[name]+
    '" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function iconButton(name,label,attrs="") {
  return '<button type="button" class="saved-icon" aria-label="'+esc(label)+'" title="'+esc(label)+'" '+attrs+'>'+icon(name)+'</button>';
}
function status(text) {
  const output=$("saved-status");
  output.textContent=text;
  output.hidden=!text;
}
function storeChanges(changes) {
  const previous=Object.fromEntries(Object.keys(changes).map(key=>[key,prefs[key]]));
  Object.assign(prefs,changes);
  if (save()) return true;
  Object.assign(prefs,previous);
  status(prose("本地存储空间不足。","Local storage is full."));
  return false;
}
const store=(key,value)=>storeChanges({[key]:value});
export function compactChartSubjects(subjects) {
  const chosen=subjects.slice(0,3);
  while (chosen.length>1&&chosen.reduce((sum,item)=>sum+Array.from(item.name).length,0)>prose(20,54)) {
    const longest=chosen.reduce((best,item)=>Array.from(item.name).length>Array.from(best.name).length?item:best);
    chosen.splice(chosen.indexOf(longest),1);
  }
  return chosen.map(item=>item.name).join("&");
}
function chartTitle(chart) {
  if (chart.macro) return chart.title;
  const rows=[...new Map(chart.pins.map(pin=>[pin.row.id,pin.row])).values()];
  const domains=rows.some(row=>row.kind!=="company");
  const subjects=rows.map(row=>({
    name:row.kind==="company"?prose(...companyNames(row)):prose(row.name,row.en||row.name),level:levelOf(row)
  })).sort((a,b)=>(domains?a.level-b.level:0)||Array.from(a.name).length-Array.from(b.name).length||
    a.name.localeCompare(b.name,locale()));
  const scopes=chart.pins.map(pin=>pin.scope);
  const scope=["world","global","cn","china","ex"].find(key=>scopes.includes(key))??scopes[0];
  const count=domains?prose("等"+rows.length+"个领域"," ("+rows.length+" domains)"):
    prose("等"+rows.length+"家企业"," ("+rows.length+" companies)");
  return (domains&&scope?scopeLabel(scope)+"-":"")+compactChartSubjects(subjects)+count+
    "-"+metricLabel(chart.metric,meta)+"·"+modeLabel(chart.mode);
}
function snapshot(chart,title) {
  const years=(chart.years??meta.years).slice();
  return {id:crypto.randomUUID(),title,created:Date.now(),updated:chart.built??meta.built,years,
    ...(chart.macro?{macro:true,type:chart.type,height:chart.height,tags:chart.tags,sourceNotes:chart.sourceNotes,metricDefinitions:chart.metricDefinitions,scatter:chart.scatter}:{}),
    metric:chart.metric,mode:chart.mode,baseline:chart.baseline??null,pins:chart.pins.map(pin=>({
      row:{id:pin.row.id,kind:pin.row.kind,currency:pin.row.currency||"USD",scheme:pin.row.scheme},
      scope:pin.scope,aggregate:pin.aggregate,isAggregate:pin.isAggregate,source:pin.source,savedName:seriesName(pin),
      savedValues:pin.savedValues??years.map(year=>measure(pin.row,chart.metric,year,pin.scope,pin.aggregate,chart.mode,meta))
    }))};
}
function openNameDialog(name,make,notify) {
  pendingSave={make,notify};
  const input=$("saved-chart-input");
  input.value=name.slice(0,320);
  $("save-chart-status").textContent="";
  $("save-chart-dialog").showModal();
  input.focus();
  input.setSelectionRange(input.value.length,input.value.length);
}
export function openSaveChart(chart) {
  if (chart.pins.length) openNameDialog(chartTitle(chart),title=>snapshot(chart,title),onSaved);
}
function saveChart() {
  const title=$("saved-chart-input").value.trim();
  if (!title||!pendingSave) return;
  const chart=pendingSave.make(title);
  if (!store("savedCharts",[chart,...saved()])) {
    $("save-chart-status").textContent=prose("本地存储空间不足。","Local storage is full.");
    return;
  }
  pendingSave.notify?.(title);
  $("save-chart-dialog").close();
  renderSavedCharts();
}

function beginMerge() {
  if (!choosingRows) return;
  const rows=chartRows(bench).filter(row=>selectedRows.has(chartRowKey(row))&&isMergeableRow(row));
  if (!rows.length) return;
  const parts=rows.flatMap((row,index)=>row.map(({title,metric,mode,baseline,years,pins,weight,macro,type,tags,metricDefinitions,scatter})=>
    ({title,metric,mode,baseline,years,pins,weight,macro,type,tags,metricDefinitions,scatter,row:index})));
  const name=parts.slice(0,2).map(part=>part.title).join(" / ");
  openNameDialog(name+" · "+pair("合并图表","Merged chart"),title=>({
    id:crypto.randomUUID(),title,created:Date.now(),updated:meta.built,parts
  }),()=>{
    choosingRows=false;
    selectedRows.clear();
    status("");
  });
}

function previewFor(chart) {
  let view=previews.get(chart.id);
  if (!view) {
    view=document.createElement("div");
    view.id="saved-preview-"+chart.id;
    view.className="saved-preview";
    previews.set(chart.id,view);
  }
  return view;
}
function renderPreview(chart,host) {
  const preview=previewFor(chart);
  host.prepend(preview);
  if (preview.dataset.language!==prefs.language) {
    renderCharts(preview,[chart],null,meta,financialGroups,{readonly:true});
    preview.dataset.language=prefs.language;
  }
}
function refreshAnalysis(chart,output) {
  const text=chart.analysis?.text;
  delete output.dataset.analysisId;
  output.hidden=!text;
  output.innerHTML=text?renderAnalysis(text):"";
  if (text) {
    applyAnalysisMarks(output,analysisMarks(chart.analysis,output.textContent));
    output.dataset.analysisId=chart.id;
  }
}
function analysisMarks(analysis,text) {
  if (analysis.markFormat===2||!analysis.marks?.length) return analysis.marks;
  const previous=document.createElement("div");
  previous.innerHTML=renderLegacyAnalysis(analysis.text);
  return remapAnalysisMarks(previous.textContent,text,analysis.marks);
}
function defaultAnalysisUsed(chart) {
  const analysis=chart.analysis;
  return analysis?.provider==="default"||Boolean(!analysis?.provider&&analysis?.model&&analysis.model===analysisSettings?.defaultModel);
}
function defaultAnalysisBlocked(chart) {
  return analysisSettings?.provider==="default"&&defaultAnalysisUsed(chart);
}
function updateAnalysisActions(chart,host) {
  const button=host.querySelector("[data-analyze-chart]"),status=host.querySelector(".saved-analysis-status");
  const tip=host.querySelector(".saved-analysis-lock-tip");
  const working=inProgress.has(chart.id),blocked=defaultAnalysisBlocked(chart);
  button.disabled=working||blocked;
  button.textContent=chart.analysis?pair("重新分析","Analyze again"):pair("AI 分析","AI analysis");
  tip.hidden=!blocked;
  tip.textContent=blocked?pair("上次已用默认配置分析","Last analysis used the default configuration"):"";
  const action=tip.parentElement;
  if (blocked) {
    action.tabIndex=0;
    action.setAttribute("aria-describedby",tip.id);
  } else {
    action.removeAttribute("tabindex");
    action.removeAttribute("aria-describedby");
  }
  status.textContent=working?prose("正在分析图表…","Analyzing the chart…"):errors.get(chart.id)||"";
  status.hidden=!status.textContent;
}
export function setAnalysisSettings({provider,defaultModel}) {
  analysisSettings={provider,defaultModel};
  for (const host of $("saved-charts").querySelectorAll(".saved-chart-content")) {
    const chart=find(host.closest("[data-saved-id]").dataset.savedId);
    if (chart) updateAnalysisActions(chart,host);
  }
}
function markAnalysis({root,id,start,end},marked) {
  const chart=find(id);
  if (!chart?.analysis||root.dataset.analysisId!==id||end<=start) return false;
  const analysis={...chart.analysis,markFormat:2,marks:setAnalysisMark(analysisMarks(chart.analysis,root.textContent),start,end,marked)};
  const updated={...chart,analysis};
  if (!store("savedCharts",saved().map(item=>item===chart?updated:item))) return false;
  refreshAnalysis(updated,root);
  return true;
}
function editor(value,id,kind) {
  return '<form class="saved-inline-editor" data-edit-kind="'+kind+'" data-edit-id="'+esc(id)+'"><input type="text" required maxlength="'+
    (kind==="folder"?100:320)+'" value="'+esc(value)+'" aria-label="'+esc(pair("编辑标题","Edit title"))+'">'+
    iconButton("done",pair("应用标题","Apply title"),'data-apply-title')+
    '<button type="button" class="saved-icon" data-cancel-title aria-label="'+esc(pair("取消","Cancel"))+'">×</button></form>';
}
function dragAttrs(kind,id) {
  return 'draggable="true" data-drag-kind="'+kind+'" data-drag-id="'+esc(id)+'"';
}
function chartRowHTML(chart) {
  const id=esc(chart.id),open=expanded.has(chart.id),added=bench.some(card=>card.sourceId===chart.id);
  const title=editing?.kind==="chart"&&editing.id===chart.id?editor(chart.title,chart.id,"chart"):
    '<button type="button" class="saved-chart-title" '+dragAttrs("chart",chart.id)+' data-expand-saved="'+id+
    '" aria-expanded="'+open+'"><span class="saved-chevron" aria-hidden="true"></span><span>'+esc(chart.title)+'</span></button>';
  const menuId="saved-menu-"+id;
  return '<article class="saved-chart-item" data-saved-id="'+id+'"><div class="saved-chart-row">'+title+
    '<div class="saved-row-actions">'+iconButton(added?"done":"add",added?pair("已加入图表工作台","In chart workbench"):
      pair("加入图表工作台","Add to chart workbench"),'data-bench-add="'+id+'" aria-pressed="'+added+'"')+
    iconButton("gear",pair("图表设置","Chart settings"),'popovertarget="'+menuId+'"')+
    iconButton("drag",pair("拖动图表排序","Drag to reorder chart"),dragAttrs("chart",chart.id))+'</div>'+
    '<div id="'+menuId+'" class="saved-menu" popover>'+
    '<button type="button" data-edit-chart="'+id+'">'+icon("edit")+esc(pair("编辑标题","Edit title"))+'</button>'+
    '<button type="button" data-delete-chart="'+id+'">'+icon("trash")+esc(pair("删除图表","Delete chart"))+'</button></div></div>'+
    (open?'<div class="saved-chart-content"><div class="saved-analysis-actions"><span class="hint-copy saved-analysis-status" role="status" hidden></span>'+
    '<div class="saved-analysis-action"><button type="button" class="quiet" data-analyze-chart="'+id+'"></button>'+
    '<span class="saved-analysis-lock-tip" role="tooltip" id="analysis-lock-'+id+'" hidden></span></div></div>'+
    '<div class="saved-analysis" aria-live="polite" hidden></div></div>':"")+'</article>';
}
function folderHTML(folder,charts) {
  const id=esc(folder.id),open=!closedFolders.has(folder.id);
  const title=editing?.kind==="folder"&&editing.id===folder.id?editor(folder.title,folder.id,"folder"):
    '<button class="saved-folder-title" type="button" '+dragAttrs("folder",folder.id)+' data-toggle-folder="'+id+
    '" aria-expanded="'+open+'">'+icon("folder")+'<span>'+esc(folder.title)+'</span><small>'+charts.length+'</small></button>';
  const menuId="saved-folder-menu-"+id;
  return '<section class="saved-folder" data-folder-id="'+id+'"><div class="saved-folder-row">'+title+'<div class="saved-row-actions">'+
    iconButton("gear",pair("分类夹设置","Folder settings"),'popovertarget="'+menuId+'"')+
    iconButton("drag",pair("拖动分类夹排序","Drag to reorder folder"),dragAttrs("folder",folder.id))+'</div>'+
    '<div id="'+menuId+'" class="saved-menu" popover>'+
    '<button type="button" data-edit-folder="'+id+'">'+icon("edit")+esc(pair("编辑标题","Edit title"))+'</button>'+
    '<button type="button" data-delete-folder="'+id+'">'+icon("trash")+esc(pair("删除分类夹","Delete folder"))+'</button></div></div>'+
    (open?'<div class="saved-folder-content">'+(charts.length?charts.map(chartRowHTML).join(""):
    '<p class="saved-drop-note">'+esc(pair("拖入图表","Drop charts here"))+'</p>')+'</div>':"")+'</section>';
}
function renderSavedList() {
  const root=$("saved-charts"),charts=saved(),allFolders=folders();
  $("saved-chart-count").textContent=" · "+charts.length.toLocaleString(locale());
  const children=allFolders.map(folder=>folderHTML(folder,charts.filter(chart=>chart.folder===folder.id))).join("");
  const unfiled=charts.filter(chart=>!findFolder(chart.folder));
  root.innerHTML=children+'<div class="saved-root" data-root-drop>'+
    (children?'<div class="saved-root-title" data-root-drop>'+esc(pair("未分类","Unfiled"))+'</div>':"")+
    unfiled.map(chartRowHTML).join("")+
    (!charts.length&&!children?'<p class="hint-copy">'+esc(pair("在趋势图上点击保存，图表会出现在这里。","Save a trend chart to see it here."))+'</p>':"")+
    '</div>';
  for (const host of root.querySelectorAll(".saved-chart-content")) {
    const chart=find(host.closest("[data-saved-id]").dataset.savedId);
    renderPreview(chart,host);
    updateAnalysisActions(chart,host);
    refreshAnalysis(chart,host.querySelector(".saved-analysis"));
  }
  root.querySelector("[data-edit-kind] input")?.focus({preventScroll:true});
}
function analysisContext(chart) {
  return {title:chart.title,series:chartParts(chart).flatMap(part=>{
    const metadata=chartMetadata(part,meta);
    if(part.scatter) {
      const spec=part.scatter;
      const axis=key=>({metric:metricLabel(key,metadata),unit:unitLabel(key,"level",metadata)});
      return part.pins.map((pin,index)=>({name:seriesName(pin),chartTitle:part.title,chartType:"scatter",view:spec.view,
        x:axis(spec.x),y:axis(spec.y),frequency:spec.frequency,source:pin.source,sourceNotes:part.sourceNotes,isAggregate:pin.isAggregate,
        observationFields:["period","x","y"],
        observations:spec.points.filter(point=>point.pin===index).map(point=>[point.period,
          scale(point.x,spec.x,"level",metadata),scale(point.y,spec.y,"level",metadata)]),
        interpretation:"Exact-period pairs; no interpolation. Association is not causation. Do not pool time trajectories across economies or overlapping aggregates. Trends and serial dependence may affect correlations."
      }));
    }
    const {years,baseline,series}=chartObservations(part,meta);
    return series.map((line,i)=>{
      const pin=part.pins[i],unit=resultUnit(part.metric,part.mode,metadata);
      return {name:line.name,chartTitle:part.title,metric:metricLabel(part.metric,metadata),timeBasis:part.tags?.join(" · ")??modeLabel(part.mode),baselineYear:baseline,
        region:scopeLabel(pin.scope),classification:pin.row.scheme,source:pin.source,sourceNotes:part.sourceNotes,aggregation:pin.aggregate,
        unit:baseline?"%":unitLabel(part.metric,part.mode,metadata,line.currency),
        currency:!baseline&&unit==="money"?line.currency:undefined,
        observations:years.map((year,j)=>{
          const {value,note}=line.values[j];
          return [year,finite(value)?baseline?100*value:scale(value,part.metric,part.mode,metadata):null,note];
        })};
    });
  })};
}
async function analyzeChart(chart) {
  if (!chart||inProgress.has(chart.id)) return;
  const host=()=>$("saved-charts").querySelector('[data-saved-id="'+CSS.escape(chart.id)+'"] .saved-chart-content');
  const update=()=>{
    const current=find(chart.id),content=host();
    if (current&&content) updateAnalysisActions(current,content);
  };
  errors.delete(chart.id);
  inProgress.add(chart.id);
  update();
  try {
    const config=await prepareAnalysis();
    if (!find(chart.id)||defaultAnalysisBlocked(chart)) return;
    const data={chart:analysisContext(chart),language:prose("zh","en"),
      previousAnalysis:{provider:chart.analysis?.provider,model:chart.analysis?.model}};
    const result=config.provider==="custom"?await analyzeCustomChart(config,data):await request("/api/chart-analysis",data);
    const current=find(chart.id);
    if (!current) return;
    const updated={...current,analysis:{...result,marks:[]}};
    if (store("savedCharts",saved().map(item=>item===current?updated:item))) {
      const output=host()?.querySelector(".saved-analysis");
      if (output) refreshAnalysis(updated,output);
    }
  } catch (error) {
    if (find(chart.id)) errors.set(chart.id,message(error));
  } finally {
    inProgress.delete(chart.id);
    update();
  }
}

export function getWorkbenchChart(id) {return bench.find(chart=>chart.id===id);}
export function persistWorkbench() {
  prefs.chartWorkbench={...prefs.chartWorkbench,entries:bench.map(({sourceId,row,height,weight})=>({sourceId,row,height,weight}))};
  save();
}
function updateMergeButton() {
  const count=selectedRows.size,button=$("merge-saved-charts"),toggle=$("select-bench-rows");
  toggle.setAttribute("aria-pressed",String(choosingRows));
  toggle.textContent=choosingRows?pair("取消选择","Cancel selection"):pair("选择图表行","Select chart rows");
  toggle.disabled=!bench.length;
  button.hidden=!choosingRows;
  button.disabled=!count;
  const label=pair("合并保存","Merge and save");
  button.textContent=count?label+" ("+count+")":label;
}
function renderWorkbench() {
  const root=$("collection-charts");
  if (!bench.length) choosingRows=false;
  const eligible=new Set(chartRows(bench).filter(isMergeableRow).map(chartRowKey));
  for (const key of selectedRows) if (!eligible.has(key)) selectedRows.delete(key);
  updateMergeButton();
  renderCharts(root,bench,null,meta,financialGroups,{workbench:true,selectedRows:choosingRows?selectedRows:null});
  if (!bench.length) root.innerHTML='<p class="bench-empty">'+esc(pair("从数据展台的已保存图表添加图表。","Add charts from Saved charts in the Data gallery."))+'</p>';
  refreshSplitters();
}
function addToWorkbench(id) {
  const chart=find(id);
  if (!chart) return;
  if (!bench.some(card=>card.sourceId===id)) bench.push({...chart,id:"bench-"+id,sourceId:id,row:(bench.at(-1)?.row??-1)+1});
  showWorkbench?.();
  renderSavedCharts();
  $("collection-views").querySelector('[data-view-panel="charts"]').focus({preventScroll:true});
}
export function repaintSavedChart() {
  for (const [id,view] of previews) {
    const chart=find(id);
    if (chart&&view.isConnected) redraw(view,[chart],meta);
  }
  if (!$("collection-workbench").hidden) redraw($("collection-charts"),bench,meta);
}
export function renderSavedCharts() {
  renderSavedList();
  renderWorkbench();
}

function moveSaved(kind,id,targetId,folder,after=false) {
  const list=kind==="folder"?folders():saved();
  const item=list.find(entry=>entry.id===id);
  if (!item||id===targetId) return;
  const next=list.filter(entry=>entry.id!==id);
  const target=targetId?next.findIndex(entry=>entry.id===targetId):-1;
  const position=target>=0?target+Number(after):next.length;
  next.splice(position,0,kind==="folder"?item:{...item,folder:folder||null});
  if (store(kind==="folder"?"savedChartFolders":"savedCharts",next)) renderSavedList();
}
function clearDrop() {
  dropMarker?.removeAttribute("data-drop-position");
  dropMarker=null;
}
function dropDestination(event) {
  if (!drag) return null;
  const row=event.target.closest(".saved-chart-row"),folderRow=event.target.closest(".saved-folder-row");
  const folder=event.target.closest("[data-folder-id]")?.dataset.folderId;
  const after=element=>event.clientY>element.getBoundingClientRect().top+element.offsetHeight/2;
  if (drag.kind==="folder") return folderRow&&folder!==drag.id?{element:folderRow,target:folder,after:after(folderRow)}:null;
  const target=row?.closest("[data-saved-id]").dataset.savedId;
  if (row) return target===drag.id?null:{element:row,target,folder,after:after(row)};
  if (folder) return {element:folderRow??event.target.closest(".saved-folder").firstElementChild,folder,inside:true};
  const root=event.target.closest("[data-root-drop]");
  return root?{element:root,inside:true}:null;
}
function wireDrag(root) {
  root.ondragstart=event=>{
    const target=event.target.closest("[data-drag-kind]");
    if (!target) return;
    drag={kind:target.dataset.dragKind,id:target.dataset.dragId};
    event.dataTransfer.effectAllowed="move";
    event.dataTransfer.setData("text/plain",drag.id);
  };
  root.ondragover=event=>{
    const drop=dropDestination(event);
    clearDrop();
    if (!drop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect="move";
    dropMarker=drop.element;
    dropMarker.dataset.dropPosition=drop.inside?"inside":drop.after?"after":"before";
  };
  root.ondragleave=event=>{if (!root.contains(event.relatedTarget)) clearDrop();};
  root.ondrop=event=>{
    const drop=dropDestination(event);
    if (drop) {
      event.preventDefault();
      moveSaved(drag.kind,drag.id,drop.target,drop.folder,drop.after);
    }
    drag=null;
    clearDrop();
  };
  root.ondragend=()=>{drag=null;clearDrop();};
}
function deleteSavedItems(ids,folderId) {
  const removed=new Set(ids);
  const changes={savedCharts:saved().filter(chart=>!removed.has(chart.id))};
  if (folderId) changes.savedChartFolders=folders().filter(folder=>folder.id!==folderId);
  if (!storeChanges(changes)) return;
  for (const id of removed) {
    const preview=previews.get(id);
    if (preview) renderCharts(preview,[],null,meta,financialGroups,{readonly:true});
    previews.delete(id);
    expanded.delete(id);
    errors.delete(id);
  }
  if (folderId) closedFolders.delete(folderId);
  if (removed.has(editing?.id)||(folderId&&editing?.id===folderId)) editing=null;
  const affectedRows=new Set(bench.filter(card=>removed.has(card.sourceId)).map(card=>card.row));
  bench=bench.filter(card=>!removed.has(card.sourceId));
  for (const card of bench) if (affectedRows.has(card.row)) delete card.weight;
  if (!bench.length) choosingRows=false;
  persistWorkbench();
  renderSavedCharts();
}
function wireLibrary(root) {
  root.onclick=event=>{
    const button=event.target.closest("button");
    if (!button) return;
    const {expandSaved,toggleFolder,editChart,editFolder,deleteChart,deleteFolder,benchAdd,analyzeChart:analysisId}=button.dataset;
    if (expandSaved) {
      expanded.has(expandSaved)?expanded.delete(expandSaved):expanded.add(expandSaved);
      renderSavedList();
      root.querySelector('[data-expand-saved="'+CSS.escape(expandSaved)+'"]')?.focus({preventScroll:true});
    } else if (toggleFolder) {
      closedFolders.has(toggleFolder)?closedFolders.delete(toggleFolder):closedFolders.add(toggleFolder);
      renderSavedList();
    } else if (editChart||editFolder) {
      editing={kind:editChart?"chart":"folder",id:editChart||editFolder};
      renderSavedList();
    } else if (deleteChart) deleteSavedItems([deleteChart]);
    else if (deleteFolder) deleteSavedItems(saved().filter(chart=>chart.folder===deleteFolder).map(chart=>chart.id),deleteFolder);
    else if (benchAdd) addToWorkbench(benchAdd);
    else if (analysisId) void analyzeChart(find(analysisId));
    else if (button.hasAttribute("data-apply-title")) button.closest("form").requestSubmit();
    else if (button.hasAttribute("data-cancel-title")) {editing=null;renderSavedList();}
  };
  root.onsubmit=event=>{
    const form=event.target.closest("[data-edit-kind]");
    if (!form) return;
    event.preventDefault();
    const {editKind,editId}=form.dataset,title=form.querySelector("input").value.trim();
    if (!title) return;
    const folder=editKind==="folder",list=folder?folders():saved();
    if (!store(folder?"savedChartFolders":"savedCharts",list.map(item=>item.id===editId?{...item,title}:item))) return;
    editing=null;
    const card=bench.find(chart=>chart.sourceId===editId);
    if (card) card.title=title;
    renderSavedCharts();
  };
  root.onkeydown=event=>{
    if (event.key==="Escape"&&event.target.closest("[data-edit-kind]")) {editing=null;renderSavedList();return;}
    const handle=event.target.closest(".saved-icon[data-drag-kind]");
    if (!handle||!event.altKey||!["ArrowUp","ArrowDown"].includes(event.key)) return;
    const {dragKind:kind,dragId:id}=handle.dataset,after=event.key==="ArrowDown";
    const folder=find(id)?.folder,list=kind==="folder"?folders():saved().filter(chart=>(chart.folder||null)===(folder||null));
    const target=list[list.findIndex(item=>item.id===id)+(after?1:-1)];
    if (!target) return;
    event.preventDefault();
    moveSaved(kind,id,target.id,folder,after);
    root.querySelector('.saved-icon[data-drag-id="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});
  };
  wireDrag(root);
}
export function wireSavedCharts(config) {
  ({meta,financialGroups,levelOf,onSaved,prepareAnalysis,showWorkbench}=config);
  const previous=prefs.chartWorkbench;
  bench=(previous?.entries??[]).flatMap(entry=>{
    const chart=find(entry.sourceId);
    return chart?[{...chart,...entry,id:"bench-"+chart.id}]:[];
  });
  $("cancel-save-chart").onclick=()=>$("save-chart-dialog").close();
  $("save-chart-dialog").onclose=()=>{pendingSave=null;};
  $("save-chart-form").onsubmit=event=>{event.preventDefault();saveChart();};
  wireLibrary($("saved-charts"));
  wireAnalysisSelection(markAnalysis);
  $("new-saved-folder").onclick=event=>{
    event.preventDefault();
    $("saved-charts-title").parentElement.open=true;
    $("saved-folder-form").hidden=false;
    $("saved-folder-name").focus();
  };
  $("cancel-saved-folder").onclick=()=>{$("saved-folder-form").hidden=true;};
  $("saved-folder-form").onsubmit=event=>{
    event.preventDefault();
    const input=$("saved-folder-name"),title=input.value.trim();
    if (!title||!store("savedChartFolders",[...folders(),{id:crypto.randomUUID(),title}])) return;
    input.value="";event.target.hidden=true;renderSavedList();
  };
  $("select-bench-rows").onclick=()=>{
    choosingRows=!choosingRows;
    selectedRows.clear();
    renderWorkbench();
  };
  $("merge-saved-charts").onclick=beginMerge;
  $("collection-charts").onchange=event=>{
    const input=event.target.closest("[data-merge-row]");
    if (!choosingRows||!input||input.disabled) return;
    if (input.checked) selectedRows.add(input.dataset.mergeRow);
    else selectedRows.delete(input.dataset.mergeRow);
    updateMergeButton();
  };
  $("collection-charts").onclick=event=>{
    const button=event.target.closest("button"),card=button&&getWorkbenchChart(button.closest("[data-chart]")?.dataset.chart);
    if (!card) return;
    if (button.hasAttribute("data-chart-remove")) {
      bench=bench.filter(chart=>chart!==card);
      for (const other of bench) if (other.row===card.row) delete other.weight;
    } else if (button.dataset.moveChart) bench=moveChartInRows(bench,card,Number(button.dataset.moveChart));
    else return;
    persistWorkbench();renderSavedCharts();
  };
}
