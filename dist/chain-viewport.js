export function bindChainSplitter(handle,{limits,value,apply,remember,direction=1,axis="x"}) {
  const describe=()=>{
    const {min,max}=limits(), now=Math.round(value());
    handle.setAttribute("aria-valuemin",String(Math.round(min)));
    handle.setAttribute("aria-valuemax",String(Math.round(max)));
    handle.setAttribute("aria-valuenow",String(now));
    handle.setAttribute("aria-valuetext",now+"px");
  };
  let drag=null;
  const stop=()=>{
    if (!drag) return;
    if (handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
    drag=null;
    handle.classList.remove("dragging");
    delete document.body.dataset.resizing;
    remember();
  };
  handle.onpointerdown=e=>{
    if (e.button!==0||drag) return;
    e.preventDefault();
    handle.focus({preventScroll:true});
    handle.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,start:axis==="x"?e.clientX:e.clientY,value:value()};
    handle.classList.add("dragging");
    document.body.dataset.resizing=axis;
  };
  handle.onpointermove=e=>{
    if (drag?.id!==e.pointerId) return;
    apply(drag.value+((axis==="x"?e.clientX:e.clientY)-drag.start)*direction);
    describe();
  };
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=stop;
  handle.onkeydown=e=>{
    const {min,max}=limits(), step=(e.shiftKey?48:12)*direction, now=value();
    const arrows=axis==="x"?{ArrowLeft:now-step,ArrowRight:now+step}:{ArrowUp:now-step,ArrowDown:now+step};
    const values={Home:min,End:max,...arrows};
    if (!(e.key in values)) return;
    e.preventDefault();
    apply(values[e.key]);
    describe();
    remember();
  };
  handle.ondblclick=()=>{apply(null);describe();remember();};
  describe();
  return describe;
}

export function chainInspectorLimits(panel) {
  return {min:240,max:Math.max(240,Math.min(520,panel.clientWidth*.45))};
}

export function bindChainViewport(vp,zoomBy) {
  const touches=new Map();
  let pan=null, pinch=null, suppressClick=false;
  const relativePoint=(x,y)=>{
    const box=vp.getBoundingClientRect();
    return {x:x-box.left-vp.clientLeft,y:y-box.top-vp.clientTop};
  };
  const pinchGeometry=()=>{
    const [a,b]=touches.values();
    return {...relativePoint((a.x+b.x)/2,(a.y+b.y)/2),distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
  };
  const stop=()=>{
    const id=pan?.id;
    pan=null;
    vp.classList.remove("dragging");
    if (id!==undefined&&vp.hasPointerCapture(id)) vp.releasePointerCapture(id);
  };
  vp.onpointerdown=e=>{
    if (e.pointerType==="touch") {
      if (touches.size===2) return;
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (touches.size===2) {
        stop();
        suppressClick=true;
        pinch=pinchGeometry();
        for (const id of touches.keys()) vp.setPointerCapture(id);
        return;
      }
    }
    if (!e.isPrimary||e.button!==0) return;
    stop();
    suppressClick=false;
    pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:vp.scrollLeft,top:vp.scrollTop,active:false};
  };
  vp.onpointermove=e=>{
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pinch) {
        const next=pinchGeometry();
        zoomBy(next.distance/pinch.distance,pinch,next);
        pinch=next;
        return;
      }
    }
    if (pan?.id!==e.pointerId) return;
    const dx=e.clientX-pan.x, dy=e.clientY-pan.y;
    if (!(e.buttons&1)) {stop();return;}
    if (!pan.active) {
      if (Math.hypot(dx,dy)<6) return;
      vp.setPointerCapture(e.pointerId);
      pan.active=suppressClick=true;
      vp.classList.add("dragging");
    }
    vp.scrollTo(pan.left-dx,pan.top-dy);
  };
  vp.onpointerup=vp.onpointercancel=e=>{
    const ended=touches.delete(e.pointerId);
    if (ended&&pinch) {
      pinch=null;
      const [remaining]=touches;
      if (remaining&&e.type==="pointerup") {
        const [id,{x,y}]=remaining;
        pan={id,x,y,left:vp.scrollLeft,top:vp.scrollTop,active:true};
        vp.classList.add("dragging");
      }
    }
    if (pan?.id===e.pointerId) stop();
  };
  vp.onlostpointercapture=e=>{if(e.target===vp&&pan?.id===e.pointerId) stop();};
  vp.onpointerleave=()=>{if(pan&&!pan.active) stop();};
  vp.addEventListener("wheel",e=>{
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY*.0018),relativePoint(e.clientX,e.clientY));
  },{passive:false});
  vp.addEventListener("click",e=>{
    if (!suppressClick||e.detail===0) return;
    suppressClick=false;
    e.stopPropagation();
  },true);
}
