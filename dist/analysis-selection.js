import {pair} from "./i18n.js";

export function setAnalysisMark(edits,start,end,marked) {
  const updated=[];
  for (const edit of edits??[]) {
    if (edit.end<=start||edit.start>=end) updated.push(edit);
    else {
      if (edit.start<start) updated.push({...edit,end:start});
      if (edit.end>end) updated.push({...edit,start:end});
    }
  }
  updated.push({start,end,marked});
  updated.sort((a,b)=>a.start-b.start);
  const combined=[];
  for (const edit of updated) {
    const previous=combined.at(-1);
    if (previous&&previous.end===edit.start&&previous.marked===edit.marked) previous.end=edit.end;
    else combined.push({...edit});
  }
  return combined;
}

export function applyAnalysisMarks(root,edits) {
  if (!edits?.length) return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const segments=[];
  for (let node=walker.nextNode();node;node=walker.nextNode()) {
    if (node.length) segments.push({node,marked:Boolean(node.parentElement.closest("mark"))});
  }
  for (const mark of root.querySelectorAll("mark")) mark.replaceWith(...mark.childNodes);
  let position=0,firstEdit=0;
  for (const {node,marked} of segments) {
    const end=position+node.length,fragment=document.createDocumentFragment();
    let cursor=position;
    const append=(until,highlight)=>{
      if (until<=cursor) return;
      const text=node.data.slice(cursor-position,until-position);
      if (highlight&&(text.trim()||node.parentNode!==root)) {
        const mark=document.createElement("mark");
        mark.textContent=text;
        fragment.append(mark);
      } else fragment.append(text);
      cursor=until;
    };
    while (firstEdit<edits.length&&edits[firstEdit].end<=position) firstEdit++;
    for (let i=firstEdit;i<edits.length&&edits[i].start<end;i++) {
      const edit=edits[i];
      append(Math.max(position,edit.start),marked);
      append(Math.min(end,edit.end),edit.marked);
    }
    append(end,marked);
    node.replaceWith(fragment);
    position=end;
  }
}

export function remapAnalysisMarks(previous,current,edits) {
  if (previous===current) return edits;
  // The formatter only removes literal delimiters when it recognizes an emphasis pair.
  const positions=[0];
  let offset=0;
  for (let i=0;i<previous.length;i++) {
    if (previous[i]===current[offset]) offset++;
    else if (!"*=\\".includes(previous[i])) return edits;
    positions.push(offset);
  }
  if (offset!==current.length) return edits;
  return edits.map(edit=>({...edit,start:positions[edit.start],end:positions[edit.end]}))
    .filter(edit=>edit.start<edit.end);
}

function analysisRoot(node) {
  const element=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
  return element?.closest(".saved-analysis[data-analysis-id]");
}

export function wireAnalysisSelection(onMark) {
  const toolbar=document.createElement("div");
  toolbar.className="analysis-selection-menu";
  toolbar.setAttribute("role","toolbar");
  toolbar.hidden=true;
  const labels=[
    ["copy","复制","Copy"],["mark","标记","Highlight"],["unmark","取消标记","Remove highlight"]
  ];
  for (const [action] of labels) {
    const button=document.createElement("button");
    button.type="button";
    button.dataset.action=action;
    toolbar.append(button);
  }
  document.body.append(toolbar);
  let selection,frame=0;

  function hide() {
    toolbar.hidden=true;
    selection=null;
  }
  function update() {
    frame=0;
    const current=window.getSelection();
    if (!current||current.isCollapsed||!current.rangeCount) {hide();return;}
    const range=current.getRangeAt(0),root=analysisRoot(range.startContainer);
    if (!root||root!==analysisRoot(range.endContainer)) {hide();return;}
    const text=current.toString();
    if (!text.trim()) {hide();return;}
    const viewport=root.closest("#collection").getBoundingClientRect();
    const rect=[...range.getClientRects()].find(box=>box.width&&box.height&&
      box.bottom>Math.max(0,viewport.top)&&box.top<Math.min(innerHeight,viewport.bottom)&&
      box.right>Math.max(0,viewport.left)&&box.left<Math.min(innerWidth,viewport.right));
    if (!rect) {hide();return;}
    const prefix=range.cloneRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer,range.startOffset);
    const start=prefix.toString().length;
    prefix.setEnd(range.endContainer,range.endOffset);
    selection={root,id:root.dataset.analysisId,start,end:prefix.toString().length,text};
    toolbar.setAttribute("aria-label",pair("所选文字操作","Selected text actions"));
    for (const [action,zh,en] of labels) toolbar.querySelector('[data-action="'+action+'"]').textContent=pair(zh,en);
    toolbar.hidden=false;
    const {width,height}=toolbar.getBoundingClientRect();
    const left=Math.max(8,Math.min(rect.right-width+12,innerWidth-width-8));
    const above=rect.top>=height+12;
    const top=above?rect.top-height-8:Math.min(rect.bottom+8,innerHeight-height-8);
    toolbar.dataset.side=above?"above":"below";
    toolbar.style.left=left+"px";
    toolbar.style.top=top+"px";
    toolbar.style.setProperty("--pointer-x",Math.max(11,Math.min(width-11,rect.right-left))+"px");
  }
  function schedule() {
    if (!frame) frame=requestAnimationFrame(update);
  }
  document.addEventListener("selectionchange",schedule);
  document.addEventListener("scroll",()=>{if (selection) schedule();},true);
  window.addEventListener("resize",()=>{if (selection) schedule();});
  document.addEventListener("pointerdown",event=>{if (selection&&!toolbar.contains(event.target)) hide();},true);
  document.addEventListener("keydown",event=>{
    if (event.key==="Escape"&&selection) {
      event.stopImmediatePropagation();
      window.getSelection()?.removeAllRanges();
      hide();
    }
  },true);
  toolbar.addEventListener("pointerdown",event=>event.preventDefault());
  toolbar.onclick=async event=>{
    const action=event.target.closest("button")?.dataset.action,current=selection;
    if (!action||!current?.root.isConnected) {hide();return;}
    if (action==="copy") {
      const button=event.target.closest("button");
      try {
        await navigator.clipboard.writeText(current.text);
      } catch {
        if (!document.execCommand("copy")) return;
      }
      if (selection===current) button.textContent=pair("已复制","Copied");
      return;
    }
    if (onMark(current,action==="mark")) {
      window.getSelection()?.removeAllRanges();
      hide();
    }
  };
}
