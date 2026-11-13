import {$,esc,link} from "./model.js";
import {pair,prose} from "./i18n.js";
import {metricLabel} from "./glossary.js";

const fields = [
  ["ticker", "证券代码", "Ticker"], ["economy", "经济体代码", "Economy code"],
  ["isic", "ISIC 组代码", "ISIC group code"], ["provider", "报表来源代码", "Statement provider code"]
];
const examples = [
  ["全球资本回报", "Global capital returns", "economy IN ('US', 'CN', 'JP', 'GB', 'DE') AND roic >= 0.12"],
  ["现金流与偿债", "Cash flow and solvency", "fcfMargin >= 0.08 AND (currentRatio >= 1.5 OR zmijewski < 0)"]
];
const source = "https://github.com/maxgfr/crible/tree/6a3e9ca95e023409a2eac88c6c5fbb1e718092f0/src/crible/dsl";

export function renderAdvanced(meta) {
  $("advanced-fields").innerHTML = '<div class="advanced-examples">' + examples.map(([zh,en,expr]) =>
    '<button type="button" class="quiet" data-screen-example="'+esc(expr)+'">'+esc(pair(zh,en))+"</button>").join("") + "</div>" +
    '<p>'+esc(prose("百分比用小数（12% 写作 0.12），金额用美元原数值。字符串用引号括起。", "Use decimals for percentages (0.12 for 12%) and unscaled USD amounts. Put text values in quotes."))+"</p>" +
    '<p><code>AND</code> · <code>OR</code> · <code>NOT</code> · <code>IN</code>　'+link(source,"Crible")+"</p>" +
    '<div class="advanced-fields">' + [...fields.map(([key,zh,en])=>[key,pair(zh,en)]),
      ...meta.finColumns.map(key=>[key,metricLabel(key,meta)])].map(([key,label])=>
      '<span><code>'+esc(key)+'</code> '+esc(label)+"</span>").join("")+"</div>";
}
export async function requestAdvanced(expression,year) {
  const params=new URLSearchParams({q:expression,year});
  const response=await fetch("api/screen?"+params);
  const result=await response.json();
  if (!response.ok) throw new Error(result.error || "HTTP "+response.status);
  return new Set(result.ids);
}
