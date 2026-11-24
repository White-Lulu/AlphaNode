import {pair} from "./i18n.js";

const states=new WeakMap();
let pinned;

function hidePreview(state) {
  state.hoverKey=null;state.tip.hidden=true;
  delete state.tip.dataset.preview;
  if(state.cursor) state.cursor.hidden=true;
}

function release(state) {
  if(!state) return;
  state.fixedTip?.remove();state.fixedCursor?.remove();
  state.fixedTip=state.fixedCursor=null;state.key=null;
  hidePreview(state);
  state.tip.classList.remove("tip-left");
  if(pinned===state) pinned=null;
}

if(typeof document!=="undefined") {
  document.addEventListener("click",event=>{
    if(pinned&&!pinned.canvas.contains(event.target)&&!pinned.fixedTip?.contains(event.target)) release(pinned);
  },true);
  document.addEventListener("keydown",event=>{if(event.key==="Escape") release(pinned);});
}

export function clearChartHover(canvas) {
  release(states.get(canvas));states.delete(canvas);
  canvas.onpointermove=canvas.onpointerleave=canvas.onclick=null;
}

export function bindChartHover(canvas,tip,{resolve,show,cursor}) {
  if(pinned&&!pinned.canvas.isConnected) release(pinned);
  const state=states.get(canvas)??{canvas,tip,key:null,hoverKey:null};
  Object.assign(state,{tip,cursor});states.set(canvas,state);
  const display=key=>{
    if(key==null||show(key)===false) {hidePreview(state);return false;}
    state.hoverKey=key;tip.hidden=false;
    if(state.fixedTip) {
      tip.dataset.preview="true";
      tip.classList.toggle("tip-left",!state.fixedTip.classList.contains("tip-left"));
    }
    return true;
  };
  const pin=(key,retainScroll=false)=>{
    if(pinned!==state) release(pinned);
    if(!display(key)) {release(state);return;}
    const old=state.fixedTip,side=(old??tip).classList.contains("tip-left");
    const top=retainScroll?old?.scrollTop??0:0;
    const fixed=old??tip.cloneNode(false);
    fixed.className=tip.className;fixed.classList.toggle("tip-left",side);
    fixed.innerHTML=tip.innerHTML;fixed.hidden=false;
    delete fixed.dataset.preview;fixed.dataset.pinned="true";fixed.tabIndex=0;
    fixed.setAttribute("role","region");
    fixed.setAttribute("aria-label",pair("已固定图表数值，点击图表外或按 Esc 解除","Pinned chart values. Click outside the plot or press Escape to release."));
    if(!old) tip.after(fixed);
    state.fixedTip=fixed;state.key=key;pinned=state;
    fixed.scrollTop=top;
    if(cursor&&!cursor.hidden) {
      const marker=state.fixedCursor??cursor.cloneNode(false);
      marker.dataset.pinnedCursor="true";marker.style.cssText=cursor.style.cssText;marker.hidden=false;
      if(!state.fixedCursor) cursor.after(marker);
      state.fixedCursor=marker;
    }
    hidePreview(state);
  };
  canvas.onpointermove=event=>{
    const key=resolve(event);
    if(state.fixedTip&&key===state.key) {hidePreview(state);return;}
    if(key===state.hoverKey&&!tip.hidden) return;
    tip.scrollTop=0;display(key);
  };
  canvas.onpointerleave=()=>hidePreview(state);
  canvas.onclick=event=>pin(resolve(event));
  // Reposition both time markers after a resize without changing the selected periods.
  const hoverKey=state.hoverKey;
  if(state.fixedTip) pin(state.key,true);
  if(hoverKey!=null&&hoverKey!==state.key) display(hoverKey);
  else hidePreview(state);
}
