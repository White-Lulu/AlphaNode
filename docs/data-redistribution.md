# 第三方数据使用与再分发

核对日期为 2026 年 11 月 15 日。Git 仓库和 GitHub 源码包未打包生成的财务、统计和行情文件。公开站点会向浏览器发送整理后的数据，下载包和表格 CSV 也可能包含来源原值。AlphaNode 的 MIT 许可证适用于自有代码，各数据来源另有条款。

## 需要优先确认的来源

| 来源 | 项目如何使用 | 核对结果 |
| --- | --- | --- |
| IEA 电动车 | 从 IEA 的 CSV 接口取得全球和中国的历史销量、保有量及占比，转换比例并估算海外数据。已在公开站点的产品市场 JSON 查到多年数值。 | [Global EV Data Explorer](https://www.iea.org/data-and-statistics/data-tools/global-ev-data-explorer) 标注 CC BY 4.0，[Global EV Outlook 2026 独立数据包](https://www.iea.org/data-and-statistics/data-product/global-ev-outlook-2026) 标注 Non-CC。未找到 IEA 对项目所用 CSV 端点及全部字段的单独许可说明。若这些字段适用 CC BY 4.0，应补来源、许可链接、修改说明及 IEA 要求的衍生结果声明。标注为第三方所有的内容需单独核对。若适用 Non-CC，公开提供超过五个可提取的原始数值超出了小量原值豁免，需要授权。 [IEA 对 CC 内容的要求](https://www.iea.org/terms/creative-commons-cc-licenses) · [Non-CC 条款](https://www.iea.org/terms/terms-of-use-for-non-cc-material) |
| Yahoo Finance | 服务端按需取周频复权序列。实测公开接口返回苹果的 523 个周频点和最新价格。 | Yahoo 条款要求自动采集取得事先明确许可。若无单独授权，当前取数方式与条款冲突。 [Yahoo 服务条款](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html?bt_ts=1741912561771) |
| 东方财富及其他财报入口 | 部分年度财务数据来自东方财富结构化接口，也使用巨潮、ESEF 和发行人披露。 | 东方财富网站声明要求内容再利用取得事先书面许可。尚未查到所用接口的批量再分发许可。需要分别识别平台整理值和发行人原始披露，并核对巨潮、ESEF 和交易所的具体来源。 [东方财富法律声明](https://about.eastmoney.com/home/legal) · [ESEF 文件索引说明](https://filings.xbrl.org/docs/about) |
| NYU Damodaran | 整理行业基准原表，引用全球行业 WACC 估算企业 EVA。 | 作者鼓励使用行业汇总，并说明底层数据商限制他共享企业级数据。公开使用规则未明确覆盖原表批量镜像或整套导出。 [作者使用规则](https://pages.stern.nyu.edu/adamodar/New_Home_Page/datahistory.html) |

## 有明确再利用说明的来源

| 来源 | 可用范围与发布条件 |
| --- | --- |
| SEC EDGAR | SEC 明确允许再利用公开申报内容。README 的 Atlassian 现金流量表截图来自公开申报。 [SEC 网站常见问题](https://www.sec.gov/about/webmaster-frequently-asked-questions) |
| UNIDO INDSTAT | 门户数据默认采用 CC BY 4.0，按其要求署名并标明改动。另标外部来源的材料依原来源许可。 [UNIDO 条款](https://stat.unido.org/terms-and-conditions) |
| Eurostat 企业结构统计 | 通常可注明数据集及访问日期后再利用。修改数据须说明改动和 Eurostat 的责任范围。第三方数据等例外另查。 [Eurostat 版权与再利用](https://ec.europa.eu/eurostat/help/copyright-notice) |
| 联合国国民账户 | UNdata 允许注明其出处后复制和再分发其发布的数据。项目使用同一主总量数据库的 UNSD 下载表，并计算部分地区汇总和占比。 [UNdata 条款](https://data.un.org/Host.aspx?Content=UNdataUse) · [数据集说明](https://unstats.un.org/unsd/snaama/) |
| 国家统计局 | 官网允许合理引用官方发布内容，要求显著注明国家统计局网站及网址，并列有例外和后续转载限制。批量作为数据包再发布仍需确认。 [国家统计局服务条款](https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html) |
| 世界银行汇率 | 项目所用 PA.NUS.FCRF 标为 CC BY 4.0。署名应包含世界银行、数据集和标注的提供方。 [指标页](https://data.worldbank.org/indicator/PA.NUS.FCRF) · [数据条款](https://data.worldbank.org/summary-terms-of-use) |
| 美联储 H.15、FRED、ECB | 美联储理事会自有公开数据通常可注明出处后分发。FRED 的台湾汇率源自美联储理事会，CPI 源自美国劳工统计局，引用时保留原机构和 FRED。ECB 允许准确转载并注明来源，利差等计算结果需标明改动。 [美联储声明](https://www.federalreserve.gov/disclaimer.htm) · [FRED 条款](https://fred.stlouisfed.org/legal/) · [美国劳工统计局声明](https://www.bls.gov/bls/linksite.htm) · [ECB 条款](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) |
| EIA 电力及汽油 | EIA 允许使用和分发自有数据，建议注明机构及发布日期。州级集中度及需求弹性标为项目计算结果。 [EIA 再利用说明](https://www.eia.gov/about/copyrights_reuse.php) |
| FinanceDatabase | 项目保留锁定版本随附的 MIT 文本。交易所或第三方证券字段仍适用各自来源的条款。 [随附许可证](../config/FinanceDatabase-LICENSE.txt) |

对外提供完整数据包前，应把来源、许可证和转换说明随文件提供，并先处理未确认的来源。
