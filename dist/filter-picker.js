import {esc} from "./model.js";
import {pair} from "./i18n.js";

const pickers=new WeakMap();

function createPicker(host) {
  const id=host.id+"-choices";
  host.innerHTML='<button type="button" class="quiet filter-picker-trigger" id="'+host.id+
    '-trigger" popovertarget="'+id+'" aria-labelledby="'+host.id+'-title '+host.id+'-trigger"></button>'+
    '<div id="'+id+'" class="filter-picker" popover role="group" aria-labelledby="'+host.id+'-title"></div>';
  const picker={trigger:host.firstElementChild,popup:host.lastElementChild};
  pickers.set(host,picker);
  return picker;
}

function forest(items) {
  const nodes=new Map(items.map(item=>[item.id,{...item,children:[]}]));
  const roots=[];
  for (const node of nodes.values()) {
    const parent=nodes.get(node.parent);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return {nodes,roots};
}
function walk(nodes,visit,depth=0) {
  for (const node of nodes) {
    visit(node,depth);
    walk(node.children,visit,depth+1);
  }
}
function setLeaves(node,leaves,checked) {
  if (node.children.length) node.children.forEach(child=>setLeaves(child,leaves,checked));
  else if (checked) leaves.add(node.id);
  else leaves.delete(node.id);
}
function mark(nodes,leaves) {
  for (const node of nodes) {
    mark(node.children,leaves);
    const checked=node.children.length?node.children.every(child=>child.input.checked):leaves.has(node.id);
    node.input.checked=checked;
    node.input.indeterminate=!checked&&node.children.some(child=>child.input.checked||child.input.indeterminate);
  }
}
function selectedBranches(nodes) {
  return nodes.flatMap(node=>node.input.checked?[node.id]:selectedBranches(node.children));
}

export function renderFilterPicker(host,items,selected,allLabel,onChange) {
  const picker=pickers.get(host)??createPicker(host);
  const {trigger,popup}=picker;
  const signature=JSON.stringify([allLabel,items]);
  if (picker.signature!==signature) {
    picker.signature=signature;
    Object.assign(picker,forest(items));
    const html=['<label class="filter-picker-all"><input type="checkbox" data-choice="">'+esc(allLabel)+'</label>'];
    walk(picker.roots,(node,depth)=>html.push('<label'+(node.children.length?' class="filter-picker-branch"':"")+
      ' style="--choice-depth:'+depth+'"><input type="checkbox" data-choice="'+esc(node.id)+'"><span>'+esc(node.label)+'</span></label>'));
    popup.innerHTML=html.join("");
    for (const input of popup.querySelectorAll("[data-choice]")) {
      if (input.dataset.choice) picker.nodes.get(input.dataset.choice).input=input;
      else picker.all=input;
    }
  }
  const leaves=new Set();
  for (const id of selected) {
    const node=picker.nodes.get(id);
    if (node) setLeaves(node,leaves,true);
  }
  mark(picker.roots,leaves);
  picker.all.checked=leaves.size===0;
  trigger.textContent=!leaves.size?allLabel:selected.length===1&&picker.nodes.has(selected[0])?
    picker.nodes.get(selected[0]).label:pair("已选 "+selected.length+" 项",selected.length+" selected");
  trigger.title=trigger.textContent;
  popup.onchange=event=>{
    const input=event.target.closest("[data-choice]");
    if (!input) return;
    if (!input.dataset.choice) {onChange([]);return;}
    setLeaves(picker.nodes.get(input.dataset.choice),leaves,input.checked);
    mark(picker.roots,leaves);
    onChange(selectedBranches(picker.roots));
  };
}
