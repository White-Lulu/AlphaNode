const minimumContrast=4;
const palettes=new Map();
const chartAssignments=new WeakMap();

function describe(rgb) {
  const [r,g,b]=rgb.map(byte=>{
    const channel=byte/255;
    return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
  });
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return {
    css:"#"+rgb.map(byte=>byte.toString(16).padStart(2,"0")).join(""),
    luminance:.2126*r+.7152*g+.0722*b,
    lab:[.2104542553*l+.793617785*m-.0040720468*s,
      1.9779984951*l-2.428592205*m+.4505937099*s,
      .0259040371*l+.7827717662*m-.808675766*s]
  };
}
function hsl(hue,saturation,lightness) {
  const chroma=saturation*(1-Math.abs(2*lightness-1));
  const channel=offset=>{
    const k=(offset+hue/30)%12;
    return Math.round(255*(lightness-chroma/2*Math.max(-1,Math.min(k-3,9-k,1))));
  };
  return [channel(0),channel(8),channel(4)];
}
const contrast=(a,b)=>(Math.max(a.luminance,b.luminance)+.05)/(Math.min(a.luminance,b.luminance)+.05);
function distance(a,b) {
  const [l,x,y]=a.lab,[otherL,otherX,otherY]=b.lab;
  return .55*(l-otherL)**2+(x-otherX)**2+(y-otherY)**2;
}
function makeCandidates() {
  const candidates=new Map();
  for (let hue=0;hue<360;hue+=3) {
    for (const saturation of [.46,.60,.74,.88,.98]) {
      for (const lightness of [.18,.25,.32,.39,.46,.53,.60,.67,.74,.81,.88]) {
        const color=describe(hsl(hue,saturation,lightness));
        const chroma=Math.hypot(color.lab[1],color.lab[2]);
        if (chroma>=.07&&chroma<=.225) candidates.set(color.css,color);
      }
    }
  }
  return [...candidates.values()];
}
const candidates=makeCandidates();

function makePalette(layers,preferred) {
  const sample=document.createElement("canvas");
  sample.width=sample.height=1;
  const ctx=sample.getContext("2d",{willReadFrequently:true});
  function paint(colors) {
    ctx.clearRect(0,0,1,1);
    for (const color of colors) {
      ctx.fillStyle=color;
      ctx.fillRect(0,0,1,1);
    }
    return describe([...ctx.getImageData(0,0,1,1).data.slice(0,3)]);
  }
  const background=paint(["#fff",...layers]);
  const seed=paint([preferred]);
  const pool=candidates.filter(color=>contrast(color,background)>=minimumContrast);
  if (!pool.length) {
    const black=describe([0,0,0]),white=describe([255,255,255]);
    pool.push(contrast(black,background)>contrast(white,background)?black:white);
  }
  const primary=contrast(seed,background)>=minimumContrast?seed:
    pool.reduce((best,color)=>distance(color,seed)<distance(best,seed)?color:best,pool[0]);
  return {pool,primary};
}

export function seriesColors(card,chart) {
  if (!chart.pins.length) return [];
  const frame=getComputedStyle(card.querySelector(".chart-frame"));
  const layers=[getComputedStyle(card.closest(".comparison,#collection")||card.parentElement).backgroundColor,getComputedStyle(card).backgroundColor,frame.backgroundColor];
  const preferred=frame.getPropertyValue("--plot-primary").trim()||"#2459cf";
  const key=[...layers,preferred].join("|");
  if (!palettes.has(key)) palettes.set(key,makePalette(layers,preferred));
  if (!chartAssignments.has(chart)) chartAssignments.set(chart,new Map());
  const contexts=chartAssignments.get(chart);
  if (!contexts.has(key)) contexts.set(key,new Map());
  const assigned=contexts.get(key),current=new Set(chart.pins);
  for (const pin of assigned.keys()) if (!current.has(pin)) assigned.delete(pin);
  const pending=chart.pins.filter(pin=>!assigned.has(pin));
  if (pending.length) {
    const {pool,primary}=palettes.get(key);
    const selected=[...assigned.values()];
    const used=new Set(selected.map(color=>color.css));
    // Keep the distance to the nearest existing series for every unused color.
    const options=pool.filter(color=>!used.has(color.css)).map(color=>({
      color, nearest:selected.reduce((best,other)=>Math.min(best,distance(color,other)),Infinity)
    }));
    for (const pin of pending) {
      let choice=primary;
      if (assigned.size) {
        let best;
        for (const option of options) if (!best||option.nearest>best.nearest) best=option;
        choice=best?.color??pool[assigned.size%pool.length];
      }
      assigned.set(pin,choice);
      for (let i=options.length-1;i>=0;i--) {
        const option=options[i];
        if (option.color.css===choice.css) options.splice(i,1);
        else option.nearest=Math.min(option.nearest,distance(option.color,choice));
      }
    }
  }
  return chart.pins.map(pin=>assigned.get(pin).css);
}
