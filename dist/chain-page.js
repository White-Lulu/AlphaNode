import {pair,prefs,save} from "./i18n.js";
import {bindSearch,esc,link,options} from "./model.js";
import {categories,industries,refs as catalogRefs} from "./chain-data.js";
import {companies} from "./chain-companies.js";
import {disclosedSuppliers,directory,productExamples,recordedOwners,stageOwners,toolExamples} from "./chain-directory.js";
import {equipmentFor,equipmentUpstream} from "./chain-equipment.js";
import {originKind,upstreamRefs,withUpstream} from "./chain-upstream.js";
import {boundGraph,chainLayoutPreferences,graftEquipment,graphDefs,graphMarkup,makeGraph} from "./chain-graph.js";
import {bindChainSplitter,bindChainViewport,chainInspectorLimits} from "./chain-viewport.js";

const refs={...catalogRefs,...upstreamRefs};
const catalog=[...industries,...companies];
const byId=new Map(catalog.map(p=>[p.id,p]));
const label=text=>pair(...text.split("|"));
const ownerName=owner=>label(directory.get(owner)?.name??owner);
const typeName={
  material:"源材料／中间产物|Materials or intermediates",
  tool:"可重复使用的工具|Reusable tools",
  operation:"工具、人力与加工环节|Tools, labor and operations",
  consumption:"直接消费|Direct consumption",
};
const validIds=items=>Array.isArray(items)?[...new Set(items.filter(id=>byId.has(id)))].slice(0,8):["bread"];
const preference=prefs.chainExplorer??{};
const state={mode:preference.mode==="companies"?"companies":"industries",category:"",search:"",
  ids:validIds(preference.ids),full:preference.full===true,zoom:.8,node:null,company:"",branches:[],
  expanded:false,lightFirst:preference.lightFirst===true,
  catalogWidth:Number.isFinite(preference.catalogWidth)?preference.catalogWidth:null,
  inspectorWidth:Number.isFinite(preference.inspectorWidth)?preference.inspectorWidth:null,
  owned:preference.owned===true,...chainLayoutPreferences(preference)};
let page, graph, sections, shownPaths, nodeIds, nodesById, bridge, nextBranch=0, mapTitle="";
const get=id=>page.querySelector("#"+id);
const text=value=>esc(label(value));
const remember=()=>{
  prefs.chainExplorer={mode:state.mode,ids:state.ids,full:state.full,shared:state.shared,owned:state.owned,
    direction:state.direction,lightFirst:state.lightFirst,catalogWidth:state.catalogWidth,inspectorWidth:state.inspectorWidth};
  save();
};
document.addEventListener("chain-settings-change",()=>{
  const p=prefs.chainExplorer??{};
  Object.assign(state,chainLayoutPreferences(p));
  state.owned=p.owned===true;
  state.lightFirst=p.lightFirst===true;
  if (!page) return;
  renderMap(false);
  if (!page.hidden&&!state.node) moveDiagram(0,0);
});

const shell=()=>`
  <aside id="chain-catalog" class="chain-catalog panel">
    <div class="chain-modes" role="group" aria-label="${text("目录类型|Catalog type")}">
      <button type="button" data-chain-mode="industries" class="quiet">${text("行业路径|Industry paths")} <small>${industries.length}</small></button>
      <button type="button" data-chain-mode="companies" class="quiet">${text("代表企业|Companies")} <small>${companies.length}</small></button>
    </div>
    <div class="chain-filter">
      <input id="chain-search" type="search" autocomplete="off" placeholder="${text("搜索路径、企业或物料|Search pathways, companies or inputs")}" aria-label="${text("搜索产业链|Search value chains")}">
      <select id="chain-category" aria-label="${text("筛选行业领域|Filter by sector")}"></select>
    </div>
    <div id="chain-list" class="chain-list"></div>
  </aside>
  <span class="splitter chain-catalog-splitter" role="separator" tabindex="0" aria-orientation="vertical"
    data-resize="chain-catalog" aria-controls="chain-catalog" aria-label="${text("调整路径目录宽度|Resize pathway catalog")}"></span>
  <section id="chain-map" class="chain-map panel" aria-label="${text("产业链画布|Value chain canvas")}">
    <div class="chain-map-head">
      <div id="chain-active" class="table-context chain-active"></div>
      <button type="button" class="filter-help chain-help" aria-describedby="chain-help-note"
        aria-label="${text("产业链图谱说明|About the value chain atlas")}">?</button>
      <div id="chain-help-note" class="filter-note chain-help-note" role="tooltip">
        <ul>
          <li>${text("红色表示源材料和中间产物，蓝色表示工具和加工环节，灰色表示直接消费。红蓝深浅随节点在链中的层级变化。|Red marks materials and intermediates, blue marks tools and processing, and gray marks direct consumption. Red and blue shades vary with depth in the chain.")}</li>
          <li>${text("在「设置 → 产业链图谱 → 热力色顺序」可切换由深到浅或由浅到深。|Choose dark to light or light to dark under Settings → Value chain graph → Color order.")}</li>
          <li>${text("行业路径由本项目根据公开工艺资料和企业披露重新组织，按产品和生产场景归组。节点详情可查看出处。|The project organizes public process information and company disclosures into pathways grouped by product and production context. Node details link to sources.")}</li>
        </ul>
      </div>
    </div>
    <div class="chain-divider"></div>
    <div class="chain-canvas">
      <div id="chain-viewport" class="chain-viewport" role="region" tabindex="0" aria-label="${text("产业链关系图，可用滚轮或双指缩放，拖动平移|Value chain graph. Use the wheel or pinch to zoom, drag to pan")}">
        <div id="chain-space" class="chain-space"><svg id="chain-graph" xmlns="http://www.w3.org/2000/svg" role="group"></svg></div>
      </div>
      <div class="chain-float chain-float-zoom">
        <button type="button" class="quiet" data-chain-action="out" aria-label="${text("缩小|Zoom out")}">−</button>
        <button type="button" class="quiet" data-chain-action="in" aria-label="${text("放大|Zoom in")}">+</button>
        <button type="button" class="quiet" data-chain-action="fit">${text("适应|Fit")}</button>
        <button type="button" class="quiet chain-expand-map" data-chain-action="expand-map" aria-controls="chain-catalog">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path/></svg>
        </button>
      </div>
      <div class="chain-float chain-float-stack">
        <button type="button" class="quiet" data-chain-action="branches" aria-pressed="false">${text("展开工具链|Expand tool chains")}</button>
        <button type="button" class="quiet" data-chain-action="full">${text("全景|Overview")}</button>
      </div>
      <p id="chain-empty-canvas" class="chain-empty-canvas" hidden>${text("在左侧选择产业链即可查看图谱|Pick a pathway on the left to draw the graph")}</p>
    </div>
    <div class="chain-legend">
      <span><i class="chain-symbol material"></i>${text("源材料／中间产物|Materials / intermediates")}</span>
      <span><i class="chain-symbol tool"></i>${text("工具／人力|Tools / labor")}</span>
      <span><i class="chain-symbol consumption"></i>${text("直接消费|Direct consumption")}</span>
      <span><i class="chain-symbol support"></i>${text("工具支撑|Tool support")}</span>
      <span id="chain-equipment-key" hidden><i class="chain-symbol equipment"></i>${text("工具制造支链|Equipment manufacturing branch")}</span>
      <span><i class="chain-symbol alternative"></i>${text("替代方案|Alternatives")}</span>
      <span><i class="chain-symbol loop"></i>${text("再用／回收或跨链循环|Reuse, recycling or cross-chain loop")}</span>
      <p id="chain-meta" class="chain-muted"></p>
    </div>
  </section>
  <div id="chain-inspector" class="chain-inspector" hidden>
    <div id="chain-company-bar" class="chain-company-bar"></div>
    <aside id="chain-detail" class="chain-detail panel" aria-live="polite"></aside>
  </div>
  <span class="splitter chain-inspector-splitter" role="separator" tabindex="0" aria-orientation="vertical"
    data-chain-splitter="inspector" aria-controls="chain-inspector" aria-label="${text("调整详情面板宽度|Resize details panel")}"></span>`;

function renderCatalog() {
  const query=state.search.trim().toLocaleLowerCase();
  const subset=state.mode==="companies"?companies:industries;
  const matching=subset.filter(p=>(!state.category||p.category===state.category)&&(!query||
    [p.id,p.title,...withUpstream(p).steps.flatMap(s=>[s.output,s.tool,s.owner,...s.input])].some(v=>v.toLocaleLowerCase().includes(query))));
  get("chain-list").innerHTML=matching.map(p=>{
    const active=!state.full&&state.ids.includes(p.id), name=label(p.title);
    const caption='<strong>'+esc(name)+'</strong><small>'+text(categories[p.category])+'</small>';
    const toggle=text("加入或移出对照|Add or remove from comparison");
    const watched=p.company&&bridge?.watched?.(directory.get(p.id)?.tickers);
    const star=watched?'<span class="chain-watch" role="img" title="'+text("自选企业|Watchlist company")+'" aria-label="'+
      text("自选企业|Watchlist company")+'">★</span>':"";
    return '<div class="chain-list-row'+(active?" active":"")+'">'+
      '<button type="button" class="chain-pick" data-chain-pick="'+p.id+'" aria-pressed="'+active+'">'+caption+'</button>'+
      star+
      '<button type="button" class="quiet chain-add" data-chain-add="'+p.id+'" aria-pressed="'+active+
      '" aria-label="'+esc(name+' '+toggle)+'" title="'+toggle+'">'+(active?"✓":"＋")+'</button></div>';
  }).join("")||'<p class="chain-empty">'+text("没有匹配的路径。|No matching pathways.")+'</p>';
  for (const b of page.querySelectorAll("[data-chain-mode]")) b.setAttribute("aria-pressed",String(b.dataset.chainMode===state.mode));
  const category=get("chain-category");
  category.innerHTML=options([["",label("全部领域|All sectors")],...Object.entries(categories)
    .filter(([id])=>subset.some(p=>p.category===id)).map(([id,name])=>[id,label(name)])],state.category);
}

const list=items=>items.map(item=>'<li>'+item+'</li>').join("");
const sources=items=>list([...new Set(items)].filter(k=>refs[k]).map(k=>link(refs[k].url,label(refs[k].title))));
const companyButton=id=>'<button type="button" class="chain-text-button" data-chain-company="'+id+'">'+esc(ownerName(id))+'</button>';
const detailHeader=name=>'<div class="chain-detail-head"><h3>'+text(name)+'</h3><button type="button" class="quiet" data-chain-dismiss aria-label="'+
  text("关闭详情|Close details")+'">×</button></div>';
const drillButton=node=>'<button type="button" class="quiet" data-chain-open-branch="'+nodeIds.get(node.key)+'">'+
  text(openBranch(node)?"收起工具支链|Collapse equipment pathway":"展开工具支链|Explore equipment pathway")+'</button>';
const openBranch=node=>state.branches.find(b=>b.nodeKey===node.key);
function recipeFor(node) {
  const section=sections.get(node.scope);
  if (!section) return null;
  const recipe=equipmentFor(node,section.recipe?.id);
  return recipe&&!section.ancestors.includes(recipe.id)?recipe:null;
}

function companySummary(id) {
  const p=directory.get(id), detail=get("chain-detail");
  const count=[...graph.nodes.values()].filter(n=>n.owners.has(id)).length;
  const note=p.privateCompany?"未上市企业资料|Privately held company profile":
    "企业公开资料|Company overview from public sources";
  const entries=p.path?.steps.filter(stage=>stage.owner===id)??[];
  const action=p.path?'<button type="button" class="quiet" data-chain-pick="'+id+'">'+text("查看企业产业链|Open company pathway")+'</button>':"";
  get("chain-company-bar").innerHTML=action;
  detail.innerHTML=detailHeader(p.name)+
    '<p class="chain-kind">'+text(note)+(p.tickers.length?' · '+esc(p.tickers[0]):"")+'</p>'+
    (p.about?'<p>'+text(p.about)+'</p>':"")+
    '<p class="chain-muted">'+esc(pair("当前图谱已标出 "+count+" 个相关节点。",count+" related nodes are highlighted."))+'</p>'+
    (entries.length?'<h4>'+text("企业活动|Company operations")+'</h4><ul>'+list(entries.map(s=>text(s.tool)))+'</ul>':"")+
    (p.website?'<p>'+link(p.website,label("企业官网|Company website"))+'</p>':"")+
    '<h4>'+text("企业出处|Company sources")+'</h4><ul>'+sources(p.sources)+'</ul>'+
    (action?'<p>'+action+'</p>':"");
}

function refreshDetail() {
  const node=graph.nodes.get(state.node);
  get("chain-inspector").hidden=!state.company&&!node;
  if (state.company) {companySummary(state.company);return;}
  get("chain-company-bar").replaceChildren();
  if (!node) {
    get("chain-detail").replaceChildren();
    return;
  }
  const keys=new Set();
  const inEdges=graph.links.filter(e=>e.to===node), outEdges=graph.links.filter(e=>e.from===node);
  const contexts=[...new Map([...sections.values()].flatMap(s=>s.paths)
    .filter(p=>node.paths.has(p.id)).map(p=>[p.id,p])).values()];
  const suppliers=disclosedSuppliers(contexts,node.identity);
  const declared=[...new Set(node.stages.flatMap(recordedOwners))];
  const related=new Set([...node.owners,...productExamples(node.identity),...toolExamples(node.label)]);
  for (const edge of outEdges) for (const id of edge.to.owners) related.add(id);
  for (const id of [...declared,...suppliers.map(s=>s.id)]) related.delete(id);
  const fallback=[...new Set(graph.links.filter(e=>e.to.scope===node.scope&&node.paths.has([...e.to.paths][0])).flatMap(e=>[...e.to.owners]))];
  const reps=related.size?[...related]:fallback.filter(id=>!declared.includes(id));
  const repHTML='<h4>'+text("代表企业|Representative companies")+'</h4>'+
    (suppliers.length?'<div class="chain-evidence"><strong>'+text("已披露供应或合作|Disclosed supply or partnership")+'</strong><ul>'+
      list(suppliers.map(({id,ref})=>companyButton(id)+' · '+link(ref.url,label(ref.title))))+'</ul></div>':"")+
    (declared.length?'<p>'+declared.map(companyButton).join(" · ")+'</p>':"")+
    (reps.length?'<p class="chain-kind">'+text(related.size?"参与或同类业务示例|Participants or role examples":
      "同路径企业示例|Related pathway companies")+'</p><p>'+reps.slice(0,6).map(companyButton).join(" · ")+'</p>':"")+
    (contexts.some(p=>p.company)&&!suppliers.length&&!inEdges.length?
      '<p class="chain-muted">'+text("具体供应方：—|Specific supplier: —")+'</p>':"");
  const edgeList=(edges,field)=>list(edges.map(e=>{
    const n=e[field];
    return '<button type="button" class="chain-text-button" data-chain-focus="'+nodeIds.get(n.key)+'">'+text(n.label)+'</button>';
  }));
  const stages=node.stages.filter(stage=>{
    const key=[stage.owner,stage.source,stage.note].join("|");
    if (keys.has(key)) return false;
    keys.add(key);return true;
  });
  const evidence=stages.map(s=>{
    const ref=refs[s.source], name=s.owner?ownerName(s.owner):label("行业通用环节|Typical industry step");
    const related=s.owner&&byId.has(s.owner)&&!state.ids.includes(s.owner)?'<button type="button" class="chain-text-button" data-chain-pick="'+s.owner+'">'+
      text("打开企业图谱|Open company pathway")+'</button>':"";
    return '<section class="chain-evidence"><strong>'+esc(name)+'</strong>'+
      (s.note?'<p>'+text(s.note)+'</p>':"")+
      (s.alternatives?'<p>'+text("入线表示备选方案，随产品而变。|Incoming branches are alternatives and depend on the product.")+'</p>':"")+
      (ref?'<div>'+link(ref.url,label(ref.title))+'</div>':"")+related+'</section>';
  }).join("");
  const kind=inEdges.length?typeName[node.type]:originKind(node.identity,state.owned&&contexts.some(p=>p.company));
  get("chain-detail").innerHTML=detailHeader(node.label)+'<p class="chain-kind">'+text(kind)+'</p>'+
    (recipeFor(node)?drillButton(node):"")+
    repHTML+
    (evidence||'<p class="chain-muted">'+text("该投入未标明具体供应方。|No specific supplier is assigned to this input.")+'</p>')+
    (inEdges.length?'<h4>'+text("上游投入|Upstream inputs")+'</h4><ul>'+edgeList(inEdges,"from")+'</ul>':"")+
    (outEdges.length?'<h4>'+text("下游去向|Downstream uses")+'</h4><ul>'+edgeList(outEdges,"to")+'</ul>':"")+
    '<details><summary>'+text("相关路径与出处|Related paths and sources")+'</summary><ul>'+list(contexts.map(p=>text(p.title)+(p.note?'<p>'+text(p.note)+'</p>':"")))+
    '</ul><ul>'+sources(contexts.flatMap(p=>p.sources))+'</ul></details>';
}

const svg=()=>get("chain-graph");
const viewport=()=>get("chain-viewport");
const diagramPosition=()=>{
  const vp=viewport(), layer=get("chain-space"), style=getComputedStyle(layer);
  return [vp.scrollLeft-parseFloat(style.paddingLeft),vp.scrollTop-parseFloat(style.paddingTop)];
};
function moveDiagram(x,y) {
  const style=getComputedStyle(get("chain-space"));
  viewport().scrollTo(x+parseFloat(style.paddingLeft),y+parseFloat(style.paddingTop));
}
const catalogLimits=()=>({min:170,max:Math.max(170,Math.min(420,page.clientWidth*.45))});
const inspectorLimits=()=>chainInspectorLimits(page);
const clampWidth=(value,{min,max})=>Math.round(Math.max(min,Math.min(max,value)));
function setPanelWidth(property,width) {
  if (width===null) page.style.removeProperty(property);
  else page.style.setProperty(property,width+"px");
}
function applyCatalogWidth(value) {
  state.catalogWidth=value===null?null:clampWidth(value,catalogLimits());
  setPanelWidth("--chain-catalog-width",state.catalogWidth);
}
function applyInspectorWidth(value) {
  state.inspectorWidth=value===null?null:clampWidth(value,inspectorLimits());
  setPanelWidth("--chain-inspector-width",state.inspectorWidth);
}
function bindSplitters() {
  bindChainSplitter(page.querySelector(".chain-catalog-splitter"),{
    limits:catalogLimits,apply:applyCatalogWidth,remember,
    value:()=>state.catalogWidth??get("chain-catalog").getBoundingClientRect().width});
  bindChainSplitter(page.querySelector(".chain-inspector-splitter"),{
    limits:inspectorLimits,apply:applyInspectorWidth,remember,direction:-1,
    value:()=>state.inspectorWidth??get("chain-inspector").getBoundingClientRect().width});
}

function syncMapExpansion() {  const expanded=state.expanded, button=page.querySelector('[data-chain-action="expand-map"]');
  const name=label(expanded?"恢复路径目录|Restore pathway catalog":"扩展画布|Expand graph");
  page.toggleAttribute("data-map-expanded",expanded);
  get("chain-catalog").hidden=expanded;
  button.setAttribute("aria-expanded",String(!expanded));
  button.setAttribute("aria-label",name);
  button.title=name;
  button.querySelector("path").setAttribute("d",expanded?"M6 2v4H2m8-4v4h4M6 14v-4H2m8 4v-4h4":"M6 2H2v4m8-4h4v4M6 14H2v-4m8 4h4v-4");
}
function renderCanvas() {
  const canvas=svg();
  canvas.innerHTML='<title>'+esc(mapTitle)+'</title>'+graphDefs()+graphMarkup(graph,label,ownerName,esc,graph.nodes.get(state.node),nodeIds,{
    company:state.company,recipes:recipeFor,expanded:openBranch,showOwnership:!state.owned,lightFirst:state.lightFirst});
  canvas.setAttribute("aria-label",mapTitle);
  canvas.setAttribute("viewBox","0 0 "+graph.width+" "+graph.height);
  const position=diagramPosition(), inspector=get("chain-inspector");
  const wasHidden=inspector.hidden;
  refreshDetail();
  if (wasHidden!==inspector.hidden) moveDiagram(...position);
}
function setZoom(value, origin=null, target=origin) {
  const before=state.zoom;
  const [left,top]=origin?diagramPosition():[0,0];
  state.zoom=Math.max(.06,Math.min(1.65,value));
  svg().setAttribute("width",Math.round(graph.width*state.zoom));
  svg().setAttribute("height",Math.round(graph.height*state.zoom));
  if (origin) {
    const ratio=state.zoom/before;
    moveDiagram((left+origin.x)*ratio-target.x,(top+origin.y)*ratio-target.y);
  }
}
function fit() {
  const vp=viewport();
  setZoom(Math.min(vp.clientWidth/graph.width,vp.clientHeight/graph.height,1));
  moveDiagram((graph.width*state.zoom-vp.clientWidth)/2,(graph.height*state.zoom-vp.clientHeight)/2);
}
function renderMap(reset=true) {
  const prior=graph?.nodes.get(state.node);
  const picked=state.full?industries:state.ids.map(id=>byId.get(id));
  shownPaths=picked.map(p=>p.company&&state.owned?{...p,steps:p.steps.filter(s=>s.owner===p.id)}:withUpstream(p));
  const make=(paths,scope="",parallel=false)=>makeGraph(paths,{shared:state.shared,direction:state.direction,scope,parallel,stageOwners,
    itemOwners:(item,context)=>[...productExamples(item),...disclosedSuppliers([context],item).map(s=>s.id)]});
  graph=make(shownPaths,"",state.owned&&picked.some(p=>p.company));
  sections=new Map([["",{nodes:new Map(graph.nodes),paths:shownPaths,ancestors:[]}]]);
  const kept=[];
  for (const entry of state.branches) {
    const parent=sections.get(entry.parent);
    const parentNode=parent?.nodes.get(entry.nodeKey)??[...parent?.nodes.values()??[]].find(n=>n.identity===entry.identity);
    if (!parentNode||kept.some(b=>b.nodeKey===parentNode.key)) continue;
    entry.nodeKey=parentNode.key;
    kept.push(entry);
    const [path,output]=equipmentUpstream(entry.recipe,parentNode), paths=[withUpstream(path)], part=make(paths,entry.id);
    graftEquipment(graph,part,parentNode,output,state.shared);
    sections.set(entry.id,{nodes:part.nodes,recipe:entry.recipe,paths,ancestors:[...parent.ancestors,entry.recipe.id]});
  }
  state.branches=kept;
  if (kept.length) boundGraph(graph);
  get("chain-equipment-key").hidden=!kept.length;
  nodeIds=new Map([...graph.nodes.keys()].map((key,i)=>[key,i]));
  nodesById=[...graph.nodes.values()];
  if (reset) state.node=null;
  else if (!graph.nodes.has(state.node)) state.node=[...graph.nodes.values()].find(n=>n.scope===prior?.scope&&n.identity===prior.identity)?.key??null;
  mapTitle=label(state.full?"产业链全景|Industry network":shownPaths.length>1?
    "多产业链对照|Value chain comparison":shownPaths[0]?.title??"请选择产业链|Select pathways");
  const count=shownPaths.length+kept.length;
  get("chain-meta").textContent=pair(count+" 条路径 · "+graph.nodes.size+" 个节点",
    count+(count===1?" pathway · ":" pathways · ")+graph.nodes.size+" nodes");
  get("chain-active").innerHTML=state.full?"":shownPaths.map(p=>'<button type="button" data-chain-path="'+
    p.id+'" title="'+text("定位到这条路径|Jump to this pathway")+'">'+text(p.title)+'</button>').join("");
  get("chain-empty-canvas").hidden=graph.nodes.size>0;
  page.querySelector('[data-chain-action="full"]').setAttribute("aria-pressed",String(state.full));
  const all=page.querySelector('[data-chain-action="branches"]'), open=kept.length>0;
  all.setAttribute("aria-pressed",String(open));
  all.textContent=label(open?"收起工具链|Collapse tool chains":"展开工具链|Expand tool chains");
  renderCanvas();
  if (reset&&state.full) fit();
  else if (reset) {
    setZoom(.8);
    const v=viewport();
    moveDiagram(0,Math.max(0,(graph.height*state.zoom-v.clientHeight)/2));
  } else setZoom(state.zoom);
}
function clearCompany() {
  if (!state.company) return;
  bridge.closeProfile();
  state.company="";
}
function focusCompany(id,trigger) {
  clearCompany();
  state.company=id;
  renderCanvas();
  const position=diagramPosition();
  if (bridge.showChainCompany(directory.get(id).tickers,trigger)) moveDiagram(...position);
  if (matchMedia("(max-width:700px)").matches) get("chain-inspector").scrollIntoView({block:"nearest"});
}
function expandTool(id) {
  const node=nodesById[Number(id)];
  const recipe=node&&recipeFor(node);
  if (!recipe) return;
  clearCompany();
  const existing=openBranch(node);
  const opened=existing?null:String(++nextBranch);
  if (existing) foldBranch(existing.id);
  else state.branches.push({id:opened,parent:node.scope,identity:node.identity,nodeKey:node.key,recipe});
  const vp=viewport(), [left,top]=diagramPosition();
  state.node=node.key;
  renderMap(false);
  const anchor=graph.nodes.get(state.node);
  const join=opened&&graph.links.find(e=>e.type==="equipment"&&e.to===anchor&&e.from.scope===opened);
  const keepVisible=(scroll,axis,size)=>{
    const keep=scroll+(anchor[axis]-node[axis])*state.zoom;
    if (!join) return keep;
    const low=Math.min(anchor[axis],join.from[axis])*state.zoom-10;
    const high=(Math.max(anchor[axis],join.from[axis])+(axis==="x"?236:110))*state.zoom+10-size;
    return high>low?(high+low)/2:Math.min(low,Math.max(high,keep));
  };
  moveDiagram(keepVisible(left,"x",vp.clientWidth),keepVisible(top,"y",vp.clientHeight));
}
function focusPath(id) {
  const others=shownPaths.filter(p=>p.id!==id).map(p=>p.id);
  const own=[...graph.nodes.values()].filter(n=>n.paths.has(id));
  const distinct=own.filter(n=>!others.some(o=>n.paths.has(o)));
  const nodes=distinct.length?distinct:own;
  if (!nodes.length) return;
  const left=Math.min(...nodes.map(n=>n.x)), top=Math.min(...nodes.map(n=>n.y));
  const right=Math.max(...nodes.map(n=>n.x))+236, bottom=Math.max(...nodes.map(n=>n.y))+116;
  const vp=viewport();
  moveDiagram((left+right)/2*state.zoom-vp.clientWidth/2,(top+bottom)/2*state.zoom-vp.clientHeight/2);
}
function toggleAllBranches() {
  clearCompany();
  if (state.branches.length) state.branches=[];
  else {
    const used=new Set();
    for (const node of sections.get("").nodes.values()) {
      const recipe=recipeFor(node);
      if (!recipe||used.has(recipe.id)) continue;
      used.add(recipe.id);
      state.branches.push({id:String(++nextBranch),parent:"",identity:node.identity,nodeKey:node.key,recipe});
    }
  }
  state.node=null;
  renderMap(false);
  const vp=viewport();
  if (state.branches.length) fit();
  else moveDiagram(0,Math.max(0,(graph.height*state.zoom-vp.clientHeight)/2));
}
function foldBranch(id) {
  const removed=new Set([id]);
  state.branches=state.branches.filter(entry=>{
    if (!removed.has(entry.id)&&!removed.has(entry.parent)) return true;
    removed.add(entry.id);return false;
  });
}
function focusNode(id, move=false, keyboard=false) {
  const node=nodesById[Number(id)];
  if (!node) return;
  clearCompany();
  state.node=node.key;
  renderCanvas();
  const element=svg().querySelector('[data-chain-node="'+id+'"]');
  if (state.zoom<.45) {setZoom(.8);move=true;}
  if (move) {
    const vp=viewport();
    moveDiagram((node.x+115)*state.zoom-vp.clientWidth/2,(node.y+45)*state.zoom-vp.clientHeight/2);
  }
  if (keyboard) element.focus({preventScroll:true});
  else if (matchMedia("(max-width:700px)").matches) get("chain-inspector").scrollIntoView({block:"nearest"});
}

function bindControls() {
  bindSearch(get("chain-search"),value=>{state.search=value;},renderCatalog);
  get("chain-category").onchange=e=>{state.category=e.target.value;renderCatalog();};
  const applyPaths=()=>{
    clearCompany();state.branches=[];remember();renderCatalog();renderMap();
  };
  const setPath=(id,checked)=>{
    if (checked&&state.ids.length>=8) {
      get("chain-meta").textContent=label("对照最多 8 条路径。|Comparison supports up to 8 pathways.");
      return false;
    }
    state.ids=checked?[...state.ids,id]:state.ids.filter(x=>x!==id);
    state.full=false;
    applyPaths();
    return true;
  };
  page.onclick=e=>{
    const button=e.target.closest("button");
    const pressedMode=button?.dataset.chainMode;
    if (pressedMode) {
      state.mode=pressedMode;
      state.category="";
      renderCatalog();
      remember();
      return;
    }
    const {chainPick,chainAdd,chainPath,chainAction,chainFocus,chainCompany,chainOpenBranch}=button?.dataset??{};
    if (chainPath!==undefined) {focusPath(chainPath);return;}
    if (chainCompany&&directory.has(chainCompany)) {
      focusCompany(chainCompany,button);
      return;
    }
    if (button?.hasAttribute("data-chain-dismiss")) {dismissDetail();return;}
    const drill=e.target.closest("[data-chain-drill]");
    if (drill||chainOpenBranch!==undefined) {expandTool(drill?.dataset.chainDrill??chainOpenBranch);return;}
    if (chainFocus!==undefined) {focusNode(chainFocus,true,true);return;}
    const node=e.target.closest("[data-chain-node]");
    if (node) {focusNode(node.dataset.chainNode,false,e.detail===0);return;}
    if (chainAction==="expand-map") {
      const position=diagramPosition();
      state.expanded=!state.expanded;
      syncMapExpansion();
      moveDiagram(...position);
      return;
    }
    if (chainAction==="branches") {toggleAllBranches();return;}
    if (chainAction==="fit") {fit();return;}
    if (chainAction==="out"||chainAction==="in") {
      const v=viewport();
      setZoom(state.zoom*(chainAction==="in"?1.2:1/1.2),{x:v.clientWidth/2,y:v.clientHeight/2});
      return;
    }
    if (chainAction==="full") state.full=!state.full;
    else if (chainPick) {
      state.ids=[chainPick];state.full=false;
    } else if (chainAdd) {
      if (state.full) {state.ids=[chainAdd];state.full=false;applyPaths();return;}
      setPath(chainAdd,!state.ids.includes(chainAdd));
      return;
    } else return;
    applyPaths();
    if (chainPick&&directory.has(chainPick)) focusCompany(chainPick,page.querySelector('[data-chain-pick="'+chainPick+'"]')??button);
  };
  svg().onkeydown=e=>{
    if (!["Enter"," "].includes(e.key)) return;
    const node=e.target.closest("[data-chain-node]");
    if (!node) return;
    e.preventDefault();
    focusNode(node.dataset.chainNode,false,true);
  };
  bindChainViewport(viewport(),(factor,origin,target)=>setZoom(state.zoom*factor,origin,target));
}

function dismissDetail() {
  const id=nodeIds.get(state.node);
  const company=state.company;
  clearCompany();
  state.node=null;
  renderCanvas();
  (svg().querySelector('[data-chain-node="'+id+'"]')??
    get("chain-list").querySelector('[data-chain-pick="'+company+'"]')??viewport()).focus({preventScroll:true});
}

export function renderChainPage(element, relocalize=false, callbacks) {
  bridge=callbacks;
  if (page&&!relocalize) {renderCatalog();return;}
  const previous=page?diagramPosition():null;
  const listTop=page?get("chain-list").scrollTop:0;
  const panel=element.querySelector("#profile-panel");
  panel?.remove();
  page=element;
  page.innerHTML=shell();
  if (panel) get("chain-inspector").append(panel);
  page.addEventListener("chain-profile-close",dismissDetail);
  syncMapExpansion();
  applyCatalogWidth(state.catalogWidth);
  applyInspectorWidth(state.inspectorWidth);
  bindSplitters();
  get("chain-search").value=state.search;
  bindControls();
  renderCatalog();
  renderMap(!previous);
  if (previous) moveDiagram(...previous);
  get("chain-list").scrollTop=listTop;
}
