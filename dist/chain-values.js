import {pair,prefs,save,scopeLabel,nameOf,locale} from "./i18n.js";
import {annual,esc,finite,format,heatColor,heatExtent,options,unitLabel} from "./model.js";
import {metricLabel} from "./glossary.js";
import {valueNetwork} from "./chain-value-network.js";
import {chainLayoutPreferences,graphDefs,graphMarkup} from "./chain-graph.js";
import {bindChainSplitter,bindChainViewport,chainInspectorLimits} from "./chain-viewport.js";

const serviceId="ef-services";
const serviceOrder=["utilities","property","logistics","it","platforms","business","health","finance"];
const scopes=["world","cn","ex"];
const levels=[[1,"一级行业","Level 1"],[2,"二级行业","Level 2"],[3,"三级行业","Level 3"]];
const text=(zh,en)=>esc(pair(zh,en));
let refreshLayout;
document.addEventListener("chain-settings-change",()=>refreshLayout?.());

export function renderChainValues(host,meta,data) {
  if (host.dataset.language===prefs.language) {refreshLayout?.();return;}
  const saved=prefs.chainValues??{};
  const state={
    level:levels.some(([id])=>id===saved.level)?saved.level:2,
    metric:meta.finColumns.includes(saved.metric)?saved.metric:"revenue",
    year:meta.years.includes(saved.year)?saved.year:meta.years.at(-1),
    scope:scopes.includes(saved.scope)?saved.scope:"world",
    inspectorWidth:Number.isFinite(saved.inspectorWidth)?saved.inspectorWidth:null,
  };
  let direction=chainLayoutPreferences(prefs.chainExplorer).direction;
  let graph, nodes, nodeIds, bounds, values, unit, edgeElements, lineLayer, raisedLines, zoom=1, selected=null;
  const layouts=new Map();
  const rows=data.taxonomy.map(row=>({...row,kind:"industry",agg:data.aggregates[row.id]}));
  const byId=new Map(rows.map(row=>[row.id,row])), children=new Map();
  for (const row of rows) {
    if (!children.has(row.parent)) children.set(row.parent,[]);
    children.get(row.parent).push(row);
  }
  const subgroups=serviceOrder.map(id=>byId.get("ef-service-"+id));
  const services=new Set([serviceId,...subgroups.flatMap(row=>[row.id,...(children.get(row.id)??[]).map(child=>child.id)])]);
  const select=(key,caption,entries)=>'<label class="control"><span>'+caption+'</span><select id="chain-values-'+key+
    '" name="'+key+'">'+options(entries.map(([id,name])=>[String(id),name]),String(state[key]))+'</select></label>';
  host.innerHTML='<div class="chain-map panel"><div class="value-controls">'+
    select("level",text("行业层级","Industry level"),levels.map(([id,zh,en])=>[id,pair(zh,en)]))+
    select("metric",text("指标","Metric"),meta.finColumns.map(key=>[key,metricLabel(key,meta)]))+
    select("year",text("观察年度","Observation year"),[...meta.years].reverse().map(y=>[y,pair(y+" 年",String(y))]))+
    select("scope",text("地区","Region"),scopes.map(id=>[id,scopeLabel(id)]))+
    '<span class="value-method">'+text("加总／加权","Sum / weighted")+'</span>'+
    '<button type="button" class="filter-help chain-help" aria-describedby="value-help-note" aria-label="'+
    text("数值图谱说明","About the metrics atlas")+'">?</button>'+
    '<div id="value-help-note" class="filter-note chain-help-note" role="tooltip"><ul><li>'+
    text("热力色按当前指标数值从低到高排列，低值偏蓝，高值偏红。","Heat colors follow the selected metric, from blue for lower values to red for higher values.")+
    '</li><li>'+text("行业层级沿用全球行业数据图谱中「行业财务」的「产业链功能」分类。","Industry levels follow the Economic function classification under Industry Financials in the Industry Data Atlas.")+
    '</li><li>'+text("默认展开所选层级的全部行业。","All industries at the selected level are expanded by default.")+
    '</li><li>'+text("数值图谱仅共用「设置 → 产业链图谱 → 布局」，可选自适应、横向或纵向。","Layout is the only shared setting under Settings → Value chain graph. Choose Adaptive, Horizontal, or Vertical.")+'</li></ul></div></div>'+
    '<div class="chain-canvas"><div class="chain-viewport value-viewport" tabindex="0" role="region" aria-label="'+
    text("产业链数值图。拖动平移，滚轮或双指缩放。","Value chain metrics graph. Drag to pan. Use the wheel or pinch to zoom.")+
    '"><div class="chain-space"><svg class="value-svg" role="group"></svg></div></div>'+
    '<div class="chain-float chain-float-zoom" role="group" aria-label="'+text("缩放画布","Zoom controls")+'">'+
    '<button type="button" class="quiet" data-value-zoom="out" aria-label="'+text("缩小","Zoom out")+'">−</button>'+
    '<button type="button" class="quiet" data-value-zoom="in" aria-label="'+text("放大","Zoom in")+'">+</button>'+
    '<button type="button" class="quiet" data-value-zoom="fit">'+text("适应","Fit")+'</button></div></div></div>'+
    '<span class="splitter chain-inspector-splitter value-inspector-splitter" role="separator" tabindex="0" aria-orientation="vertical"'+
    ' aria-controls="value-inspector" aria-label="'+text("调整详情面板宽度","Resize details panel")+'"></span>'+
    '<aside id="value-inspector" class="value-inspector chain-detail panel" aria-live="polite" hidden></aside>';
  const viewport=host.querySelector(".value-viewport"), layer=viewport.firstElementChild;
  const svg=layer.firstElementChild, detail=host.querySelector(".value-inspector");
  const padding=()=>{const css=getComputedStyle(layer);return [parseFloat(css.paddingLeft),parseFloat(css.paddingTop)];};
  const position=()=>{const [x,y]=padding();return [viewport.scrollLeft-x,viewport.scrollTop-y];};
  const move=(left,top)=>{const [x,y]=padding();viewport.scrollTo(left+x,top+y);};
  const remember=()=>{prefs.chainValues={...state};save();};
  const limits=()=>chainInspectorLimits(host);
  const setInspectorWidth=()=>host.style.setProperty("--chain-inspector-width",state.inspectorWidth===null?"":state.inspectorWidth+"px");
  setInspectorWidth();
  const describeSplitter=bindChainSplitter(host.querySelector(".value-inspector-splitter"),{
    limits,remember,direction:-1,value:()=>detail.getBoundingClientRect().width,
    apply:width=>{
      const held=position(), {min,max}=limits();
      state.inspectorWidth=width===null?null:Math.round(Math.max(min,Math.min(max,width)));
      setInspectorWidth();
      move(...held);
    },
  });
  function setZoom(value,origin,target=origin) {
    const before=zoom, [left,top]=origin?position():[0,0];
    zoom=Math.max(.06,Math.min(1.65,value));
    svg.setAttribute("width",Math.round(bounds.width*zoom));
    svg.setAttribute("height",Math.round(bounds.height*zoom));
    if (origin) move((left+origin.x)*zoom/before-target.x,(top+origin.y)*zoom/before-target.y);
  }
  function center(x,y) {
    move(x*zoom-viewport.clientWidth/2,y*zoom-viewport.clientHeight/2);
  }
  function fit() {
    setZoom(Math.min(viewport.clientWidth/bounds.width,viewport.clientHeight/bounds.height,1));
    center(bounds.width/2,bounds.height/2);
  }
  const displayValue=id=>format(values.get(id),state.metric,"level",meta);
  const formatValue=id=>esc(displayValue(id));
  const sampleLabel=row=>{
    const count=row.agg?.[state.scope]?.[state.year]?.counts?.[state.metric]?.[0];
    if (!Number.isFinite(count)) return "";
    const n=count.toLocaleString(locale());
    return text(n+" 家样本企业",n+" companies in the sample");
  };
  const industryName=id=>nameOf(byId.get(id));
  const tint=(value,range)=>heatColor(value,range,false,"var(--surface)")||"var(--surface)";

  function renderServiceFrames() {
    const {level}=state;
    const frames=level===1?[byId.get(serviceId)]:level===2?subgroups:subgroups.flatMap(row=>children.get(row.id)??[]);
    const compared=level===1?[...values.values()]:frames.map(row=>values.get(row.id));
    const range=heatExtent(compared.filter(finite));
    const [dx,dy,font]=level===1?[14,40,14]:level===2?[14,49,20]:[8,22,13];
    const labelLeft=level===2?20:13;
    bounds={x:frames.length*dx,y:frames.length*dy,width:graph.width+2*frames.length*dx,height:graph.height+2*frames.length*dy};
    const rect=(x,y,fill)=>'<rect x="'+x+'" y="'+y+'" width="'+(bounds.width-2*x)+
      '" height="'+(bounds.height-2*y)+'" rx="3" fill="'+fill+'"/>';
    const markup=frames.map((row,i)=>{
      const label=formatValue(row.id);
      const name=esc(nameOf(row)), x=i*dx+1, y=i*dy+1;
      return '<g class="value-service-frame" data-industry="'+row.id+'">'+
        '<title>'+name+' · '+label+'</title>'+
        rect(x,y,tint(values.get(row.id),range))+
        '<text x="'+(x+labelLeft)+'" y="'+(y+dy/2)+'" dominant-baseline="central" font-size="'+font+'">'+name+' · '+
        '<tspan class="value-number">'+label+'</tspan></text></g>';
    }).join("");
    return '<g class="value-service-frames">'+markup+rect(bounds.x+1,bounds.y+1,"var(--surface)")+'</g>';
  }
  function draw(reset) {
    const {level,metric,year,scope}=state;
    if (!layouts.has(level)) layouts.set(level,valueNetwork(level,rows,direction));
    graph=layouts.get(level);
    nodes=[...graph.nodes.values()];
    nodeIds=new Map(nodes.map((node,i)=>[node.key,i]));
    values=new Map(rows.filter(row=>row.level===level).map(row=>[row.id,annual(row,metric,year,scope,"sum")]));
    unit=unitLabel(metric,"level",meta);
    const mainRange=heatExtent([...values].filter(([id,value])=>!services.has(id)&&finite(value)).map(([,value])=>value));
    const frames=renderServiceFrames();
    svg.setAttribute("viewBox","0 0 "+bounds.width+" "+bounds.height);
    svg.innerHTML='<title>'+text("产业链数值图谱","Value Chain Metrics")+'</title>'+graphDefs("value-arrow")+frames+
      '<g transform="translate('+bounds.x+' '+bounds.y+')">'+
      graphMarkup(graph,industryName,()=>"",esc,null,nodeIds,{arrow:"value-arrow",layered:true,annotate:node=>({
        value:displayValue(node.label),tint:tint(values.get(node.label),mainRange),
        note:node.type==="operation"?pair(...node.stages[0].note.split("|")):"",
      })})+'</g>';
    lineLayer=svg.querySelector(".chain-lines");
    raisedLines=svg.querySelector(".chain-raised-lines");
    edgeElements=[...lineLayer.children];
    highlight();
    if (reset) fit();
  }

  function highlight() {
    const original=position();
    const picked=selected?.label;
    const activeNodes=new Set(nodes.filter(node=>node.label===picked));
    const neighbors=new Set(activeNodes);
    for (const [i,{from,to}] of graph.links.entries()) {
      const active=activeNodes.has(from)||activeNodes.has(to);
      const element=edgeElements[i], layer=active?raisedLines:lineLayer;
      element.classList.toggle("is-highlighted",active);
      if (element.parentNode!==layer) layer.append(element);
      if (active) {neighbors.add(from);neighbors.add(to);}
    }
    for (const [i,element] of svg.querySelectorAll("[data-chain-node]").entries()) {
      const node=nodes[i], active=activeNodes.has(node);
      element.classList.toggle("is-selected",active);
      element.classList.toggle("is-neighbor",!active&&neighbors.has(node));
      element.classList.toggle("is-dimmed",Boolean(selected)&&!neighbors.has(node));
      element.setAttribute("aria-pressed",String(active));
    }
    const wasHidden=detail.hidden;
    detail.hidden=!selected;
    if (selected) {
      const row=byId.get(picked), sample=sampleLabel(row);
      const icon=node=>node===selected?esc(industryName(node.label)):
        '<button type="button" class="chain-text-button" data-value-focus="'+nodeIds.get(node.key)+'">'+esc(industryName(node.label))+'</button>';
      const related=new Map();
      for (const node of nodes) {
        if (node.type!=="operation") continue;
        for (const step of node.stages) {
          if (node.label===picked||step.outputNode.label===picked||step.inputNodes.some(item=>item.label===picked)) {
            if (!related.has(step.note)||step.outputNode===selected||step.inputNodes.includes(selected)) related.set(step.note,{step,node});
          }
        }
      }
      const list=[...related.values()].sort((a,b)=>Number(b.node===selected)-Number(a.node===selected));
      const outlet=output=>{
        const tools=graph.toolTargets.get(output.key);
        return tools?(tools.includes(selected)?selected:tools[0]):output;
      };
      const steps=list.map(({step:{inputNodes,outputNode,note},node})=>'<li><strong>'+text(...note.split("|"))+'</strong>'+
        '<div>'+inputNodes.map(icon).join(" + ")+' → '+icon(outlet(outputNode))+'</div>'+
        '<div class="chain-kind">△ '+icon(node)+'</div></li>').join("");
      const metric=state.metric, hasUnit=finite(values.get(picked))&&!["pct","pp"].includes(meta.metrics[metric][1]);
      detail.innerHTML='<div class="chain-detail-head"><h3>'+esc(nameOf(row))+'</h3><button type="button" class="quiet" data-value-close aria-label="'+
        text("关闭详情","Close details")+'">×</button></div><p>'+esc(metricLabel(metric,meta))+' · <strong class="value-number">'+
        formatValue(picked)+'</strong>'+(hasUnit?' '+esc(unit):"")+'</p>'+
        (sample?'<p class="chain-muted">'+sample+'</p>':"")+
        '<h4>'+text("相关加工与用途","Related stages and uses")+'</h4><ul class="value-steps">'+steps+'</ul>';
    } else detail.replaceChildren();
    if (wasHidden!==detail.hidden) {
      move(...original);
      if (selected) describeSplitter();
    }
  }
  function focus(node,moveTo=false) {
    selected=node;
    highlight();
    if (moveTo) center(node.x+bounds.x+118,node.y+bounds.y+45);
    if (node&&matchMedia("(max-width:700px)").matches) detail.scrollIntoView({block:"nearest"});
  }
  bindChainViewport(viewport,(factor,origin,target)=>setZoom(zoom*factor,origin,target));
  host.onclick=event=>{
    const btn=event.target.closest("button"), key=btn?.dataset;
    if (key?.valueZoom==="fit") {fit();return;}
    if (key?.valueZoom) {
      setZoom(zoom*(key.valueZoom==="in"?1.2:1/1.2),{x:viewport.clientWidth/2,y:viewport.clientHeight/2});
      return;
    }
    if (key?.valueFocus) {focus(nodes[Number(key.valueFocus)],true);return;}
    if (btn?.hasAttribute("data-value-close")) {
      const node=svg.querySelector('[data-chain-node="'+nodeIds.get(selected?.key)+'"]');
      focus(null);
      (node??viewport).focus({preventScroll:true});
      return;
    }
    const element=event.target.closest("[data-chain-node]");
    if (element) {
      const node=nodes[Number(element.dataset.chainNode)];
      focus(node);
      return;
    }
    const edge=graph.links[edgeElements.indexOf(event.target)];
    if (edge) focus(edge.to);
    else if (selected&&viewport.contains(event.target)) focus(null);
  };
  svg.onkeydown=event=>{
    const element=event.target.closest("[data-chain-node]");
    if (!element||!["Enter"," "].includes(event.key)) return;
    event.preventDefault();
    const node=nodes[Number(element.dataset.chainNode)];
    focus(node);
  };
  host.onchange=event=>{
    const {name,value}=event.target;
    if (!Object.hasOwn(state,name)) return;
    state[name]=name==="level"||name==="year"?Number(value):value;
    remember();
    if (name==="level") selected=null;
    draw(name==="level");
  };
  refreshLayout=()=>{
    if (host.hidden) return;
    const next=chainLayoutPreferences(prefs.chainExplorer).direction;
    if (direction===next) return;
    direction=next;
    layouts.clear();
    selected=null;
    draw(true);
  };
  draw(true);
  host.dataset.language=prefs.language;
}
