import {esc,$,options,link,bindSearch} from "./model.js";
import {pair,locale,companyNames,chineseEconomyName} from "./i18n.js";
import {pagerHTML,tablePageSize} from "./screener.js";

const sectorZh={"Communication Services":"通信服务","Consumer Discretionary":"可选消费","Consumer Staples":"必需消费",
  "Energy":"能源","Financials":"金融","Health Care":"医疗健康","Industrials":"工业",
  "Information Technology":"信息技术","Materials":"材料","Real Estate":"房地产","Utilities":"公用事业"};
const industryZh={
  "Aerospace & Defense":"航空航天与国防","Airlines":"航空公司","Apparel & Luxury Goods":"服装与奢侈品",
  "Auto Parts":"汽车零部件","Automobiles":"汽车","Banks":"银行","Beverages":"饮料","Biotechnology":"生物技术",
  "Building Materials":"建筑材料","Building Products":"建筑制品","Capital Markets":"资本市场","Chemicals":"化工",
  "Commercial Services":"商业服务","Computers & Hardware":"计算机与硬件","Conglomerates":"综合企业",
  "Construction & Engineering":"建筑与工程","Consumer Lending":"消费信贷","Consumer Services":"消费者服务",
  "Diversified REITs":"多元化房地产投资信托","Electric Utilities":"电力公用事业","Electrical Equipment":"电气设备",
  "Electronic Components & Instruments":"电子元件与仪器","Entertainment":"娱乐","Fixed & Integrated Telecom":"固网与综合通信",
  "Food Products":"食品","Freight & Logistics":"货运与物流","Gas Utilities":"燃气公用事业",
  "General & Online Retail":"综合与网络零售","Grocery & Drug Retail":"食品杂货与药品零售",
  "Health Care Providers":"医疗服务机构","Health Care REITs":"医疗地产投资信托","Health Care Technology":"医疗技术",
  "Hospitality & Leisure":"酒店餐饮与休闲","Hotel REITs":"酒店地产投资信托","Household Durables":"家庭耐用品",
  "Household Products":"家居日用品","IT Services":"信息技术服务","Industrial Distribution & Rental":"工业品经销与租赁",
  "Industrial REITs":"工业地产投资信托","Insurance":"保险","Internet Media & Services":"互联网媒体与服务",
  "Leisure Products":"休闲用品","Life Science Tools":"生命科学工具","Machinery":"机械","Media":"媒体",
  "Medical Devices & Supplies":"医疗器械与耗材","Mining & Metals":"采矿与金属","Mortgage Finance":"抵押贷款融资",
  "Mortgage REITs":"抵押型房地产投资信托","Multi-Utilities":"综合公用事业",
  "Networking & Communications Equipment":"网络与通信设备","Office REITs":"办公地产投资信托",
  "Oil, Gas & Fuels":"石油、天然气与燃料","Oilfield Services & Equipment":"油田服务与设备","Packaging":"包装",
  "Paper & Wood Products":"纸品与木制品","Payments & Specialty Finance":"支付与专业金融","Personal Care":"个人护理",
  "Pharmaceuticals":"制药","Power Producers & Renewables":"发电与可再生能源","Professional Services":"专业服务",
  "Rail & Road Transport":"铁路与道路运输","Real Estate Development & Services":"房地产开发与服务",
  "Residential REITs":"住宅地产投资信托","Retail REITs":"零售地产投资信托",
  "Semiconductors & Chip Equipment":"半导体与芯片设备","Shipping":"航运","Software":"软件",
  "Specialty REITs":"专业地产投资信托","Specialty Retail":"专营零售","Tobacco":"烟草",
  "Transport Infrastructure":"运输基础设施","Water Utilities":"水务","Wholesale Distributors":"批发经销",
  "Wireless Telecom":"无线通信"
};
const englishRegion=new Intl.DisplayNames(["en-US"],{type:"region"});
const countryCodes="CN US GB DE JP KR HK MO TW BR NL FR NO CH IN CA ES IT IE BE IL DK SE FI CO AR AU ZA CL LU MX UY SG GR CY PA PH ID PE VN MY TH NZ PT TR SA AE QA KW EG MA KE NG GH PK BD LK RU UA PL CZ SK HR HU RO BG LT LV EE IS SI AT MT RS BA BY KZ UZ AM GE AZ GT DO CR SV EC BO PY VE BM KY VG BS IM JE GG PR MU SC TN DZ JO OM BH IQ IR NP MM KH MN AI BS BB BZ BW CW FK FO GF GA GI GL CI KG LR LI MK MH MC ME MZ NA PG CG SN SX SR TZ ZM".split(" ");
const countryZh=Object.fromEntries(countryCodes.map(c=>[englishRegion.of(c),chineseEconomyName(c)]));
Object.assign(countryZh,{"Taiwan":chineseEconomyName("TW"),"Hong Kong":chineseEconomyName("HK"),"Macau":chineseEconomyName("MO"),
  "Czech Republic":"捷克","United Kingdom":"英国","South Korea":"韩国","Ivory Coast":"科特迪瓦","Macedonia":"北马其顿",
  "Republic of the Congo":"刚果共和国","Turkey":"土耳其","Falkland Islands":"福克兰群岛"});
const state={q:"",country:"",sector:"",industry:"",exchange:"",status:"",matched:false,primary:false,page:0};
let data,onProfile,issuerNames;
const term=(t,map)=>t?pair(map[t]||t,t):"—";
function optionHTML(list,selected,map) {
  return options([["",pair("全部","All")],...list.map((v,i)=>[String(i),term(v,map)])],selected);
}
export function renderDirectory(input,callback,companies) {
  data=input;onProfile=callback;
  issuerNames=new Map(companies.map(row=>[row.id,companyNames(row)]));
  const el=$("directory-view");
  const field=(id,label,html)=>'<div class="control"><label for="'+id+'">'+esc(label)+'</label>'+html+'</div>';
  $("dir-search").value=state.q;
  $("directory-actions").innerHTML=
    field("dir-country",pair("目录经济体","Directory economy"),
      '<select id="dir-country">'+optionHTML(data.options.country,state.country,countryZh)+'</select>')+
    field("dir-sector",pair("目录板块","Directory sector"),'<select id="dir-sector">'+optionHTML(data.options.sector,state.sector,sectorZh)+'</select>')+
    field("dir-industry",pair("目录行业","Directory industry"),'<select id="dir-industry"></select>')+
    field("dir-exchange",pair("交易所","Exchange"),'<select id="dir-exchange">'+optionHTML(data.options.exchange,state.exchange,{})+'</select>')+
    field("dir-status",pair("上市状态","Listing status"),'<select id="dir-status">'+options([
      ["",pair("全部","All")],["active",pair("未标记退市","Not marked delisted")],["delisted",pair("已退市","Delisted")],
      ["unknown",pair("未知","Unknown")]],state.status)+'</select>')+
    '<label class="toggle"><input type="checkbox" id="dir-match"'+(state.matched?" checked":"")+'>'+
    esc(pair("仅有本地财报","Local financials only"))+'</label>'+
    '<label class="toggle"><input type="checkbox" id="dir-primary"'+(state.primary?" checked":"")+'>'+
    esc(pair("仅推定主上市","Likely primary only"))+'</label>';
  $("directory-note").innerHTML=esc(pair("证券级记录，分类采用目录原标签。","Listing-level records using the directory’s own classifications."))+
    ' '+link(data.repository,"FinanceDatabase")+' · <a href="research/FinanceDatabase-LICENSE.txt">MIT</a>';
  $("directory-results").innerHTML=
    '<div class="table-scroll" tabindex="0"><table class="directory-table"><thead><tr>'+
    [pair("证券","Security"),pair("经济体","Economy"),pair("板块／行业","Sector / industry"),pair("交易所","Exchange"),
      "ISIN",pair("状态","Status"),pair("财报","Financials")].map(s=>"<th>"+esc(s)+"</th>").join("")+
    '</tr></thead><tbody id="dir-body"></tbody></table></div><div class="table-footer">'+
    '<p id="dir-count" role="status" class="status"></p><div id="dir-pager"></div></div>';
  bindSearch($("dir-search"),value=>{state.q=value;state.page=0;},renderRows);
  setIndustryOptions();
  for (const key of ["country","sector","industry","exchange","status"]) {
    $("dir-"+key).onchange=e=>{
      state[key]=e.target.value;
      state.page=0;
      if (key==="sector") {
        state.industry="";
        setIndustryOptions();
      }
      renderRows();
    };
  }
  $("dir-match").onchange=e=>{state.matched=e.target.checked;state.page=0;renderRows();};
  $("dir-primary").onchange=e=>{state.primary=e.target.checked;state.page=0;renderRows();};
  el.onclick=e=>{
    const page=e.target.closest("[data-dir-page]");
    const profile=e.target.closest("[data-directory-profile]");
    if (page) {
      state.page=Number(page.dataset.dirPage);renderRows();
      $("dir-body").closest(".table-scroll").scrollTop=0;
    }
    if (profile) onProfile(profile.dataset.directoryProfile);
  };
  renderRows();
}
function setIndustryOptions() {
  const sector=Number(state.sector);
  const valid=state.sector==="" ? null : new Set(data.rows.filter(r=>r[3]===sector).map(r=>r[4]));
  const fields=data.options.industry.flatMap((v,i)=>!valid||valid.has(i)?[[String(i),term(v,industryZh)]]:[]);
  $("dir-industry").innerHTML=options([["",pair("全部","All")],...fields],state.industry);
}
function renderRows() {
  const q=state.q.trim().toLowerCase();
  const selected=(key,value)=>state[key]===""||Number(state[key])===value;
  const rows=data.rows.filter(([sym,name,co,sec,ind,ex,isin,flag,issuer,_group,primary])=>
    selected("country",co)&&selected("sector",sec)&&selected("industry",ind)&&selected("exchange",ex)&&(!state.matched||issuer)&&(!state.primary||primary===true)&&
    (!state.status||(state.status==="delisted"?flag===true:state.status==="active"?flag===false:flag==null))&&
    (!q||[sym,name,isin,...(issuerNames.get(issuer)||[])].some(s=>String(s||"").toLowerCase().includes(q))));
  state.page=Math.min(state.page,Math.max(0,Math.ceil(rows.length/tablePageSize)-1));
  $("dir-body").innerHTML=rows.slice(state.page*tablePageSize,(state.page+1)*tablePageSize).map(([sym,name,co,sec,ind,ex,isin,flag,issuer,_group,primary])=>
    "<tr><td><b>"+esc(sym)+"</b> <span>"+esc(name||"")+"</span></td><td>"+esc(term(data.options.country[co],countryZh))+
    "</td><td>"+esc(term(data.options.sector[sec],sectorZh))+"<br><span>"+esc(term(data.options.industry[ind],industryZh))+
    "</span></td><td>"+esc(data.options.exchange[ex]||"—")+(primary?"<br><span>"+esc(pair("推定主上市","Likely primary"))+"</span>":"")+"</td><td>"+esc(isin||"—")+"</td><td>"+
    esc(flag===true?pair("退市","Delisted"):flag===false?pair("未标记退市","Not marked delisted"):pair("未知","Unknown"))+
    '</td><td>'+(issuer?'<button class="quiet" type="button" data-directory-profile="'+esc(issuer)+'">'+esc(pair("查看财报","Open financials"))+'</button>':"—")+"</td></tr>").join("")||
    '<tr><td colspan="7" class="empty-cell">'+esc(pair("没有匹配的证券。","No listings match."))+'</td></tr>';
  $("dir-count").textContent=rows.length.toLocaleString(locale())+" / "+data.count.toLocaleString(locale())+" "+pair("条证券记录","listings");
  $("dir-pager").innerHTML=pagerHTML(state.page,rows.length,tablePageSize,"dir");
}
