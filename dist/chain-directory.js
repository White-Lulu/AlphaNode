import {items as n, refs} from "./chain-data.js";
import {companies} from "./chain-companies.js";

const tickers={
  nvidia:"NVDA",tsmc:"TSM",asml:"ASML",hynix:"000660.KS",micron:"MU",apple:"AAPL",tesla:"TSLA",
  catl:"300750.SZ",byd:"002594.SZ",boeing:"BA",airbus:"AIR.PA",caterpillar:"CAT",deere:"DE",
  nestle:"NESN.SW NSRGY",starbucks:"SBUX",danone:"BN.PA","coca-cola":"KO",adm:"ADM",
  "fast-retailing":"9983.T FRCOY",nike:"NKE",haier:"600690.SH",rio:"RIO",mittal:"MT",basf:"BAS.DE BASFY",
  exxon:"XOM",longi:"601012.SH",vestas:"VWS.CO",
};
const profile=(name,about,sources,tickers="",website="",privateCompany=false)=>
  ({name,about,sources,tickers:tickers.split(" ").filter(Boolean),website,privateCompany});
const more={
  buhler:profile("布勒|Bühler","瑞士设备集团，提供谷物制粉、食品加工和先进材料设备。|Swiss equipment group serving grain milling, food processing and advanced materials.",["buhler","buhlerMill"],"","https://www.buhlergroup.com/",true),
  rademaker:profile("Rademaker|Rademaker","荷兰工业烘焙设备制造商，提供面包、糕点的整线设备。|Dutch manufacturer of production lines for bread and pastry.",["rademaker"],"","https://rademaker.com/"),
  kaak:profile("Royal Kaak|Royal Kaak","荷兰烘焙设备集团，提供面团处理、烤炉及整线设备。|Dutch bakery equipment group offering dough handling, ovens and production lines.",["kaak"],"","https://kaak.com/"),
  "king-arthur":profile("King Arthur Baking|King Arthur Baking","美国员工持有的烘焙品牌，销售面粉及烘焙用品，并提供烘焙教育。|Employee-owned US baking company selling flour and baking products and providing baking education.",["kingArthur","bread"],"","https://www.kingarthurbaking.com/",true),
  thermoplan:profile("Thermoplan|Thermoplan","总部位于瑞士韦吉斯，设计和制造商用全自动咖啡机，公司披露与星巴克有长期合作。|Weggis-based Swiss maker of automatic commercial coffee machines. It reports a long-standing partnership with Starbucks.",["thermoplan","thermoplanSBUX"],"","https://www.thermoplan.ch/",true),
  huhtamaki:profile("胡塔玛基|Huhtamaki","芬兰食品包装企业，产品包括热饮纸杯和杯盖。|Finnish food-packaging company whose products include hot-paper cups and lids.",["cups"],"HUH1V.HE","https://www.huhtamaki.com/"),
  siemens:profile("西门子|Siemens","工业自动化与数字化企业，其 SINUMERIK 系列提供数控机床的控制系统。|Industrial automation company whose SINUMERIK portfolio provides controls for CNC machine tools.",["siemensCnc"],"SIE.DE SIEGY","https://www.siemens.com/"),
  rockwell:profile("罗克韦尔自动化|Rockwell Automation","提供工业控制器、驱动和工厂自动化软件。|Provides industrial controllers, drives and factory automation software.",["rockwell"],"ROK","https://www.rockwellautomation.com/"),
  sumco:profile("SUMCO|SUMCO","日本硅片制造商，公开披露拉晶、切片、研磨与抛光工艺。|Japanese silicon wafer manufacturer with public documentation on crystal growth, slicing, lapping and polishing.",["sumco","wafer"],"3436.T","https://www.sumcosi.com/"),
  zeiss:profile("卡尔蔡司半导体制造技术|Carl Zeiss SMT","为光刻系统提供精密光学组件。ASML 年报披露了双方的供应关系。|Provides precision optics for lithography. ASML describes the relationship in its annual report.",["asml"],"","https://www.zeiss.com/semiconductor-manufacturing-technology/"),
  samsung:profile("三星电子|Samsung Electronics","经营晶圆代工和存储芯片业务。英伟达披露三星是其代工和存储合作方之一。|Operates foundry and memory businesses. NVIDIA discloses Samsung as one of its foundry and memory partners.",["nvidia"],"005930.KS","https://www.samsung.com/"),
  "hon-hai":profile("鸿海|Hon Hai","电子制造服务企业。英伟达列它为成品组装、测试与封装承包商之一。|Electronics manufacturing services company named by NVIDIA as a final-product assembly, test and packaging contractor.",["nvidia"],"2317.TW","https://www.honhai.com/"),
  wistron:profile("纬创|Wistron","电子与服务器制造服务企业。英伟达列它为成品承包商之一。|Electronics and server manufacturing services company named by NVIDIA as a final-product contractor.",["nvidia"],"3231.TW","https://www.wistron.com/"),
  fabrinet:profile("Fabrinet|Fabrinet","精密制造与光学封装服务商。英伟达列它为成品承包商之一。|Precision manufacturing and optical packaging services provider named by NVIDIA as a final-product contractor.",["nvidia"],"FN","https://fabrinet.com/"),
  toray:profile("东丽|Toray","日本材料企业，生产碳纤维和预浸料，披露过波音 787 复合材料供货协议。|Japanese materials company producing carbon fiber and prepreg. It disclosed a supply agreement for the Boeing 787.",["toray"],"3402.T","https://www.toray.com/"),
  "rolls-royce":profile("劳斯莱斯|Rolls-Royce","民航发动机制造商。Trent XWB 用于空客 A350。|Civil aero engine manufacturer. Its Trent XWB powers the Airbus A350.",["rr"],"RR.L RYCEY","https://www.rolls-royce.com/"),
  corning:profile("康宁|Corning","生产光纤、光缆与其他光通信材料和器件。|Manufactures fiber, fiber-optic cable and other optical communications materials and components.",["corning","corningCable"],"GLW","https://www.corning.com/"),
  "american-water":profile("美国水务|American Water","运营受监管的水务和污水处理系统，提供公共供水服务。|Operates regulated water and wastewater systems and provides public water services.",["americanWater","water"],"AWK","https://amwater.com/"),
  heidelberg:profile("海德堡材料|Heidelberg Materials","生产水泥、骨料和预拌混凝土。|Produces cement, aggregates and ready-mixed concrete.",["heidelberg","cement"],"HEI.DE","https://www.heidelbergmaterials.com/"),
  "siemens-health":profile("西门子医疗|Siemens Healthineers","提供磁共振、CT 等影像设备及相关服务。|Provides MRI, CT and other imaging systems and related services.",["imaging"],"SHL.DE SMMNY","https://www.siemens-healthineers.com/"),
  orsted:profile("沃旭能源|Ørsted","开发、建设与运营海上风电场。|Develops, constructs and operates offshore wind farms.",["orsted"],"ORSTED.CO DNNGY","https://orsted.com/"),
  lodge:profile("Lodge Cast Iron|Lodge Cast Iron","位于美国田纳西州的铸铁炊具制造商，公开介绍了熔炼、砂型浇铸和后处理工序。|Tennessee cast-iron cookware maker that publishes its melting, sand-casting and finishing steps.",["lodge"],"","https://www.lodgecastiron.com/"),
};
export const directory=new Map(companies.map(p=>[p.id,{
  ...profile(p.title,p.id==="ikea"?"宜家经营家具和家居产品的设计、采购及零售网络。|IKEA operates a furniture and home furnishings design, sourcing and retail network.":"",p.sources,
    tickers[p.id],"",p.id==="ikea"),path:p,
}]));
for (const [id,p] of Object.entries(more)) directory.set(id,p);

const disclosedNames=new Map([
  ["三星电子|Samsung Electronics",["samsung"]],["鸿海、纬创、Fabrinet|Hon Hai, Wistron, Fabrinet",["hon-hai","wistron","fabrinet"]],
  ["Carl Zeiss SMT",["zeiss"]],["东丽|Toray",["toray"]],["劳斯莱斯|Rolls-Royce",["rolls-royce"]],
]);
export const recordedOwners=stage=>directory.has(stage.owner)?[stage.owner]:(disclosedNames.get(stage.owner)??[]);

const examples=new Map([
  [n.wafer,["sumco"]],[n.flour,["adm","king-arthur"]],[n.milk,["danone"]],[n.prepreg,["toray"]],
  ["^客机|Passenger aircraft",["boeing","airbus"]],["^民航发动机|Civil aero engine",["rolls-royce"]],
  ["^挖掘机|Excavator",["caterpillar"]],["^铸铁锅|Cast-iron pan",["lodge"]],
  ["外带纸杯|Takeaway paper cup",["huhtamaki"]],["^商用咖啡机|Commercial espresso machine",["thermoplan"]],
  ["^辊式面粉机|Roller flour mill",["buhler"]],["^工业烤炉|Industrial oven",["kaak"]],
  ["^面包生产线|Bread production line",["rademaker"]],["^工业控制器|Industrial controller",["siemens","rockwell"]],
  ["运动控制软件|Motion control software",["siemens","rockwell"]],
  ["光纤|Optical fiber",["corning"]],["光缆|Fiber-optic cable",["corning"]],
  ["取用原水|Withdrawn raw water",["american-water"]],["处理后饮用水|Treated drinking water",["american-water"]],
  ["水泥熟料|Cement clinker",["heidelberg"]],["水泥|Cement",["heidelberg"]],
  ["预拌混凝土|Ready-mixed concrete",["heidelberg"]],
  ["^磁共振设备|MRI scanner",["siemens-health"]],[n.grid,["orsted"]],
]);
const producers=new Map();
for(const p of companies) for(const stage of p.steps) {
  const ids=recordedOwners(stage);
  if (ids.length) producers.set(stage.output,[...new Set([...(producers.get(stage.output)??[]),...ids])]);
}
export const productExamples=label=>[...new Set([...(examples.get(label)??[]),...(producers.get(label)??[])])];

const processExamples=[
  [/面粉机|roller mill|roller flour mill/i,["buhler"]],
  [/揉面|面包生产线|bread production line|dough mixer|dough forming/i,["rademaker","kaak"]],
  [/烤炉|试烤|industrial ovens?|proofer and oven|bake trials/i,["kaak"]],
  [/洗衣机|washing machine|laundry equipment/i,["haier"]],
  [/数控机床|CNC machine tool/i,["siemens","rockwell"]],
  [/控制系统集成|control integration|motion.control/i,["siemens","rockwell"]],
  [/烘焙机|咖啡研磨|咖啡采购|roaster|coffee grinder|green.coffee procurement/i,["nestle","starbucks"]],
  [/风场运营|wind.farm operation/i,["orsted"]],
];
export const toolExamples=label=>[...new Set(processExamples.filter(([pattern])=>pattern.test(label)).flatMap(([,ids])=>ids))];

export function stageOwners(stage) {
  const owners=recordedOwners(stage);
  if (stage.owner) return owners;
  return [...new Set([...productExamples(stage.output),...toolExamples(stage.tool)])];
}

const upstream=[
  ["starbucks","^商用咖啡机|Commercial espresso machine","thermoplan","thermoplanSBUX"],
  ["airbus","^Trent XWB 发动机|Trent XWB engine","rolls-royce","rr"],
  ["boeing",n.prepreg,"toray","toray"],
  ["hynix","内存基底裸片|Memory base die","tsmc","hynix"],
];
export function disclosedSuppliers(contexts, identity) {
  return upstream.filter(([path,item])=>contexts.some(p=>p.id===path)&&item===identity)
    .map(([, ,id,source])=>({id,ref:refs[source]}));
}
