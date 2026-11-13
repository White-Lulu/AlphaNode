
import {esc,finite} from "./model.js";
import {locale,pair,prefs,prose} from "./i18n.js";

const snapshots=new Map();
const ttl=60*60*1000;
const ranges=[1,3,5,10];
let observer;

function load(code) {
  const cached=snapshots.get(code);
  if (cached&&Date.now()<cached.expires) return cached.promise;
  const promise=fetch("/api/stock-price?code="+encodeURIComponent(code)).then(response=>{
    if (!response.ok) throw new Error("PRICE_UNAVAILABLE");
    return response.json();
  }).catch(error=>{snapshots.delete(code);throw error;});
  snapshots.set(code,{promise,expires:Date.now()+ttl});
  if (snapshots.size>48) snapshots.delete(snapshots.keys().next().value);
  return promise;
}

export function disposeStockPrice() {
  observer?.disconnect();
  observer=null;
}

export function renderStockPrice(target,code) {
  disposeStockPrice();
  const years=ranges.includes(prefs.stockPriceYears)?prefs.stockPriceYears:1;
  const rangeButtons=ranges.map(value=>{
    const active=value===years;
    return '<button class="'+(active?"primary":"quiet")+'" type="button" data-price-years="'+value+'" aria-pressed="'+active+'">'+
      esc(pair(value+" 年",value+"Y"))+'</button>';
  }).join("");
  target.innerHTML='<div class="stock-heading"><h3 id="profile-stock-title">'+esc(pair("股价走势","Stock price"))+'</h3>'+
    '<div class="stock-ranges">'+rangeButtons+'</div></div><div class="stock-content" role="status">'+
    esc(prose("正在读取股价…","Loading price history…"))+"</div>";
  const content=target.querySelector(".stock-content");
  void load(code).then(data=>{
    if (!content.isConnected) return;
    const end=new Date(data.points.at(-1)[0]*1000);
    end.setUTCFullYear(end.getUTCFullYear()-years);
    const points=data.points.filter(([stamp])=>stamp>=end.getTime()/1000);
    const base=points[0]?.[1];
    const series=points.map(([stamp,price])=>[stamp,price/base-1]);
    const quote=finite(data.price)?new Intl.NumberFormat(locale(),{maximumFractionDigits:4}).format(data.price):"—";
    let date="";
    if (finite(data.time)) {
      const timeZone=data.zone||"UTC";
      try {date=new Intl.DateTimeFormat(locale(),{dateStyle:"medium",timeZone}).format(data.time*1000);}
      catch {date=new Date(data.time*1000).toISOString().slice(0,10);}
    }
    content.innerHTML='<div class="stock-quote"><strong>'+esc(quote+(data.currency?" "+data.currency:""))+
      '</strong><span>'+esc([pair("最新常规交易价","Latest regular-session price"),date].filter(Boolean).join(" · "))+'</span></div>'+
      (series.length>=2?'<canvas class="stock-chart" role="img" aria-label="'+esc(pair("复权股价累计涨跌幅","Cumulative adjusted price change"))+'"></canvas>':
        '<p>'+esc(prose("所选区间的历史点不足。","Too few observations in this range."))+'</p>')+
      '<p class="stock-source">'+esc(prose("周频 · 复权价相对区间起点 · Yahoo Finance","Weekly · adjusted price relative to start · Yahoo Finance"))+
      (data.stale?" · "+esc(prose("缓存数据","Cached data")):"")+'</p>';
    const canvas=content.querySelector("canvas");
    if (!canvas) return;
    observer=new ResizeObserver(()=>draw(canvas,series));
    observer.observe(canvas);
    draw(canvas,series);
  }).catch(()=>{
    if (!content.isConnected) return;
    content.innerHTML='<p>'+esc(prose("暂时没有可用股价。","Price history is unavailable."))+
      ' <button type="button" class="quiet" data-price-years="'+years+'">'+esc(pair("重试","Retry"))+'</button></p>';
  });
}

function draw(canvas,points) {
  const {width,height}=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
  if (width<80||height<60) return;
  canvas.width=Math.round(width*dpr);
  canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext("2d"),css=getComputedStyle(canvas);
  const line=css.getPropertyValue("--accent").trim(),ink=css.getPropertyValue("--muted").trim();
  const grid=css.getPropertyValue("--plot-grid").trim()||css.getPropertyValue("--border").trim();
  const values=points.map(([,value])=>value);
  const low=Math.min(0,...values),high=Math.max(0,...values),padding=Math.max(.025,(high-low)*.08);
  const first=points[0][0],last=points.at(-1)[0],left=52,right=width-10,top=8,bottom=height-24;
  const x=stamp=>left+(stamp-first)/(last-first)*(right-left);
  const y=value=>bottom-(value-low+padding)/(high-low+2*padding)*(bottom-top);
  const pct=new Intl.NumberFormat(locale(),{style:"percent",maximumFractionDigits:1});
  ctx.scale(dpr,dpr);
  ctx.font='11px "Microsoft YaHei UI", sans-serif';
  ctx.textAlign="right";
  ctx.fillStyle=ink;
  for (const value of [low-padding,(low+high)/2,high+padding]) {
    const position=y(value);
    ctx.strokeStyle=grid;
    ctx.beginPath();ctx.moveTo(left,position);ctx.lineTo(right,position);ctx.stroke();
    ctx.fillText(pct.format(value),left-5,position+3);
  }
  const trace=()=>points.forEach(([stamp,value],index)=>index?ctx.lineTo(x(stamp),y(value)):ctx.moveTo(x(stamp),y(value)));
  ctx.beginPath();trace();ctx.lineTo(right,y(0));ctx.lineTo(left,y(0));ctx.closePath();
  ctx.fillStyle=line;ctx.globalAlpha=.15;ctx.fill();ctx.globalAlpha=1;
  ctx.beginPath();trace();ctx.lineWidth=1.7;ctx.strokeStyle=line;ctx.stroke();
  const month=new Intl.DateTimeFormat(locale(),{year:"numeric",month:"short",timeZone:"UTC"});
  ctx.fillStyle=ink;ctx.textAlign="left";ctx.fillText(month.format(first*1000),left,height-5);
  ctx.textAlign="right";ctx.fillText(month.format(last*1000),right,height-5);
  const tip=canvas.nextElementSibling?.classList.contains("stock-point")?canvas.nextElementSibling:document.createElement("span");
  tip.className="stock-point";
  if (!tip.isConnected) canvas.after(tip);
  canvas.onpointermove=event=>{
    const timestamp=first+(last-first)*Math.max(0,Math.min(1,(event.offsetX-left)/(right-left)));
    const [stamp,value]=points.reduce((best,point)=>Math.abs(point[0]-timestamp)<Math.abs(best[0]-timestamp)?point:best);
    tip.textContent=month.format(stamp*1000)+" · "+pct.format(value);
  };
  canvas.onpointerleave=()=>{tip.textContent="";};
}
