import {pair} from "./i18n.js";

const states=new WeakMap();
let pinned;

function release(state) {
  if(!state) return;
  state.locked=false;state.key=null;
  state.tip.hidden=true;state.tip.scrollTop=0;
  delete state.tip.dataset.pinned;
  state.tip.tabIndex=-1;
  state.tip.removeAttribute("aria-label");
  state.tip.removeAttribute("role");
  if(state.cursor) state.cursor.hidden=true;
  if(pinned===state) pinned=null;
}

if(typeof document!=="undefined") {
  document.addEventListener("click",event=>{
    if(pinned&&!pinned.canvas.contains(event.target)&&!pinned.tip.contains(event.target)) release(pinned);
  },true);
  document.addEventListener("keydown",event=>{if(event.key==="Escape") release(pinned);});
}

export function clearChartHover(canvas) {
  release(states.get(canvas));states.delete(canvas);
  canvas.onpointermove=canvas.onpointerleave=canvas.onclick=null;
}

export function bindChartHover(canvas,tip,{resolve,show,cursor}) {
  if(pinned&&!pinned.canvas.isConnected) release(pinned);
  const state=states.get(canvas)??{canvas,tip,key:null,locked:false};
  Object.assign(state,{tip,cursor});states.set(canvas,state);
  const display=key=>{
    if(key==null||show(key)===false) {release(state);return false;}
    state.key=key;tip.hidden=false;return true;
  };
  canvas.onpointermove=event=>{
    if(state.locked) return;
    const key=resolve(event);
    if(key===state.key&&!tip.hidden) return;
    tip.scrollTop=0;display(key);
  };
  canvas.onpointerleave=()=>{if(!state.locked) release(state);};
  canvas.onclick=event=>{
    if(pinned!==state) release(pinned);
    const key=resolve(event);
    if(!display(key)) return;
    state.locked=true;pinned=state;
    tip.dataset.pinned="true";tip.tabIndex=0;
    tip.setAttribute("role","region");
    tip.setAttribute("aria-label",pair("已固定图表数值，点击图表外或按 Esc 解除","Pinned chart values. Click outside the plot or press Escape to release."));
  };
  // Redrawing a resized plot retains the chosen period and the tooltip's own scroll position.
  if(state.key!=null) {
    const top=tip.scrollTop,left=tip.scrollLeft;
    display(state.key);tip.scrollTop=top;tip.scrollLeft=left;
  } else {
    tip.hidden=true;
    if(cursor) cursor.hidden=true;
  }
}
