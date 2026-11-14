const workbenchKey="industrylab-workbench-v2";
const storageKey=workbenchKey;
export const languages=[
  ["zh","简体中文"],["en","English"],["zh-en","中文（English）"],["en-zh","English（中文）"]
];
const defaults={language:"zh",hints:{},hover:true,watch:[],columns:{},presets:[],align:"finance",indentHierarchy:true,colorHierarchy:true,heat:true};
function restore() {
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)??localStorage.getItem(workbenchKey)) || {};
    if (!languages.some(([id])=>id===saved.language)) delete saved.language;
    return {...defaults,...saved};
  } catch { return {...defaults}; }
}
export const prefs=restore();
export function save() {
  try { localStorage.setItem(storageKey,JSON.stringify(prefs));return true; } catch {return false;}
}
export function locale() {return prefs.language.startsWith("en")?"en-US":"zh-CN";}
export function pair(zh,en=zh) {
  if (!en) return zh || "";
  if (!zh || zh===en) return en;
  if (prefs.language==="zh-en") return zh+"（"+en+"）";
  if (prefs.language==="en-zh") return en+" ("+zh+")";
  return prefs.language==="en"?en:zh;
}
export function prose(zh,en=zh) {
  return prefs.language.startsWith("en") ? en : zh;
}
export function paragraphs(zh,en=zh) {
  if (zh===en) return zh;
  if (prefs.language==="zh-en") return zh+"\n"+en;
  if (prefs.language==="en-zh") return en+"\n"+zh;
  return prose(zh,en);
}
const countryFormatter={zh:new Intl.DisplayNames(["zh-CN"],{type:"region"}),en:new Intl.DisplayNames(["en-US"],{type:"region"})};
export const countryName=code=>{
  if (!code) return "";
  return pair(countryFormatter.zh.of(code),countryFormatter.en.of(code));
};
export function companyLocation(row) {
  return [countryName(row.country),row.profile?.city].filter(Boolean).join(" · ");
}
export const scopeNames={
  cn:["中国大陆","Mainland China"],ex:["海外","Overseas"],world:["全球","Worldwide"],
  global:["全球","Global"],us:["美国","United States"],europe:["欧洲","Europe"],japan:["日本","Japan"],
  emerging:["新兴市场","Emerging markets"],china:["中国","China"],india:["印度","India"],anzca:["澳大利亚、新西兰和加拿大","Australia, New Zealand & Canada"]
};
export function scopeLabel(id) {
  return id && scopeNames[id] ? pair(...scopeNames[id]) : pair("未选择","None");
}
const companyZh={
  AAPL:"苹果",MSFT:"微软",NVDA:"英伟达",TSLA:"特斯拉",TSM:"台积电",ASML:"阿斯麦",
  AMZN:"亚马逊",GOOGL:"谷歌母公司 Alphabet",META:"Meta",BRK_B:"伯克希尔·哈撒韦",WMT:"沃尔玛",
  TM:"丰田汽车",HMC:"本田汽车",SONY:"索尼",NVO:"诺和诺德",NVS:"诺华",LLY:"礼来",
  INTC:"英特尔",AMD:"超威半导体",JPM:"摩根大通",KO:"可口可乐",BABA:"阿里巴巴",
  JD:"京东",PDD:"拼多多控股",BIDU:"百度",NTES:"网易",NIO:"蔚来",LI:"理想汽车",XPEV:"小鹏汽车",
  "AIR.PA":"空中客车","MC.PA":"路威酩轩","OR.PA":"欧莱雅","RMS.PA":"爱马仕",
  "005930.KS":"三星电子","000660.KS":"SK 海力士"
};
const companyEn={"005930.KS":"Samsung Electronics","000660.KS":"SK hynix",
  "002594.SZ":"BYD","600519.SH":"Kweichow Moutai","601318.SH":"Ping An Insurance",
  "000333.SZ":"Midea Group","600036.SH":"China Merchants Bank","300750.SZ":"CATL"};
const seriesEn={
  "ev-Cars":"Electric passenger cars","ev-Vans":"Electric vans","ev-Trucks":"Electric trucks",
  "ev-Buses":"Electric buses","ev-Two- and three-wheelers":"Electric two- and three-wheelers",
  "gas-us":"US motor gasoline","ama-gdp":"Gross domestic product","ama-gva":"Total value added"
};
const stateEn={TX:"Texas",CA:"California",NY:"New York",IL:"Illinois",FL:"Florida",OH:"Ohio",
  PA:"Pennsylvania",MI:"Michigan",VA:"Virginia",GA:"Georgia"};
export function companyNames(row) {
  return [row.zh || companyZh[row.code] || row.name, companyEn[row.code] || row.en || row.name];
}
export function nameOf(row) {
  if (!row) return "";
  if (row.kind==="company") {
    return pair(...companyNames(row));
  }
  const state=row.id?.match(/^power-([A-Z]{2})$/)?.[1];
  const en=row.en || seriesEn[row.id] || (state ? stateEn[state]+" retail electricity" : null);
  return pair(row.name,en || row.name);
}
export function setLanguage(value) {
  if (!languages.some(([id])=>id===value)) return;
  prefs.language=value;
  applyStatic();
  save();
}
export function applyStatic(root=document) {
  document.documentElement.lang=locale();
  document.title="AlphaNode · "+pair("全球行业数据图谱","Industry Data Atlas");
  root.querySelectorAll("[data-zh][data-en]").forEach(el=>{
    el.textContent=pair(el.dataset.zh,el.dataset.en);
  });
  root.querySelectorAll("[data-ph-zh]").forEach(el=>{
    el.placeholder=prose(el.dataset.phZh,el.dataset.phEn);
  });
  root.querySelectorAll("[data-aria-zh]").forEach(el=>{
    el.setAttribute("aria-label",pair(el.dataset.ariaZh,el.dataset.ariaEn));
  });
}
