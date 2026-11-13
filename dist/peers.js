import {$,esc,finite,format,unitLabel} from "./model.js";
import {pair,scopeLabel,prefs} from "./i18n.js";
import {metricLabel} from "./glossary.js";
import {columnResizeHandle} from "./layout.js";

const palette={company:"#285ad2",peer:"#148578"};
const defaultAxes=["revenue","net","grossMargin","netMargin","roe","eva"];
export const radarMetricOptions=meta=>[...new Set([...defaultAxes,...meta.finColumns])].filter(key=>meta.metrics[key]);
export function selectedRadarMetrics(meta) {
  const selected=Array.isArray(prefs.radarMetrics)?prefs.radarMetrics:defaultAxes;
  const available=new Set(radarMetricOptions(meta));
  return [...new Set(selected)].filter(key=>available.has(key));
}
let radarResize;
export let repaintPeerRadar=()=>{};

function drawAxisLabels(ctx,rows,point,radius,center,width,height,ink) {
  const labels=rows.map(({label},i)=>{
    const [x,y]=point(i,radius+12);
    return {label,x,y,side:Math.abs(x-center[0])<1?0:Math.sign(x-center[0])};
  });
  ctx.font='11px "Microsoft YaHei UI",sans-serif';
  ctx.textBaseline="middle";
  ctx.fillStyle=ink;
  ctx.textAlign="center";
  for (const {label,x,y} of labels.filter(label=>label.side===0)) ctx.fillText(label,x,y,width*.65);
  for (const side of [-1,1]) {
    const group=labels.filter(label=>label.side===side).sort((a,b)=>a.y-b.y);
    const separation=14;
    let previous=5;
    ctx.textAlign=side>0?"left":"right";
    group.forEach(({label,x,y},i)=>{
      const adjusted=Math.min(Math.max(y,previous+separation),height-18-(group.length-1-i)*separation);
      const edge=side>0?width-4:4;
      ctx.fillText(label,x,adjusted,Math.max(12,Math.abs(edge-x)));
      previous=adjusted;
    });
  }
}

function drawRadar(canvas,rows) {
  const {width,height}=canvas.getBoundingClientRect();
  if (!width || !height) return;
  const dpr=devicePixelRatio||1;
  canvas.width=Math.round(width*dpr);
  canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  const styles=getComputedStyle(canvas);
  const grid=styles.getPropertyValue("--plot-grid").trim();
  const ink=styles.getPropertyValue("--plot-ink").trim()||"#3c526d";
  const peer=styles.getPropertyValue("--radar-peer").trim()||palette.peer;
  const company=styles.getPropertyValue("--radar-company").trim()||palette.company;
  const radius=Math.min(width*.25,height*.34);
  const center=[width/2,height/2];
  const angles=rows.map((_,i)=>2*Math.PI*i/rows.length);
  const point=(i,distance)=>[center[0]+Math.sin(angles[i])*distance,center[1]-Math.cos(angles[i])*distance];
  const line=points=>{
    ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));
  };
  ctx.strokeStyle=grid||"#dbe4f1";
  for (const level of [.25,.5,.75,1]) {
    const ring=rows.map((_,i)=>point(i,radius*level));
    if (rows.length>=3) {
      line(ring);
      ctx.closePath();
      ctx.stroke();
    } else {
      for (const [x,y] of ring) {
        line([[x-4,y],[x+4,y]]);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle=grid||"#e1e8f3";
  rows.forEach((_,i)=>{
    line([center,point(i,radius)]);
    ctx.stroke();
  });
  drawAxisLabels(ctx,rows,point,radius,center,width,height,ink);
  for (const [key,color,alpha] of [["peer",peer,.133],["company",company,.16]]) {
    const points=rows.map((r,i)=>r[key]===null?null:point(i,radius*r[key]));
    ctx.strokeStyle=color;
    ctx.fillStyle=color;
    ctx.lineWidth=2;
    if (points.every(Boolean)) {
      line(points);
      if (points.length>=3) {
        ctx.closePath();
        ctx.globalAlpha=alpha;
        ctx.fill();
        ctx.globalAlpha=1;
      }
      ctx.stroke();
    } else {
      points.forEach((p,i)=>{
        const next=points[(i+1)%points.length];
        if (p&&next) {line([p,next]);ctx.stroke();}
      });
    }
    ctx.fillStyle=color;
    for (const p of points.filter(Boolean)) {
      ctx.beginPath();ctx.arc(...p,3,0,Math.PI*2);ctx.fill();
    }
  }
}

function peerComparisonTable(rows,meta) {
  const table="profile-peer-table";
  const groups=[
    [pair("本企业","Issuer"),row=>format(row.value,row.key,"level",meta)],
    [pair("同行均值","Peer mean"),row=>format(row.avg,row.key,"level",meta)],
    [pair("同业样本数","Peer count"),row=>String(row.count)]
  ];
  return '<div class="profile-table radar-values" tabindex="0" aria-label="'+esc(pair("同业对照数据","Peer comparison data"))+'">'+
    '<table id="'+table+'"><thead><tr><th scope="col">'+esc(pair("对照项","Comparison"))+
    columnResizeHandle("peer-column",table,pair("调整对照项列宽","Resize comparison label column"))+'</th>'+
    rows.map(row=>'<th scope="col">'+esc(row.label)+'<small>'+esc(unitLabel(row.key,"level",meta))+'</small></th>').join("")+
    '</tr></thead><tbody>'+groups.map(([label,value])=>'<tr><th scope="row">'+esc(label)+'</th>'+
      rows.map(row=>'<td>'+esc(value(row))+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
}

function globalPeerRank(issuers,current,axes,valueFor) {
  const totals=new Map(issuers.map(issuer=>[issuer.id,{sum:0,count:0}]));
  for (const key of axes) {
    const values=issuers.map(issuer=>({id:issuer.id,value:valueFor(issuer,key)}))
      .filter(({value})=>finite(value)).sort((a,b)=>a.value-b.value);
    if (values.length<3) continue;
    for (let start=0;start<values.length;) {
      let end=start+1;
      while (end<values.length&&values[end].value===values[start].value) end++;
      // Compare each issuer to the other issuers with an observation on this axis.
      const percentile=(start+(end-start-1)/2)/(values.length-1);
      for (let i=start;i<end;i++) {
        const total=totals.get(values[i].id);
        total.sum+=percentile;
        total.count++;
      }
      start=end;
    }
  }
  const score=totals.get(current);
  if (score.count<3) return "—";
  const peers=[...totals.values()].filter(total=>total.count>=3);
  const average=score.sum/score.count;
  const higher=peers.filter(total=>total.sum/total.count-average>1e-12).length;
  return (higher+1)+" / "+peers.length;
}

export function renderPeerRadar(row,companies,year,scope,meta,yearControl,peerIssuer=row) {
  const target=$("profile-peers");
  const scroll=target.querySelector(".radar-values")?.scrollLeft??0;
  const axes=selectedRadarMetrics(meta);
  const scoreCard=(score,position)=>'<div class="radar-score"><div><h3 id="profile-peer-score-title">'+
    esc(pair("同业综合分","Peer composite"))+'</h3><p>'+esc([scope==="world"&&position?null:scopeLabel(scope),
      position?pair("全球排名","Global rank")+" · "+position:null].filter(Boolean).join(" · "))+'</p></div>'+
    '<strong class="radar-score-value">'+score+' <small>/ 100</small></strong><div class="radar-score-side">'+yearControl+'</div></div>';
  radarResize?.disconnect();
  if (!axes.length) {
    repaintPeerRadar=()=>{};
    target.innerHTML='<div class="radar-content">'+scoreCard("—","")+'<p class="radar-method">'+
      esc(pair("在「设置」中选择同业对照指标。","Select peer comparison metrics in Settings."))+"</p></div>";
    return;
  }
  const globalPeers=companies.filter(r=>r.id!==peerIssuer.id&&r.parent===peerIssuer.parent);
  const peers=scope==="world"?globalPeers:globalPeers.filter(r=>r.region===scope);
  const valueFor=(r,k)=>r.qualityFlags?.[year]?.[k]==="grossConflict"?undefined:r.finance?.[year]?.[k];
  const rank=(value,group)=>{
    if (!finite(value)||group.length<2) return null;
    const below=group.filter(v=>v<value).length, equal=group.filter(v=>v===value).length;
    return (below+equal/2)/group.length;
  };
  const rows=axes.map(key=>{
    const value=valueFor(row,key),group=peers.map(r=>valueFor(r,key)).filter(finite);
    const avg=group.length?group.reduce((total,v)=>total+v,0)/group.length:undefined;
    const label=key==="eva"?pair("EVA 估算","Estimated EVA"):metricLabel(key,meta);
    return {key,label,value,avg,count:group.length,company:rank(value,group),peer:rank(avg,group)};
  });
  const available=rows.map(r=>r.company).filter(finite);
  const score=available.length>=3?Math.round(100*available.reduce((sum,v)=>sum+v,0)/available.length):"—";
  const position=globalPeerRank([...globalPeers,{...row,id:peerIssuer.id}],peerIssuer.id,axes,valueFor);
  const height=Math.max(185,rows.length*11+36);
  target.innerHTML='<div class="radar-content">'+scoreCard(score,position)+
    '<p class="radar-legend"><span class="radar-issuer">'+esc(pair("本企业","Issuer"))+
    '</span><span class="radar-peer">'+esc(pair("同行均值","Peer mean"))+'</span></p>'+
    '<canvas class="radar-chart" style="height:'+height+'px" role="img" aria-label="'+esc(pair(rows.length+" 项同业分位雷达图","Peer percentile radar with "+rows.length+" metrics"))+'"></canvas>'+
    peerComparisonTable(rows,meta)+'<p class="radar-method">'+
    esc(pair("同行线为同年同组等权均值的分位。综合分取所选有效指标的数值分位均值，至少需要三项。全球排名按同年同组达到计分条件的企业计算，并列同名次。",
      "The peer line plots the percentile of each same-year, same-group mean. The composite averages the selected numeric percentiles and requires at least three valid metrics. Global rank includes all eligible issuers in the same group and year, with equal scores sharing a rank."))+'</p></div>';
  target.querySelector(".radar-values").scrollLeft=scroll;
  const canvas=target.querySelector("canvas");
  repaintPeerRadar=()=>{if (canvas.isConnected) drawRadar(canvas,rows);};
  repaintPeerRadar();
  if (typeof ResizeObserver==="function") {
    radarResize=new ResizeObserver(()=>drawRadar(canvas,rows));
    radarResize.observe(canvas);
  }
}
