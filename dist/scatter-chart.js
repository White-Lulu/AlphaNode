import {esc,finite,format,unitLabel} from "./model.js";
import {pair,locale} from "./i18n.js";
import {bindChartHover,clearChartHover} from "./chart-hover.js";

// Pair exact reference periods only. Neither missing values nor mixed frequencies are interpolated.
export function pairScatter(xRows,yRows,economies,{view="cross",period="latest",range=10}={}) {
  const xMap=new Map(xRows.map(row=>[row.economy,row.values]));
  const yMap=new Map(yRows.map(row=>[row.economy,row.values]));
  const all=economies.flatMap((economy,pin)=>Object.entries(xMap.get(economy)??{})
    .filter(([date,x])=>finite(x)&&finite(yMap.get(economy)?.[date]))
    .map(([date,x])=>({pin,period:date,x,y:yMap.get(economy)[date]})));
  const periods=[...new Set(all.map(point=>point.period))].sort();
  // Prefer a comparable sample over a newer period reported by just one economy.
  const latest=periods.findLast(date=>all.filter(point=>point.period===date).length>=Math.min(2,economies.length))??periods.at(-1);
  const chosen=period==="latest"?latest:period;
  const start=String(Number(periods.at(-1)?.slice(0,4))-range+1);
  const points=all.filter(point=>view==="cross"?point.period===chosen:!range||point.period>=start)
    .sort((a,b)=>a.pin-b.pin||a.period.localeCompare(b.period));
  return {points,periods,period:chosen};
}

export function scatterStats(points) {
  const n=points.length;
  if(n<3) return {n,r:null};
  const mean=key=>points.reduce((sum,point)=>sum+point[key]/n,0);
  const mx=mean("x"),my=mean("y");
  const sx=Math.max(...points.map(point=>Math.abs(point.x-mx)));
  const sy=Math.max(...points.map(point=>Math.abs(point.y-my)));
  if(!sx||!sy) return {n,r:null};
  let xx=0,yy=0,xy=0;
  for(const point of points) {
    const dx=(point.x-mx)/sx,dy=(point.y-my)/sy;
    xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;
  }
  return {n,r:Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)))};
}

export function drawScatter(card,chart,meta,{canvas,ctx,w,h,styles,colors}) {
  const spec=chart.scatter, points=spec.points.filter(point=>finite(point.x)&&finite(point.y));
  const tip=card.querySelector(".chart-tip"),cursor=card.querySelector(".chart-cursor");
  tip.classList.add("scatter-tip");
  const ink=styles.getPropertyValue("--plot-ink").trim()||"#55677c";
  const grid=styles.getPropertyValue("--plot-grid").trim()||"#dfe7f1";
  const name=key=>pair(meta.metrics[key][0],meta.metrics[key][2]??meta.metrics[key][0]);
  const display=(value,key,axis=false)=>format(value,key,"level",meta,axis);
  const axisLabel=key=>name(key)+" · "+unitLabel(key,"level",meta);
  const country=point=>chart.pins[point.pin]?.savedName??"";
  const fmt=new Intl.NumberFormat(locale(),{maximumFractionDigits:2,minimumFractionDigits:2});
  const correlation=sample=>{const {n,r}=scatterStats(sample);return "n="+n+" · r="+(finite(r)?fmt.format(r):"—");};
  const note=card.querySelector(".chart-note");
  note.hidden=false;
  const samples=[...new Set(points.map(point=>point.pin))];
  const missing=chart.pins.filter((pin,index)=>!samples.includes(index)).map(pin=>pin.savedName);
  const comparable=spec.view==="cross"&&!chart.pins.some(pin=>pin.isAggregate);
  const summary=spec.view==="cross"?
    (comparable?correlation(points):pair("含可能重叠的区域组合，不汇总相关系数","Overlapping aggregates may be included; no pooled correlation")):
    samples.map(pin=>chart.pins[pin].savedName+" "+correlation(points.filter(point=>point.pin===pin))).join("；");
  note.textContent=(summary?summary+" · ":"")+pair("r 为 Pearson 线性相关系数；相关不代表因果。","r is Pearson's linear correlation; association does not imply causation.")+
    (spec.view==="time"?pair("时间序列的趋势和自相关也会影响 r。","Trends and serial dependence also affect r."):"")+
    (missing.length?" "+pair("缺少配对：","No paired observations: ")+missing.join("、"):"");
  const numbers=card.querySelector(".chart-numbers"),box=card.querySelector(".chart-numbers-scroll");
  const drawValues=()=>{
    const left=box.scrollLeft,top=box.scrollTop;
    box.innerHTML='<table class="chart-data"><thead><tr>'+[pair("经济体","Economy"),pair("期间","Period"),axisLabel(spec.x),axisLabel(spec.y)]
      .map(text=>'<th scope="col">'+esc(text)+'</th>').join("")+'</tr></thead><tbody>'+
      points.slice().sort((a,b)=>b.period.localeCompare(a.period)||a.pin-b.pin).map(point=>'<tr><th scope="row">'+esc(country(point))+
        '</th><td>'+esc(point.period)+'</td><td>'+display(point.x,spec.x)+'</td><td>'+display(point.y,spec.y)+'</td></tr>').join("")+'</tbody></table>';
    box.scrollLeft=left;box.scrollTop=top;
  };
  numbers.ontoggle=()=>{if(numbers.open) drawValues();};
  if(numbers.open) drawValues();
  ctx.font='11px "Microsoft YaHei UI",sans-serif';ctx.fillStyle=ink;
  const area={l:w<430?60:72,r:w-22,t:30,b:h-48};
  // Keep full axis names in the canvas's accessible label and the tooltip on narrow cards.
  canvas.setAttribute("aria-label",pair("散点图：","Scatter plot: ")+"X "+axisLabel(spec.x)+"; Y "+axisLabel(spec.y));
  function caption(text,x,y,width) {
    const original=text;
    while(text.length&&ctx.measureText(text).width>width) text=text.slice(0,-1);
    ctx.fillText(text+(text!==original?"…":""),x,y);
  }
  ctx.textAlign="left";caption("Y · "+axisLabel(spec.y),8,13,w-16);
  ctx.textAlign="right";caption("X · "+axisLabel(spec.x),area.r,h-5,w-16);
  if(!points.length) {
    ctx.textAlign="center";
    ctx.fillText(chart.emptyMessage||pair("没有同频率、同期间的有效配对","No valid pairs at the same frequency and period"),w/2,h/2);
    clearChartHover(canvas);tip.hidden=cursor.hidden=true;
    return;
  }
  const extent=key=>{
    const values=points.map(point=>point[key]),min=Math.min(...values),max=Math.max(...values);
    const pad=(max-min)*.12||Math.abs(max)*.1||.1;
    return [min-pad,max+pad];
  };
  const [xmin,xmax]=extent("x"),[ymin,ymax]=extent("y");
  const px=x=>area.l+(x-xmin)/(xmax-xmin)*(area.r-area.l);
  const py=y=>area.b-(y-ymin)/(ymax-ymin)*(area.b-area.t);
  const line=(x1,y1,x2,y2,color,dashes=[])=>{
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash(dashes);
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);
  };
  const ticks=w<400?3:4;
  for(let i=0;i<=ticks;i++) {
    const xv=xmin+(xmax-xmin)*i/ticks,yv=ymin+(ymax-ymin)*i/ticks;
    line(px(xv),area.t,px(xv),area.b,grid);
    line(area.l,py(yv),area.r,py(yv),grid);
    ctx.fillStyle=ink;ctx.textAlign="right";ctx.fillText(display(yv,spec.y,true),area.l-7,py(yv)+4);
    ctx.textAlign="center";ctx.fillText(display(xv,spec.x,true),px(xv),area.b+17);
  }
  if(xmin<0&&xmax>0) line(px(0),area.t,px(0),area.b,ink,[2,4]);
  if(ymin<0&&ymax>0) line(area.l,py(0),area.r,py(0),ink,[2,4]);
  if(spec.guide&&spec.view==="cross") {
    const median=key=>{
      const values=points.map(point=>point[key]).sort((a,b)=>a-b),mid=Math.floor(values.length/2);
      return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
    };
    line(px(median("x")),area.t,px(median("x")),area.b,ink,[6,5]);
    line(area.l,py(median("y")),area.r,py(median("y")),ink,[6,5]);
  }
  const hits=[],labels=[];
  const periodStep=date=>spec.frequency==="A"?Number(date):spec.frequency==="Q"?Number(date.slice(0,4))*4+Number(date.at(-1)):Number(date.slice(0,4))*12+Number(date.slice(5));
  for(const pin of samples) {
    const sample=points.filter(point=>point.pin===pin),color=colors[pin];
    if(spec.view==="time"&&spec.connect) {
      for(let i=1;i<sample.length;i++) if(periodStep(sample[i].period)-periodStep(sample[i-1].period)===1) {
        ctx.globalAlpha=.4;
        line(px(sample[i-1].x),py(sample[i-1].y),px(sample[i].x),py(sample[i].y),color);
      }
    }
    for(const [index,point] of sample.entries()) {
      const latest=index===sample.length-1,x=px(point.x),y=py(point.y);
      ctx.globalAlpha=spec.view==="time"?.25+.75*(index+1)/sample.length:.85;
      ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(x,y,latest?4.7:3.2,0,Math.PI*2);ctx.fill();
      if(spec.view==="time"&&latest) {ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();}
      hits.push({...point,px:x,py:y});
      if(latest&&samples.length<=10) labels.push({x,y,text:country(point)+(spec.view==="time"?" "+point.period:""),color});
    }
  }
  ctx.globalAlpha=1;
  const occupied=[];
  for(const item of labels) {
    const width=ctx.measureText(item.text).width;
    const positions=[[item.x+9,item.y-9],[item.x-width-9,item.y-9],[item.x+9,item.y+17],[item.x-width-9,item.y+17]];
    const pos=positions.find(([x,y])=>x>=area.l&&x+width<=area.r&&y-10>=area.t&&y<=area.b&&
      !occupied.some(box=>x<box.r+3&&x+width>box.l-3&&y>box.t-3&&y-11<box.b+3));
    if(!pos) continue;
    const [x,y]=pos;occupied.push({l:x,r:x+width,t:y-11,b:y});
    ctx.fillStyle=item.color;ctx.textAlign="left";ctx.fillText(item.text,x,y);
  }
  const resolve=event=>{
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    let best,distance=Infinity;
    for(const point of hits) {
      const d=Math.hypot(point.px-x,point.py-y);
      if(d<distance) {best=point;distance=d;}
    }
    canvas.style.cursor=best&&distance<18?"pointer":"default";
    return best&&distance<18?best.pin+":"+best.period:null;
  };
  const show=key=>{
    const best=hits.find(point=>point.pin+":"+point.period===key);
    if(!best) return false;
    const nearest=[best,...hits.filter(point=>point!==best&&Math.hypot(point.px-best.px,point.py-best.py)<=1)];
    cursor.hidden=true;
    tip.classList.toggle("tip-left",best.px>w/2);
    tip.innerHTML=nearest.slice(0,6).map(point=>'<b>'+esc(country(point)+" · "+point.period)+'</b><ul><li><span>'+esc("X · "+name(spec.x))+
      '</span><strong>'+display(point.x,spec.x)+'</strong></li><li><span>'+esc("Y · "+name(spec.y))+'</span><strong>'+display(point.y,spec.y)+
      '</strong></li></ul>').join("")+(nearest.length>6?'<small>'+esc(pair("更多重合点见图表数值","More overlapping points in chart values"))+'</small>':"");
  };
  bindChartHover(canvas,tip,{resolve,show,cursor});
}
