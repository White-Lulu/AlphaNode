const cellWidth=236, cellHeight=116, columnGap=58, padding=30;

export function itemType(name) {
  return name.startsWith("^")?"tool":name.startsWith("~")?"consumption":"material";
}

export function makeGraph(paths,{shared=true,direction="horizontal",stageOwners=()=>[],itemOwners=()=>[],scope="",parallel=false}={}) {
  const nodes=new Map(), links=[], forward=new Map(), seen=new Set(), uses=new Map(), copies=[];
  const put=(key,type,label,identity)=> {
    if (scope) key=JSON.stringify([scope,key]);
    if (!nodes.has(key)) {
      nodes.set(key,{key,type,label,identity,paths:new Set(),stages:[],owners:new Set(),rank:0,scope});
      forward.set(key,new Set());
    }
    return nodes.get(key);
  };
  const item=(label,context,isInput=false)=> {
    const type=itemType(label);
    const base=shared?label:JSON.stringify([context.id,label]);
    const usesSoFar=isInput?(uses.get(base)??0):0;
    if (isInput) uses.set(base,usesSoFar+1);
    const key=!shared&&usesSoFar?base+"#"+usesSoFar:base;
    const node=put(key,type,type==="material"?label:label.slice(1),label);
    if (!shared&&usesSoFar) copies.push([node,scope?JSON.stringify([scope,base]):base]);
    node.paths.add(context.id);
    for (const owner of itemOwners(label,context)) node.owners.add(owner);
    return node;
  };
  const reaches=(from,to)=>{
    const pending=[from], visited=new Set();
    while (pending.length) {
      const next=pending.pop();
      if (next===to) return true;
      if (visited.has(next)) continue;
      visited.add(next);
      pending.push(...forward.get(next));
    }
    return false;
  };
  function link(from,to,type) {
    links.push({from,to,type});
    if (type!=="loop") forward.get(from.key).add(to.key);
  }
  for (const context of paths) for (const stage of context.steps) {
    const input=stage.input.map(name=>item(name,context,true)), output=item(stage.output,context);
    const identity=JSON.stringify([stage.owner,stage.tool,stage.input,stage.output]);
    const key=shared?identity:JSON.stringify([context.id,identity]);
    const node=put(key,"operation",stage.tool,stage.tool);
    node.paths.add(context.id);
    const owners=stageOwners(stage,context);
    const entry={...stage,context,owners};
    node.stages.push(entry);
    output.stages.push(entry);
    for (const o of owners) {node.owners.add(o);output.owners.add(o);}
    if (seen.has(node.key)) continue;
    seen.add(node.key);
    const cyclic=stage.loop||input.some(n=>reaches(output.key,n.key));
    for (const n of input) link(n,node,n.type==="tool"?"support":stage.alternatives?"alternative":"flow");
    link(node,output,cyclic?"loop":"flow");
  }
  const productions=new Map();
  for (const edge of links) if (edge.to.stages.length&&edge.to.type!=="operation") {
    const incoming=productions.get(edge.to.key)??[];
    incoming.push(edge);
    productions.set(edge.to.key,incoming);
  }
  for (const [node,base] of copies) {
    const incoming=productions.get(base);
    if (!incoming) continue;
    const original=nodes.get(base);
    node.stages.push(...original.stages);
    for (const owner of original.owners) node.owners.add(owner);
    for (const edge of incoming) link(edge.from,node,edge.type==="loop"||reaches(node.key,edge.from.key)?"loop":edge.type);
  }
  if (!parallel || !nodes.size) return layout(nodes,links,direction);
  const vertical=direction==="vertical", neighbors=new Map([...nodes.values()].map(n=>[n,[]]));
  for (const edge of links) {
    neighbors.get(edge.from).push(edge);
    neighbors.get(edge.to).push(edge);
  }
  const visited=new Set();
  let width=0, height=0;
  for (const node of nodes.values()) {
    if (visited.has(node)) continue;
    const members=[node], edges=new Set();
    visited.add(node);
    for (const member of members) for (const edge of neighbors.get(member)) {
      edges.add(edge);
      const next=edge.from===member?edge.to:edge.from;
      if (visited.has(next)) continue;
      visited.add(next);
      members.push(next);
    }
    const part=layout(new Map(members.map(n=>[n.key,n])),[...edges],direction);
    const offset=vertical?width:height;
    for (const n of members) {
      if (vertical) n.x+=offset;
      else n.y+=offset;
    }
    width=vertical?width+part.width:Math.max(width,part.width);
    height=vertical?Math.max(height,part.height):height+part.height;
  }
  return {nodes,links,width,height,vertical,maxDepth:Math.max(0,...[...nodes.values()].map(n=>n.depth))};
}

function traceDepths(nodes, links) {
  const adjacency=links.filter(edge=>edge.type!=="loop");
  const byOrigin=new Map([...nodes.keys()].map(key=>[key,[]]));
  const byTarget=new Map([...nodes.keys()].map(key=>[key,[]]));
  for (const edge of adjacency) {
    byOrigin.get(edge.from.key).push(edge.to);
    byTarget.get(edge.to.key).push(edge.from);
  }
  const inbound=new Map([...byTarget].map(([key,items])=>[key,items.length]));
  for (const n of nodes.values()) n.depth=0;
  const roots=[...nodes.values()].filter(n=>!inbound.get(n.key));
  for (const n of roots) for (const to of byOrigin.get(n.key)) {
    to.depth=Math.max(to.depth,n.depth+1);
    const count=inbound.get(to.key)-1;
    inbound.set(to.key,count);
    if (!count) roots.push(to);
  }
  return {roots,byOrigin,byTarget};
}

function layout(nodes, links, direction) {
  const {roots,byOrigin,byTarget}=traceDepths(nodes,links);
  const satellites=new Map();
  for (const node of nodes.values()) node.rank=node.depth;
  if (direction==="adaptive") for (const node of roots) {
    const outgoing=byOrigin.get(node.key), anchor=outgoing[0];
    if (node.type!=="operation"&&outgoing.length===1&&byTarget.get(node.key).length===0&&
        anchor.rank>=2&&!node.stages.length) satellites.set(node,anchor);
  }
  const columns=Array.from({length:1+Math.max(0,...[...nodes.values()].map(n=>n.rank))},()=>[]);
  for (const n of nodes.values()) if (!satellites.has(n)) columns[n.rank].push(n);
  const maxRows=Math.max(1,...columns.map(c=>c.length));
  for (let column=0;column<columns.length;column++) {
    const current=columns[column];
    if (column) {
      const average=node=>{
        const neighbors=byTarget.get(node.key).filter(n=>!satellites.has(n));
        return neighbors.length?neighbors.reduce((sum,n)=>sum+n.lane,0)/neighbors.length:0;
      };
      current.sort((a,b)=>average(a)-average(b));
    }
    for (const [row,n] of current.entries()) n.lane=Math.floor((maxRows-current.length)/2)+row;
  }
  const used=columns.map(c=>new Set(c.map(n=>n.lane)));
  for (const [node,anchor] of satellites) {
    const lanes=used[anchor.rank];
    node.rank=anchor.rank;
    for(let distance=1;;distance++) {
      const lane=[anchor.lane-distance,anchor.lane+distance].find(i=>!lanes.has(i));
      if(lane===undefined) continue;
      node.lane=lane;
      lanes.add(lane);
      break;
    }
  }
  const lanes=[...nodes.values()].map(n=>n.lane), minLane=Math.min(0,...lanes), maxLane=Math.max(0,...lanes);
  const vertical=direction==="vertical", xPitch=cellWidth+columnGap, yPitch=cellHeight+(vertical?46:0);
  for(const n of nodes.values()){
    n.x=padding+(vertical?n.lane-minLane:n.rank)*xPitch;
    n.y=padding+(vertical?n.rank:n.lane-minLane)*yPitch;
  }
  const width=padding*2+cellWidth+(vertical?maxLane-minLane:columns.length-1)*xPitch;
  const height=padding*2+cellHeight+(vertical?columns.length-1:maxLane-minLane)*yPitch;
  return {nodes,links,width,height,vertical,maxDepth:columns.length-1};
}

export function graftEquipment(graph, part, anchor, output, shared) {
  const end=[...part.nodes.values()].find(n=>n.identity===output&&n.stages.length);
  const aliases=new Map();
  if (anchor.identity===end.identity) {
    aliases.set(end,anchor);
    anchor.stages.push(...end.stages);
  }
  if (shared) {
    const existingRoots=new Map([...graph.nodes.values()].filter(n=>!n.stages.length).map(n=>[n.identity,n]));
    for (const n of part.nodes.values()) {
      if (!n.stages.length&&existingRoots.has(n.identity)) aliases.set(n,existingRoots.get(n.identity));
    }
  }
  for (const [source,target] of aliases) {
    part.nodes.delete(source.key);
    for (const path of source.paths) target.paths.add(path);
    for (const owner of source.owners) target.owners.add(owner);
  }

  const major=graph.vertical?"y":"x", minor=graph.vertical?"x":"y";
  const pitch=graph.vertical?cellWidth+columnGap:cellHeight;
  const majorShift=anchor[major]-end[major];
  const near=anchor[minor]-end[minor];
  const placed=[...graph.nodes.values()], incoming=[...part.nodes.values()];
  const fits=shift=>incoming.every(n=>placed.every(p=>
    Math.abs(n.x+(graph.vertical?shift:majorShift)-p.x)>=cellWidth+12||
    Math.abs(n.y+(graph.vertical?majorShift:shift)-p.y)>=cellHeight));
  let minorShift=near;
  for (let distance=1;!fits(minorShift);distance++) {
    const above=near-distance*pitch, below=near+distance*pitch;
    minorShift=fits(above)?above:below;
  }
  for (const n of incoming) {
    n[major]+=majorShift;
    n[minor]+=minorShift;
    graph.nodes.set(n.key,n);
  }
  for (const e of part.links) {
    const from=aliases.get(e.from)??e.from, to=aliases.get(e.to)??e.to;
    graph.links.push({...e,from,to,type:to===anchor?"equipment":e.type});
  }
  if (!aliases.has(end)) graph.links.push({from:end,to:anchor,type:"equipment"});
}

export function boundGraph(graph) {
  const nodes=[...graph.nodes.values()];
  const dx=padding-Math.min(...nodes.map(n=>n.x)), dy=padding-Math.min(...nodes.map(n=>n.y));
  for (const n of nodes) {n.x+=dx;n.y+=dy;}
  graph.width=Math.max(...nodes.map(n=>n.x+cellWidth+padding));
  graph.height=Math.max(...nodes.map(n=>n.y+cellHeight+padding));
  traceDepths(graph.nodes,graph.links);
  graph.maxDepth=Math.max(0,...nodes.map(n=>n.depth));
}

const nodeLeft=node=>node.x+(node.type==="operation"?2:10);
const nodeRight=node=>node.x+cellWidth-(node.type==="operation"?2:10);
const nodeY=node=>node.y+45;

function returnPath(edge, graph, order) {
  const {from,to}=edge, {vertical}=graph;
  const down=vertical?from.y<to.y:from.x<to.x, sign=down?1:-1;
  const u=vertical?(down?from.y+108:from.y):down?nodeRight(from):nodeLeft(from);
  const v=vertical?(down?to.y:to.y+108):down?nodeLeft(to):nodeRight(to);
  const a=vertical?from.x+cellWidth/2:nodeY(from), b=vertical?to.x+cellWidth/2:nodeY(to);
  const gap=15+order%3*4, lead=u+sign*gap, tail=v-sign*gap;
  const min=Math.min(lead,tail), max=Math.max(lead,tail);
  const intervals=[...graph.nodes.values()].filter(n=>{
    const start=vertical?n.y:n.x, size=vertical?108:cellWidth;
    return n===from||n===to||(start<max&&start+size>min);
  }).map(n=>vertical?[n.x,n.x+cellWidth]:n.type==="operation"?[n.y,n.y+110]:[n.y+12,n.y+78]);
  const near=(start,direction)=>{
    let lane=start;
    for (;;) {
      const [left,right]=intervals.find(([lo,hi])=>lane>lo-gap&&lane<hi+gap)??[];
      if (left===undefined) return lane;
      lane=direction<0?left-gap:right+gap;
    }
  };
  const low=near(Math.min(a,b)-gap,-1), high=near(Math.max(a,b)+gap,1);
  const lane=a+b-low*2<=high*2-a-b?low:high;
  const point=(x,y)=>vertical?y+" "+x:x+" "+y;
  const radius=8, s1=Math.sign(lane-a), s2=Math.sign(b-lane), forward=Math.sign(tail-lead);
  return `M${point(u,a)} L${point(lead-sign*radius,a)} Q${point(lead,a)} ${point(lead,a+s1*radius)}`+
    ` L${point(lead,lane-s1*radius)} Q${point(lead,lane)} ${point(lead+forward*radius,lane)}`+
    ` L${point(tail-forward*radius,lane)} Q${point(tail,lane)} ${point(tail,lane+s2*radius)}`+
    ` L${point(tail,b-s2*radius)} Q${point(tail,b)} ${point(tail+sign*radius,b)} L${point(v,b)}`;
}

function edgePath(edge, graph) {
  const a=nodeRight(edge.from), b=nodeLeft(edge.to), y=nodeY(edge.from), z=nodeY(edge.to);
  if (graph.vertical&&y===z) {
    const rightward=a<b;
    return `M${rightward?a:nodeLeft(edge.from)} ${y} H${rightward?b:nodeRight(edge.to)}`;
  }
  if (graph.vertical||edge.from.x===edge.to.x) {
    const x=edge.from.x+cellWidth/2, w=edge.to.x+cellWidth/2;
    const down=y<z, end=edge.to.type==="operation"?(down?edge.to.y:edge.to.y+110):(z+(down?-28:31));
    const start=edge.from.type==="operation"?(down?edge.from.y+108:edge.from.y):(y+(down?30:-30));
    const middle=(start+end)/2;
    return `M${x} ${start} C${x} ${middle} ${w} ${middle} ${w} ${end}`;
  }
  const rightward=edge.from.x<edge.to.x, start=rightward?a:nodeLeft(edge.from), end=rightward?b:nodeRight(edge.to);
  const m=start+(end-start)*.53;
  return `M${start} ${y} C${m} ${y} ${m} ${z} ${end} ${z}`;
}

function wrapped(label, max=23) {
  const tokens=label.match(/[\u3000-\u9fff]|[^\s\u3000-\u9fff]+\s*|\s+/gu);
  const lines=[""];
  const length=s=>[...s].reduce((sum,c)=>sum+(c.charCodeAt(0)>0x2fff?1.7:1),0);
  for (const token of tokens??[]) {
    if (lines.at(-1)&&length(lines.at(-1)+token)>max) lines.push("");
    lines[lines.length-1]+=token;
  }
  return lines.map(s=>s.trim());
}

export const graphDefs='<defs><marker id="chain-arrow" viewBox="0 0 9 9" refX="8" refY="4.5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L9 4.5L0 9z" fill="context-stroke"/></marker></defs>';

export function graphMarkup(graph, label, ownerName, esc, picked, nodeIds,{company="",recipes=()=>false,expanded=()=>false,showOwnership=false,lightFirst=false}={}) {
  const {nodes,links}=graph;
  const selected=new Set([...nodes.values()].filter(n=>company?n.owners.has(company):picked&&n.identity===picked.identity).map(n=>n.key));
  const related=new Set(selected);
  const relatedScopes=new Set();
  for (const e of links) {
    if (selected.has(e.from.key)) related.add(e.to.key);
    if (selected.has(e.to.key)) related.add(e.from.key);
    if (e.type==="equipment"&&selected.has(e.to.key)) relatedScopes.add(e.from.scope);
  }
  const values=[...nodes.values()];
  let loop=0;
  const lines=links.map(edge=>{
    const highlighted=selected.has(edge.from.key)||selected.has(edge.to.key);
    return '<path class="chain-link '+edge.type+(highlighted?" is-highlighted":"")+'" d="'+
      (edge.type==="loop"?returnPath(edge,graph,loop++):edgePath(edge,graph))+'" marker-end="url(#chain-arrow)"/>';
  }).join("");
  const elements=values.map(node=>{
    const operation=node.type==="operation", stage=node.stages[0];
    const ownedStage=showOwnership&&node.stages.find(s=>s.context.company&&s.owner===s.context.id);
    const owner=operation&&(ownedStage?ownerName(ownedStage.owner):stage?.owner?ownerName(stage.owner):company&&selected.has(node.key)?ownerName(company):"");
    const name=label(node.label), nodeClass=node.type+(selected.has(node.key)?" is-selected":picked&&!company&&related.has(node.key)?" is-neighbor":"")+
      (ownedStage?" is-own-stage":"")+(selected.size&&!related.has(node.key)&&!relatedScopes.has(node.scope)&&!ownedStage?" is-dimmed":"");
    const at=`translate(${node.x} ${node.y})`;
    const drillId=recipes(node)?' data-chain-drill="'+nodeIds.get(node.key)+'"':"";
    const depth=node.depth/Math.max(1,graph.maxDepth);
    const tone=12+30*(lightFirst?depth:1-depth);
    const text=(lines,x,y,anchor="middle")=>'<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'">'+
      lines.map((line,i)=>'<tspan x="'+x+'" dy="'+(i?"16":"0")+'">'+esc(line)+'</tspan>').join("")+'</text>';
    let shape;
    if (operation) {
      const ownerLine=wrapped(owner,28)[0];
      shape=(owner?'<rect class="chain-owner-frame" x="1" y="0" width="234" height="110" rx="5"/><text class="chain-owner-label" x="10" y="16">'+esc(ownerLine)+'</text>':
        '<rect x="1" y="35" width="234" height="73" fill="transparent"/>')+
        '<path class="chain-operation-line" d="M2 45H234"/><path class="chain-tool-shape"'+drillId+' d="M16 74l13-21 13 21z"/>'+
        text(wrapped(name,24).slice(0,3),50,62,"start");
    } else {
      const tool='<path class="chain-tool-shape"'+drillId+' d="M23 60l19-32 19 32z"/>';
      const labelLines=wrapped(name,node.type==="tool"?20:25).slice(0,3);
      const y=49-(labelLines.length-1)*8;
      shape=node.type==="consumption"?'<ellipse class="chain-item-shape" cx="118" cy="45" rx="108" ry="32"/>'+text(labelLines,118,y):
        node.type==="tool"?'<rect x="10" y="15" width="216" height="60" fill="transparent"/>'+tool+text(labelLines,72,y,"start"):
        '<rect class="chain-item-shape" x="10" y="15" width="216" height="60" rx="3"/>'+text(labelLines,118,y);
    }
    const hint=owner?owner+" · "+name:name;
    const drill=drillId?'<g class="chain-expand"'+drillId+' aria-hidden="true"><rect x="201" y="1" width="24" height="23" rx="3"/><text x="213" y="17" text-anchor="middle">'+(expanded(node)?"−":"+")+'</text></g>':"";
    return '<g class="chain-node '+nodeClass+'" transform="'+at+'" data-chain-node="'+nodeIds.get(node.key)+
      '" role="button" tabindex="0" aria-label="'+esc(hint)+'" style="--chain-tone:'+tone.toFixed(1)+'%"><title>'+esc(hint)+'</title>'+shape+drill+'</g>';
  }).join("");
  return lines+elements;
}
