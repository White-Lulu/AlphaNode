import {prefs,pair,paragraphs,locale,save} from "./i18n.js";
import {$,esc} from "./model.js";

export const glossary={
  peerRadar:["同业综合分","Peer composite","取同年、同组和所选地域内其他企业的分位参考。所选指标至少有三项可比才计算综合分。","Uses other issuers in the same year, industry group and geography. At least three comparable selected percentiles are required.","综合分 = 四舍五入(100 × 所选有效指标的平均分位)","Composite = round(100 × mean of selected valid percentiles)"],
  equityMultiplier:["杜邦权益乘数","DuPont equity multiplier","平均总资产除以平均归母权益。用于拆解净资产收益率。","Average total assets divided by average equity attributable to owners.","权益乘数 = 平均总资产 ÷ 平均归母权益","Equity multiplier = average assets ÷ average equity attributable to owners"],
  dupontRoe:["杜邦 ROE","DuPont ROE","净利率 × 总资产周转率 × 权益乘数。三个分项在同一财年计算。","Net margin × asset turnover × equity multiplier. All three components use the same fiscal year.","杜邦 ROE = 净利率 × 总资产周转率 × 权益乘数","DuPont ROE = net margin × asset turnover × equity multiplier"],
  altmanZ2:["Altman Z″","Altman Z″","基于营运资本、留存收益、经营利润和账面权益的财务压力指标。适用于有可比字段的非金融企业。","A financial distress indicator based on working capital, retained earnings, operating profit and book equity. Used for nonfinancial issuers with comparable inputs.","Z″ = 6.56 × (营运资本 ÷ 总资产) + 3.26 × (留存收益 ÷ 总资产) + 6.72 × (经营利润 ÷ 总资产) + 1.05 × (账面权益 ÷ 总负债)\n营运资本 = 流动资产 − 流动负债","Z″ = 6.56 × (working capital ÷ assets) + 3.26 × (retained earnings ÷ assets) + 6.72 × (operating profit ÷ assets) + 1.05 × (book equity ÷ liabilities)\nWorking capital = current assets − current liabilities"],
  zmijewski:["Zmijewski X","Zmijewski X","用期末资产收益率、总负债率和流动比率估计财务压力。较高的分数表示模型指示的压力较大。","Uses return on ending assets, liabilities to assets and current ratio. Higher values indicate more model-implied distress.","X = −4.336 − 4.513 × (净利润 ÷ 期末总资产) + 5.679 × (总负债 ÷ 总资产) + 0.004 × 流动比率","X = −4.336 − 4.513 × (net income ÷ ending assets) + 5.679 × (total liabilities ÷ assets) + 0.004 × current ratio"],
  treasury2:["两年期收益率","2-year yield","所选市场每年最后一个可同时取得两年期和十年期收益率的观测。","The last observation of each year with both 2-year and 10-year yields available in the selected market.","两年期收益率 = 两种期限均有数据的年内最后交易日的两年期值","2Y yield = 2Y observation on the last date of the year with both maturities available"],
  treasury10:["十年期收益率","10-year yield","与两年期同一交易日的十年期基准收益率。","10-year benchmark yield on the same date as the 2-year observation.","十年期收益率 = 与两年期同日的十年期值","10Y yield = 10Y observation on the same date as the 2Y observation"],
  yieldSlope:["10 年−2 年利差","10Y − 2Y spread","十年期收益率减两年期收益率，以百分点表示。","10-year yield less 2-year yield, in percentage points.","期限利差 = 十年期收益率 − 两年期收益率","Yield spread = 10Y yield − 2Y yield"],
  chartBaseline:["图表基年","Chart baseline","对同一个基年比较各序列。使用基年为正的序列，计算本年值除以基年值再减一。","Compares series against a common base year. Each needs a positive base value. Values are divided by their base and reduced by one.","相对基年变化 = 本年值 ÷ 基年值 − 1（基年值 > 0）","Change from baseline = current year ÷ base year − 1 (base year value > 0)"],
  advancedScreen:["高级筛选表达式","Advanced screening expression","对选定年度的原始财务值使用 AND、OR、NOT、IN 组合条件。表达式与上方可视化规则同时生效。","Combine annual financial values with AND, OR, NOT and IN. The expression is applied together with the visual rules.","命中 = 可视化规则全部成立 ∧ 高级表达式成立","Match = all visual rules pass ∧ advanced expression passes"],
  primaryListing:["推定主上市","Likely primary listing","FinanceDatabase 根据上市地、币种、名称和可识别的交叉上市关系推断。可筛选推定主上市记录。","Inferred by FinanceDatabase using exchange, currency, name and identifiable cross-listing relationships.","主上市标记 = FinanceDatabase 推断(上市地, 币种, 名称, 交叉上市关系)","Primary listing flag = FinanceDatabase inference(exchange, currency, name, cross-listings)"],
  revenue:["营收","Revenue","财报中的营业收入。企业金额以当年平均汇率折算现价美元。","Reported operating revenue. Company values are translated to current USD at the annual average FX rate.","营收（美元）= 财报营业收入 ÷ 年均汇率","Revenue (USD) = reported revenue ÷ annual average FX rate"],
  net:["净利润","Net income","扣除各项成本、费用和所得税后的利润。优先采用归母净利润。","Profit after costs, expenses and tax. Profit attributable to owners is preferred when available.","净利润（美元）= 净利润原值 ÷ 年均汇率","Net income (USD) = reported net income ÷ annual average FX rate"],
  grossMargin:["毛利率","Gross margin","毛利润除以营收，衡量扣除直接成本后剩余的收入比例。","Gross profit divided by revenue. It measures the share left after direct costs.","毛利率 = 毛利润 ÷ 营收","Gross margin = gross profit ÷ revenue"],
  netMargin:["净利率","Net margin","净利润除以营收。负值表示企业当年亏损。","Net income divided by revenue. A negative value indicates a loss.","净利率 = 净利润 ÷ 营收","Net margin = net income ÷ revenue"],
  grossProfit:["毛利润","Gross profit","营业收入减营业成本，优先使用财报披露的毛利润。","Revenue less cost of revenue. The reported gross profit takes precedence.","毛利润 = 披露毛利润；缺失时 = 营收 − 营业成本","Gross profit = reported gross profit, or revenue − cost of revenue if missing"],
  operatingMargin:["经营利润率","Operating margin","经营利润除以营收，反映主营经营活动的盈利水平。","Operating profit divided by revenue.","经营利润率 = 经营利润 ÷ 营收","Operating margin = operating profit ÷ revenue"],
  ebit:["经营利润","Operating profit","采用披露经营利润。部分 A 股样本按收入和主要营业成本费用估算。","Uses reported operating profit. Some A-share values are estimated from sales and main operating expenses.","经营利润（美元）= 经营利润原值 ÷ 年均汇率","Operating profit (USD) = operating profit in reporting currency ÷ annual average FX rate"],
  assets:["总资产","Total assets","企业在财年末确认的资产总额。","Total assets recognized at the fiscal year end.","总资产（美元）= 财年末总资产 ÷ 年均汇率","Total assets (USD) = fiscal year-end assets ÷ annual average FX rate"],
  roe:["净资产收益率","ROE","净利润除以期初和期末平均归母权益。权益非正时留空。","Net income divided by average opening and closing equity attributable to owners. Requires positive equity.","ROE = 净利润 ÷ [(期初归母权益 + 期末归母权益) ÷ 2]","ROE = net income ÷ [(opening equity + closing equity attributable to owners) ÷ 2]"],
  roa:["总资产收益率","ROA","净利润除以期初期末平均总资产。","Net income divided by average opening and closing total assets.","ROA = 净利润 ÷ [(期初总资产 + 期末总资产) ÷ 2]","ROA = net income ÷ [(opening assets + closing assets) ÷ 2]"],
  roic:["投入资本回报率","ROIC","税后经营利润除以平均投入资本。投入资本估算为权益加有息债务减现金。","After-tax operating profit divided by average invested capital. Invested capital is approximated as equity plus interest-bearing debt less cash.","ROIC = 税后经营利润 ÷ 平均投入资本\n投入资本 ≈ 权益 + 有息债务 − 现金","ROIC = NOPAT ÷ average invested capital\nInvested capital ≈ equity + interest-bearing debt − cash"],
  wacc:["资本成本基准","WACC benchmark","企业视图使用 Damodaran 全球同业美元资本成本。基准视图展示所选区域原表数值。","The company view uses Damodaran’s global sector USD cost of capital. The benchmark view uses the chosen region’s published estimate.","企业 WACC = Damodaran 全球对应行业的美元资本成本","Company WACC = Damodaran global USD cost of capital for the corresponding industry"],
  spread:["超额资本回报","ROIC − WACC","投入资本回报率减资本成本基准，以百分点表示。","Return on invested capital minus the cost-of-capital benchmark, in percentage points.","超额资本回报 = ROIC − WACC","Return spread = ROIC − WACC"],
  eva:["经济增加值","EVA","企业估算为税后经营利润减投入资本费用。基准视图使用原表金额。","Company estimate of after-tax operating profit less the capital charge. The benchmark view uses the published amount.","企业 EVA ≈ 税后经营利润 − 平均投入资本 × WACC","Company EVA ≈ NOPAT − average invested capital × WACC"],
  nopat:["税后经营利润","NOPAT","经营利润乘以一减有效所得税率，缺少可靠税率时留空。","Operating profit multiplied by one minus the effective tax rate. Requires a valid tax rate.","NOPAT = 经营利润 × (1 − 有效所得税率)","NOPAT = operating profit × (1 − effective income tax rate)"],
  ocf:["经营现金流","Operating cash flow","财报中经营活动产生的净现金流。","Net cash provided by operating activities as reported.","经营现金流 = 财报经营活动现金流入 − 经营活动现金流出","Operating cash flow = operating cash inflows − operating cash outflows"],
  capex:["资本开支","Capital expenditure","用于购置固定资产等长期资产的现金支出，以正数显示。A 股与 IFRS 标签范围可能不同。","Cash paid for property and other long-lived operating assets, shown as a positive outflow. Tag scope can differ by reporting standard.","资本开支 = abs(购置长期资产的现金支出)","Capex = abs(cash paid for long-lived assets)"],
  fcf:["自由现金流","Free cash flow","经营现金流减资本开支。需要两项原始数据。","Operating cash flow less capital expenditure. Both inputs are required.","自由现金流 = 经营现金流 − 资本开支","Free cash flow = operating cash flow − capital expenditure"],
  fcfMargin:["自由现金流率","FCF margin","自由现金流除以正的营收。","Free cash flow divided by positive revenue.","自由现金流率 = 自由现金流 ÷ 营收（营收 > 0）","FCF margin = free cash flow ÷ revenue (revenue > 0)"],
  cashConversion:["现金利润比","Cash conversion","经营现金流除以正的净利润。可用于观察利润与现金的匹配程度。","Operating cash flow divided by positive net income, a measure of how earnings translate to cash.","现金利润比 = 经营现金流 ÷ 净利润（净利润 > 0）","Cash conversion = operating cash flow ÷ net income (net income > 0)"],
  ebitda:["EBITDA 估算","Estimated EBITDA","经营利润加披露折旧和摊销。采用可识别的报表字段。","Operating profit plus reported depreciation and amortization, using identifiable statement items.","EBITDA ≈ 经营利润 + 折旧 + 摊销","EBITDA ≈ operating profit + depreciation + amortization"],
  ebitdaMargin:["EBITDA 利润率","EBITDA margin","估算 EBITDA 除以营收。行业基准采用来源定义。","Estimated EBITDA divided by revenue. Industry benchmarks follow the source definition.","EBITDA 利润率 = 估算 EBITDA ÷ 营收","EBITDA margin = estimated EBITDA ÷ revenue"],
  assetTurnover:["总资产周转率","Asset turnover","营收除以平均总资产。","Revenue divided by average total assets.","总资产周转率 = 营收 ÷ 平均总资产","Asset turnover = revenue ÷ average total assets"],
  debtAssets:["有息负债率","Debt to assets","可识别有息债务除以总资产。颜色按低值更红显示。","Identified interest-bearing debt divided by total assets. Lower values use warmer colors.","有息负债率 = 可识别有息债务 ÷ 总资产","Debt to assets = identified interest-bearing debt ÷ total assets"],
  currentRatio:["流动比率","Current ratio","流动资产除以正的流动负债。","Current assets divided by positive current liabilities.","流动比率 = 流动资产 ÷ 流动负债（流动负债 > 0）","Current ratio = current assets ÷ current liabilities (current liabilities > 0)"],
  quickRatio:["速动比率","Quick ratio","本项目采用流动资产减存货后除以流动负债。","This implementation divides current assets less inventory by current liabilities.","速动比率 = (流动资产 − 存货) ÷ 流动负债","Quick ratio = (current assets − inventory) ÷ current liabilities"],
  interestCover:["利息保障倍数","Interest coverage","经营利润除以正的利息费用。分母按披露定义。","Operating profit divided by positive interest expense, as tagged in the filing.","利息保障倍数 = 经营利润 ÷ 利息费用（利息费用 > 0）","Interest coverage = operating profit ÷ interest expense (interest expense > 0)"],
  researchIntensity:["研发强度","R&D intensity","披露的研发费用除以营收。","Reported research and development expense divided by revenue.","研发强度 = 研发费用 ÷ 营收","R&D intensity = R&D expense ÷ revenue"],
  capitalIntensity:["资本开支率","Capex intensity","资本开支除以营收。其合理范围因行业而异。","Capital expenditure divided by revenue. Interpretation varies by industry.","资本开支率 = 资本开支 ÷ 营收","Capex intensity = capital expenditure ÷ revenue"],
  firms:["基准样本企业数","Benchmark firms","Damodaran 原表纳入的上市公司数。","Company count in the published Damodaran sample.","基准企业数 = Damodaran 原表的样本公司数","Benchmark firms = company count in the published Damodaran sample"],
  output:["工业产出","Industrial output","官方调查统计的生产活动产出，具体范围和计价见来源。","Production output measured by the official survey. See the source for scope and valuation.","工业产出 = 官方统计范围内的工业生产产出","Industrial output = production output within the official survey scope"],
  valueAdded:["增加值","Value added","生产活动的产出扣除中间投入后的新增价值。","Value generated by production after subtracting intermediate inputs.","增加值 = 总产出 − 中间投入","Value added = gross output − intermediate consumption"],
  vaShare:["增加值占比","Share of value added","本行增加值在同地域全经济增加值中的比例。","Share of this series in total value added for the same geography.","增加值占比 = 本行增加值 ÷ 同地域全经济增加值","Share of value added = this series’ value added ÷ total value added in the same geography"],
  employment:["就业人数","Employment","统计来源覆盖的就业人数。","Number of persons employed within the source coverage.","就业人数 = 官方统计范围内的就业人口数","Employment = count of persons employed within the official survey scope"],
  enterprises:["企业数","Enterprises","统计调查计入的企业单位数。","Number of enterprises counted by the statistical survey.","企业数 = 官方统计范围内的企业单位数","Enterprises = count of enterprises within the official survey scope"],
  officialRevenue:["统计营业收入","Published turnover","官方调查覆盖范围内的营业额。各来源的行业和调查边界不同。","Turnover for the source’s statistical universe. Industry and survey boundaries vary by source.","统计营业收入 = 官方发布的调查范围内营业额","Published turnover = official turnover within the survey scope"],
  officialCost:["统计营业成本","Published operating cost","官方公告统计的营业成本。","Operating cost in the official release.","统计营业成本 = 官方发布的调查范围内营业成本","Published operating cost = official operating cost within the survey scope"],
  officialGrowth:["官方营收同比","Published turnover growth","统计机构公布的可比标准增长率。调查样本变化时可能与公布总额直接相除的结果不同。","Year-on-year change published on a comparable survey basis. It can differ from the ratio of reported totals.","官方营收同比 = 本年可比营收 ÷ 上年可比营收 − 1","Published turnover growth = current comparable turnover ÷ prior comparable turnover − 1"],
  pretaxProfit:["利润总额（税前）","Profit before tax","统计公告中的税前利润总额。","Aggregate profit before tax in the statistical release.","利润总额 = 官方公布的税前利润合计","Profit before tax = officially published aggregate pre-tax profit"],
  pretaxMargin:["税前利润率","Pre-tax margin","利润总额除以统计营业收入。","Profit before tax divided by published turnover.","税前利润率 = 利润总额 ÷ 统计营业收入","Pre-tax margin = profit before tax ÷ published turnover"],
  grossSurplus:["营业盈余","Gross operating surplus","官方商业统计定义的营业盈余，来源详列在单元格。","Operating surplus under the official business statistics definition.","营业盈余 = 官方统计公布的营业盈余","Operating surplus = officially published gross operating surplus"],
  surplusMargin:["营业盈余率","Operating surplus margin","营业盈余除以营业收入。","Gross operating surplus divided by turnover.","营业盈余率 = 营业盈余 ÷ 营业收入","Operating surplus margin = gross operating surplus ÷ turnover"],
  gdp:["国内生产总值","GDP","统计地区在一年内生产的最终产品和服务价值。","Value of final goods and services produced within the area in a year.","GDP（生产法）= 各行业增加值合计 + 产品税净额","GDP (production approach) = sum of industry value added + net taxes on products"],
  penetration:["新车渗透率","EV sales penetration","新售电动车占该类新车总销量的比例。","Electric vehicles as a share of new sales in the same vehicle class.","新车渗透率 = 新售电动车数 ÷ 同类新车销量","EV sales penetration = new EV sales ÷ all new sales in the same vehicle class"],
  stockPenetration:["保有量渗透率","EV fleet penetration","电动车存量占该类车辆保有总量的比例。","Electric vehicles as a share of the registered fleet in the same vehicle class.","保有量渗透率 = 电动车保有量 ÷ 同类车辆保有总量","EV fleet penetration = EV stock ÷ total fleet in the same vehicle class"],
  evSales:["电动车销量","EV sales","国际能源署统计的新售电动车数量。","New electric vehicle sales as reported by the IEA.","电动车销量 = IEA 统计的新售电动车数量","EV sales = count of new EVs sold, as reported by the IEA"],
  evStock:["电动车保有量","EV stock","国际能源署统计的在用电动车存量。","Electric vehicle stock in use as reported by the IEA.","电动车保有量 = IEA 统计的在用电动车数量","EV stock = count of EVs in use, as reported by the IEA"],
  marketShare:["市占率","Market share","所选企业或报告主体的产品销量占定义市场总量的比例。","An entity’s sales volume as a share of the defined market total.","市占率 = 主体产品销量 ÷ 所定义市场总销量","Market share = entity sales volume ÷ defined market sales volume"],
  hhi:["市场集中度","HHI","各市场主体份额平方之和，按 0 到 10,000 点显示。EIA 使用可归属售电量。","Sum of squared percentage market shares, from 0 to 10,000. EIA series use attributable retail sales.","HHI = 10,000 × Σ[(主体销量 ÷ 纳入计算的总销量)²]","HHI = 10,000 × Σ[(entity sales ÷ sales included in the calculation)²]"],
  retailVolume:["终端售电量","Retail electricity sales","售给最终用户的电力，按太瓦时显示。","Electricity sold to end users, shown in terawatt-hours.","终端售电量（TWh）= 售予最终用户的电量（MWh）÷ 1,000,000","Retail sales (TWh) = electricity sold to end users (MWh) ÷ 1,000,000"],
  assignedCoverage:["可归属销量占比","Attributable share","可归属给售电报告主体的销量占州级总量的比例。","Share of statewide sales attributable to identified reporting entities.","可归属销量占比 = 可归属售电量 ÷ 州级售电总量","Attributable share = attributable retail sales ÷ total statewide retail sales"],
  providers:["售电主体数","Reporting entities","纳入计算且报告了正销量的 EIA ID 数。","Count of EIA IDs with positive sales included in the calculation.","售电主体数 = 纳入统计且销量 > 0 的不同 EIA ID 数","Reporting entities = count of distinct included EIA IDs with sales > 0"],
  elasticity:["需求价格弹性","Price elasticity","需求量对价格变动的响应。本项目的汽油序列为滚动回归估计。","Quantity response to a change in price. The gasoline series is a rolling regression estimate.","ln(供应量) = 常数 + β × ln(实际价格) + 月份效应 + 时间趋势 + 残差\n弹性 = β","ln(volume) = intercept + β × ln(real price) + month effects + time trend + residual\nElasticity = β"],
  gasPrice:["汽油价格","Gasoline price","来源发布的美国汽油零售价。","Published US retail gasoline price.","年均汽油价格 = Σ(月度名义零售价) ÷ 12","Annual gasoline price = Σ(monthly nominal retail price) ÷ 12"],
  gasVolume:["汽油供应量","Gasoline supplied","美国 EIA 的汽油产品供应量，作为需求代理。","EIA product supplied, used as a proxy for US gasoline demand.","年均汽油供应量 = Σ(月均日供应量) ÷ 12","Annual gasoline supplied = Σ(monthly average daily volumes) ÷ 12"],
  isic:["国际标准产业分类","ISIC Rev.4","联合国按经济活动定义的分类体系。此处展示门类、大类和组。","The UN classification of economic activities. This workbench shows sections, divisions and groups.","产业分类路径 = 门类 → 大类 → 组","Industry classification path = section → division → group"],
  yoy:["同比","Year-on-year change","金额和数量用本年除以上年再减一。比例使用百分点差。","For amounts and counts, current divided by prior less one. For percentages, uses the difference in percentage points.","金额与数量同比 = 本年值 ÷ 上年值 − 1\n比例同比（百分点）= 本年百分比 − 上年百分比","YoY for amounts and counts = current year ÷ prior year − 1\nYoY for percentages (pp) = current percentage − prior percentage"],
  cagr:["复合年增长率","CAGR","期末正值除以期初正值，按经过的年数开方后减一。适用于金额和数量。","Ending positive amount divided by the positive starting amount, raised to one over elapsed years, less one. Applies to amounts and counts.","CAGR = (期末值 ÷ 期初值)^(1 ÷ 间隔年数) − 1","CAGR = (end value ÷ start value)^(1 ÷ elapsed years) − 1"],
  avg:["历史均值","Historical average","在所选窗口内对逐年数值等权平均，要求每个年度都有有效值。","Arithmetic mean of annual values, requiring an observation for every year of the selected window.","历史均值 = Σ(窗口内各年数值) ÷ 年数","Historical average = Σ(annual values within window) ÷ number of years"],
  vol:["同比波动","YoY volatility","最近五年同比变化的样本标准差，至少需三次有效变化。","Sample standard deviation of up to five YoY changes. Requires at least three valid changes.","同比波动 = √[Σ(同比 − 平均同比)² ÷ (有效次数 − 1)]","YoY volatility = √[Σ(YoY − mean YoY)² ÷ (valid changes − 1)]"],
  peer:["同业分位","Peer percentile","同一行业组、所选地域和同一年度的有效样本相对位置。使用并列中位排名，至少五家。","Relative position within the same industry group, selected geography and year. Uses midranks and requires at least five observations.","同业分位 = (较低值数量 + 0.5 × 并列数量) ÷ 有效样本数","Peer percentile = (count below + 0.5 × count tied) ÷ valid sample size"],
  screening:["筛选规则","Screening rule","按指定指标及时间基准筛选企业。多条规则同时满足。","Filters issuers on a metric and time transformation. All rules must match.","命中 = 规则 1 ∧ 规则 2 ∧ … ∧ 规则 n","Match = rule 1 ∧ rule 2 ∧ … ∧ rule n"],
  aggregate:["样本聚合","Sample aggregation","金额可以加总。比率按相关分母加权，也可选择企业等权均值。","Amounts can be summed. Ratios are weighted by their relevant denominators or shown as equal-weight averages.","金额合计 = Σ(企业金额)\n加权比率 = Σ(企业比率 × 权重) ÷ Σ(权重)\n等权均值 = Σ(企业值) ÷ 有效企业数","Total amount = Σ(company amounts)\nWeighted ratio = Σ(company ratio × weight) ÷ Σ(weights)\nEqual-weight mean = Σ(company values) ÷ count of valid companies"],
  directory:["证券目录","Securities directory","目录记录可能包含多地上市、退市或状态未知的证券。财报按钮仅在匹配到本地发行人时显示。","Listings can include cross-listings, delisted securities and unknown status. The financials button appears for matched local issuers.","可查看财报 ⇔ 证券记录匹配本地发行人","Financials available ⇔ listing matches a local issuer"],
  benchmark:["行业基准","Industry benchmark","Damodaran 按其行业及区域定义发布的样本数据，年度标签对应次年年初快照。","Damodaran’s regional industry samples in its own taxonomy. The year label corresponds to the snapshot at the start of the following year.","行业基准(行业, 地区, 年度) = Damodaran 次年年初快照中的对应值","Benchmark(industry, region, year) = corresponding Damodaran value from the next year’s opening snapshot"]
};
export function metricLabel(key,meta) {
  return glossary[key] ? pair(...glossary[key].slice(0,2)) : meta?.metrics[key]?pair(meta.metrics[key][0],meta.metrics[key][2]):key;
}
export function bindGlossary() {
  const tip=$("term-tooltip");
  let trigger=null;
  function close() {
    trigger=null; tip.hidden=true;
    if (tip.parentElement!==document.body) document.body.appendChild(tip);
  }
  function open(btn) {
    const key=btn.dataset.termHover;
    const entry=prefs.hints[key]===false?null:glossary[key];
    if (!entry) return;
    const surface=btn.closest("dialog[open]") || document.body;
    if (tip.parentElement!==surface) surface.appendChild(tip);
    trigger=btn;
    const [zh,en,descriptionZh,descriptionEn,formulaZh,formulaEn]=entry;
    tip.innerHTML="<strong>"+esc(pair(zh,en))+'</strong><p class="term-formula">'+
      esc(paragraphs(formulaZh,formulaEn))+"</p><p>"+esc(paragraphs(descriptionZh,descriptionEn))+"</p>";
    tip.hidden=false;
    const r=btn.getBoundingClientRect();
    tip.style.left=Math.max(8,Math.min(r.left-12,innerWidth-tip.offsetWidth-12))+"px";
    tip.style.top=(r.bottom+tip.offsetHeight+9<innerHeight ? r.bottom+7 : Math.max(8,r.top-tip.offsetHeight-7))+"px";
  }
  document.addEventListener("pointerover",event=>{
    const btn=event.target.closest?.("[data-term-hover]");
    if (btn && prefs.hover && event.pointerType!=="touch") open(btn);
  });
  document.addEventListener("pointerout",event=>{
    if (event.target.closest?.("[data-term-hover]")) close();
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape") close();});
  document.addEventListener("scroll",()=>{if(trigger) close();},true);
  return close;
}
export function renderGlossarySettings(query="") {
  const target=$("term-list");
  const q=query.trim().toLowerCase();
  target.innerHTML=Object.entries(glossary).filter(([id,v])=>[id,...v.slice(0,2)].join(" ").toLowerCase().includes(q))
    .sort((a,b)=>pair(a[1][0],a[1][1]).localeCompare(pair(b[1][0],b[1][1]),locale()))
    .map(([id,[zh,en,,,formulaZh,formulaEn]])=>'<div class="term-card"><label><input type="checkbox" data-hint="'+esc(id)+'"'+
      (prefs.hints[id]===false?"":" checked")+">"+esc(pair(zh,en))+'</label><p class="term-formula">'+
      esc(paragraphs(formulaZh,formulaEn))+'</p></div>').join("");
}
export function setAllHints(enabled) {
  prefs.hints=Object.fromEntries(Object.keys(glossary).map(key=>[key,enabled]));
  save();
}
