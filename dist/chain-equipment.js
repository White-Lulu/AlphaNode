import {items as n, step, path} from "./chain-data.js";

const cnc="^数控机床|CNC machine tool", controls="^工业控制器|Industrial controller";
const mill="^辊式面粉机|Roller flour mill", oven="^工业烤炉|Industrial oven";
const espresso="^商用咖啡机|Commercial espresso machine";
const tools=(id,title,sources,steps)=>path(id,title,"transport",sources,steps,
  "这条支链展示设备的一般制造与配套方式。未标明供应方的投入随设备和厂区而变。|This pathway shows typical equipment manufacturing. Unassigned inputs vary by product and facility.");

const recipes={
  mill:tools("tool-mill","辊式面粉机制造|Roller flour mill manufacturing",["buhlerMill","mittal","siemensCnc"],[
    step("研磨辊与机架|Grinding rolls and frame",[n.steel,"铸锻件|Castings and forgings",cnc],"轧辊磨削、车削与机架焊接|Roll grinding, turning and frame welding"),
    step("磨机计量与驱动总成|Metering and drive assembly",[n.motor,controls,"轴承与传动件|Bearings and drive components"],"计量、传动与传感器集成|Metering, drive and sensor integration"),
    step(mill,["研磨辊与机架|Grinding rolls and frame","磨机计量与驱动总成|Metering and drive assembly"],"辊隙校准、整机装配与试磨|Roll-gap calibration, assembly and trial milling","buhler","buhlerMill"),
  ]),
  oven:tools("tool-oven","工业烤炉与面包生产线|Industrial ovens and bread lines",["kaak","rademaker","siemensCnc"],[
    step("炉体、托盘与输送件|Oven enclosure, trays and conveyors",[n.steel,"保温材料|Insulation",cnc],"钣金成型、焊接和装配|Forming, welding and assembly"),
    step("温控与驱动单元|Temperature control and drives",["温度传感器|Temperature sensors",controls,n.motor],"线束、驱动与控制程序集成|Wiring, drive and control integration"),
    step(oven,["炉体、托盘与输送件|Oven enclosure, trays and conveyors","温控与驱动单元|Temperature control and drives"],"炉体安装、温场校验和试烤|Installation, thermal calibration and bake trials","kaak","kaak"),
    step("^面包生产线|Bread production line",["面团整形设备|Dough forming equipment","输送与转接单元|Conveyors and transfer modules",controls],"分割、整形、排盘与整线集成|Dividing, forming, arranging and line integration","rademaker","rademaker"),
  ]),
  espresso:tools("tool-espresso","商用咖啡机制造|Commercial espresso machine manufacturing",["thermoplan","siemensCnc"],[
    step("锅炉、水路与冲煮组件|Boiler, water and brewing assemblies",[n.steel,"铜管与连接件|Copper tubing and fittings",cnc],"金属加工、水路连接及密封测试|Metal fabrication, plumbing and leak testing"),
    step("温压控制组件|Temperature and pressure controls",["温度和压力传感器|Temperature and pressure sensors",controls,"泵与阀|Pumps and valves"],"传感和驱动组件集成|Sensor and drive integration"),
    step(espresso,["锅炉、水路与冲煮组件|Boiler, water and brewing assemblies","温压控制组件|Temperature and pressure controls"],"模块装配、校准和出杯测试|Module assembly, calibration and beverage testing"),
  ]),
  cnc:tools("tool-cnc","数控机床制造|CNC machine tool manufacturing",["siemensCnc","mittal"],[
    step("机床床身|Machine tool bed",["铸锻件|Castings and forgings",n.steel],"铸造、去应力与精密加工|Casting, stress relief and precision machining"),
    step("主轴、导轨与伺服|Spindle, guides and servo",[n.steel,n.motor,"轴承与传动件|Bearings and drive components"],"轴承装配、校准和检测|Bearing assembly, calibration and inspection"),
    step(cnc,["机床床身|Machine tool bed","主轴、导轨与伺服|Spindle, guides and servo",controls],"运动控制集成、几何精度测试与调试|Motion-control integration, accuracy checks and commissioning"),
  ]),
  control:tools("tool-control","工业控制与自动化|Industrial controls and automation",["siemensCnc","rockwell","tsmc"],[
    step("控制电路板|Control electronics",[n.chip,n.board,"存储器与传感接口|Memory and sensor interfaces"],"贴片、焊接及电路测试|Surface mounting, soldering and circuit testing"),
    step("运动控制软件|Motion control software","设备模型与工艺参数|Machine models and process parameters","软件工程、插补算法与仿真验证|Software engineering, interpolation algorithms and simulation"),
    step(controls,["控制电路板|Control electronics","运动控制软件|Motion control software","驱动与通信接口|Drive and communications interfaces"],"控制系统集成、安全验证与调试|Control integration, safety validation and commissioning"),
  ]),
  washer:tools("tool-washer","洗衣机制造|Washing machine manufacturing",["haier","siemensCnc"],[
    step("洗衣机箱体与滚筒|Washer cabinet and drum",[n.steel,cnc],"钣金成型、滚筒加工与表面处理|Sheet forming, drum manufacture and finishing"),
    step("洗涤驱动组件|Laundry drive assembly",[n.motor,n.board,controls],"电机、泵阀与控制集成|Motor, pumps, valves and control integration"),
    step(n.washer,["洗衣机箱体与滚筒|Washer cabinet and drum","洗涤驱动组件|Laundry drive assembly"],"自动化装配、终检与包装|Automated assembly, end-of-line test and packing","haier","haier"),
  ]),
  lithography:tools("tool-lithography","光刻设备制造|Lithography equipment manufacturing",["asml","siemensCnc"],[
    step("精密光学组件|Precision optics",["光学材料|Optical materials",cnc],"光学加工与计量|Optical manufacturing and metrology","zeiss","asml"),
    step("光源与定位模块|Light source and positioning modules",["光源组件|Light source subsystem",controls],"系统装配、反馈与定位控制|Assembly, feedback and positioning"),
    step("^光刻机|Lithography system",["精密光学组件|Precision optics","光源与定位模块|Light source and positioning modules"],"系统集成、校准和现场安装|Integration, calibration and field installation","asml","asml"),
  ]),
  machine:tools("tool-machine","加工装备与装配工位|Fabrication and assembly equipment",["siemensCnc","mittal"],[
    step("装备结构件|Equipment structures",[n.steel,cnc],"机加工、钣金和连接|Machining, forming and joining"),
    step("^加工与装配设备|Fabrication and assembly equipment",["装备结构件|Equipment structures",n.motor,controls],"驱动装配、软件调试与检验|Drive assembly, software commissioning and inspection"),
  ]),
  chips:tools("tool-chips","工业设备里的芯片|Chips for industrial equipment",["minerals","wafer","tsmc","asml"],[
    step(n.silicon,n.quartz,"矿热炉与还原剂|Submerged-arc furnace and reductant"),
    step(n.poly,n.silicon,"化学纯化与沉积|Chemical purification and deposition"),
    step(n.wafer,n.poly,"拉晶、切片与抛光设备|Crystal growing, slicing and polishing"),
    step(n.chip,[n.wafer,"芯片设计与光罩|Chip design and masks","^光刻机|Lithography system"],"晶圆厂光刻、刻蚀与沉积|Fab lithography, etch and deposition"),
  ]),
};
const matchers=[
  [/面粉机|roller mill|roller flour mill|flour mill/i,"mill"],
  [/咖啡机|coffee equipment|espresso machine/i,"espresso"],
  [/烤炉|烘焙设备|面包机|industrial oven|proofer and oven|commercial.*baking|bread production line/i,"oven"],
  [/洗衣机|washing machine|laundry drive/i,"washer"],
  [/光刻机|lithography system/i,"lithography"],
  [/数控|CNC|machine tools/i,"cnc"],
  [/控制器|控制系统|industrial controller|motion.control/i,"control"],
  [/逻辑裸片|logic die/i,"chips"],
  [/机械|设备|工位|车床|工具|装配|equipment|station|machine|fixtures|assembly/i,"machine"],
];
const matchEquipment=label=>recipes[matchers.find(([pattern])=>pattern.test(label))?.[1]];
const equipmentOutput=(recipe,identity)=>recipe.steps.some(s=>s.output===identity)?identity:
  recipe.id==="tool-oven"?oven:recipe.steps.at(-1).output;

export function equipmentFor(node, currentId) {
  if (node.type==="material"&&node.identity!==n.chip) return null;
  if (node.type==="consumption") return null;
  const recipe=matchEquipment(node.label);
  if (!recipe||recipe.id===currentId) return null;
  if (node.type==="operation") {
    const output=equipmentOutput(recipe,node.identity);
    const sameTool=item=>item===output||(item.startsWith("^")&&matchEquipment(item)===recipe&&equipmentOutput(recipe,item)===output);
    if (node.stages.some(stage=>sameTool(stage.output)||stage.input.some(sameTool))) return null;
  }
  return recipe;
}

export function equipmentUpstream(recipe, node) {
  const output=equipmentOutput(recipe,node.identity);
  const inputs=new Set([output]);
  const steps=[];
  for (const s of [...recipe.steps].reverse()) {
    if (!inputs.has(s.output)) continue;
    for (const input of s.input) inputs.add(input);
    steps.unshift(s);
  }
  return [{...recipe,steps},output];
}
