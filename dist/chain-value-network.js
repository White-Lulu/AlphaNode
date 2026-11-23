import {makeGraph} from "./chain-graph.js";

const recipes=[
  ["agri-chemicals","farm-machinery","crops","施肥、播种与收割|Fertilizing, planting and harvesting"],
  ["crops","automation","livestock","饲料输送与自动饲喂|Feed handling and automated feeding"],
  ["timber","special-machinery","paper-packaging","制浆、抄纸与纸盒成型|Pulp, paper and carton making"],
  ["crops livestock paper-packaging","special-machinery","food","制粉、混配、烘焙与包装|Milling, blending, baking and packing"],
  ["crops paper-packaging","special-machinery","beverages","调配、杀菌与灌装|Blending, pasteurizing and bottling"],
  ["crops","special-machinery","alcohol","糖化、发酵与装瓶|Mashing, fermenting and bottling"],
  ["crops paper-packaging","special-machinery","tobacco","烟叶加工与包装|Tobacco processing and packing"],
  ["food beverages tobacco","software","general-retail","门店库存、陈列与结算|Inventory, merchandising and checkout"],
  ["food alcohol","special-machinery","restaurants","厨房备餐与出餐|Commercial cooking and meal service"],
  ["crops basic-chemicals","special-machinery","textile-inputs","纺纱、织造与染整|Spinning, weaving and finishing"],
  ["textile-inputs","special-machinery","apparel","裁剪、缝制与整烫|Cutting, sewing and pressing"],
  ["precious-metals","instruments","luxury","金属加工、镶嵌和成色检测|Metalworking, setting and assay"],
  ["timber special-chemicals","general-machinery","home-goods","木工切削、施胶和组装|Cutting, gluing and assembly"],
  ["basic-chemicals","special-machinery","personal","乳化、混配与灌装|Emulsifying, blending and filling"],
  ["textile-inputs basic-chemicals","general-machinery","sport-goods","面料缝制和树脂成型|Sewing and resin forming"],
  ["iron-steel glass electronics-components","automation","appliances","钣金、总装和检测|Sheet metal forming, assembly and testing"],
  ["cement glass construction-materials","heavy-machinery","housing","基础施工、吊装与安装|Foundation work, lifting and installation"],
  ["apparel luxury","software","specialty-retail","门店货品管理与销售|Specialty inventory and sales"],
  ["home-goods personal sport-goods","compute","online-retail","线上商品展示与订单处理|Online catalog and order processing"],
  ["oil-gas","special-machinery","refining","蒸馏、裂化和调和|Distillation, cracking and blending"],
  ["refining","special-machinery","basic-chemicals","石化裂解与聚合|Petrochemical cracking and polymerization"],
  ["coal","heavy-machinery","iron-steel","炼焦煤与物料输送支撑冶炼|Coking coal and material handling support steelmaking"],
  ["critical-metals","instruments","energy-materials","精制与正负极材料检测|Refining and testing electrode materials"],
  ["energy-materials","special-machinery","batteries","电极涂布、叠片与化成|Electrode coating, stacking and formation"],
  ["iron-steel basic-chemicals electronics-components","automation","auto-parts","车用结构件、轮胎与电子零件加工|Processing structural parts, tires and electronics"],
  ["batteries auto-parts","automation","passenger-cars","动力系统集成与整车装配|Powertrain integration and assembly"],
  ["batteries base-metals","general-machinery","mobility","电动两轮车装配|Electric two-wheeler assembly"],
  ["iron-steel auto-parts","automation","commercial-vehicles","商用车车架和动力总成装配|Commercial chassis and powertrain assembly"],
  ["iron-steel","heavy-machinery","ships","船板成型、焊接与分段吊装|Hull forming, welding and lifting"],
  ["iron-steel base-metals","heavy-machinery","rail-equipment","转向架和车体制造|Rail bogie and carriage production"],
  ["base-metals","instruments","aerospace","机身制造与精密检测|Airframe fabrication and inspection"],
  ["base-metals","general-machinery","grid-equipment","导体加工与变压器装配|Conductor forming and transformer assembly"],
  ["energy-materials grid-equipment","special-machinery","renewables-equipment","组件装配与电气集成|Module assembly and electrical integration"],
  ["passenger-cars","software","auto-retail","经销和售后管理|Dealership and after-sales management"],
  ["refining","aerospace","travel","燃料与航空运力用于旅行|Fuel and aircraft capacity support travel"],
  ["energy-materials chip-design","chip-equipment","chip-foundry","硅片结合设计，经曝光、沉积和刻蚀|Wafers and designs go through lithography, deposition and etching"],
  ["energy-materials","chip-equipment","chip-integrated","存储与集成芯片制造|Memory and integrated-chip fabrication"],
  ["chip-foundry chip-integrated","instruments","electronics-components","封测后装联和测试模组|Installing and testing packaged dies in modules"],
  ["electronics-components glass","automation","devices","组装控制板、显示屏和整机|Assembling boards, displays and devices"],
  ["electronics-components","automation","compute","板卡、存储与服务器总装|Board, storage and server assembly"],
  ["electronics-components","instruments","network-equipment","网络设备组装与联机测试|Networking assembly and connectivity tests"],
  ["software-infra","compute","software","代码构建、部署与业务系统运行|Code builds, deployment and business applications"],
  ["software-infra","compute","cyber","运行安全检测与访问防护|Running security detection and access protection"],
  ["devices","network-equipment","education","联网终端用于课堂与远程教学|Connected devices support classroom and distance learning"],
  ["devices","cyber","online-retail","商品上架与订单安全|Product listings and order security"],
  ["cement special-chemicals","special-machinery","construction-materials","配料、成型和表面处理|Batching, shaping and finishing"],
  ["iron-steel","industrial-supplies","general-machinery","工装、刀具和量具用于零件加工|Fixtures and cutting tools support machining"],
  ["iron-steel general-machinery","automation","heavy-machinery","结构焊接和液压总装|Structural welding and hydraulic assembly"],
  ["iron-steel general-machinery","automation","farm-machinery","播种机和收割机装配|Planter and harvester assembly"],
  ["base-metals electronics-components","instruments","automation","电机、传感器和机器人集成|Motor, sensor and robot integration"],
  ["general-machinery","instruments","special-machinery","专用设备标定与验证|Calibration and validation of specialized machines"],
  ["iron-steel","general-machinery","industrial-supplies","工业刀具和设施零件生产|Manufacturing cutting tools and facility components"],
  ["food alcohol","special-machinery","restaurants","用商用厨房设备备餐|Commercial kitchens prepare meals"],
  ["beverages sport-goods","software","leisure","活动物资供给与票务管理|Venue supplies and ticketing"],
  ["home-goods food","software","travel","客房配套和餐饮供给|Furnishings and meals support hospitality"],
  ["mobility","software","specialty-retail","两轮装备经专卖门店销售|Two-wheelers sell through specialty stores"],
  ["iron-steel base-metals","automation","instruments","精密部件加工与检测仪器装配|Machining precision parts and assembling instruments"],
  ["general-machinery electronics-components","instruments","chip-equipment","半导体设备的精密装配与校准|Precision assembly and calibration of chipmaking equipment"],
];

const prefix=id=>"ef-"+id;

export function valueNetwork(level,rows,direction="adaptive") {
  const byId=new Map(rows.map(row=>[row.id,row]));
  function atLevel(id,target) {
    let row=byId.get(id);
    while (row&&row.level>target) row=byId.get(row.parent);
    return row?.id;
  }
  const mark=id=>atLevel(id,1)==="ef-consumer"?"~"+id:id;
  const steps=[];
  if (level===1) steps.push({input:["ef-materials"],tool:"ef-tools",output:"~ef-consumer",
    note:"原料经设备加工成为消费产品|Equipment turns material inputs into consumer products"});
  else for (const [inputs,tool,out,note] of recipes) {
    const output=atLevel(prefix(out),level);
    const input=[...new Set(inputs.split(" ").map(item=>atLevel(prefix(item),level)))].filter(item=>item!==output);
    if (input.length) steps.push({input:input.sort().map(mark),tool:atLevel(prefix(tool),level),output:mark(output),note});
  }
  return makeGraph([{id:"panorama",steps}],{direction,inlineTools:true});
}
