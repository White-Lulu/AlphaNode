import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("./", import.meta.url);
const source = new URL("upstream/superset/", root);
const output = new URL("dist/vendor/superset/", root);
const path = new URL("superset-frontend/plugins/plugin-chart-echarts/src/Timeseries/percentChange.ts", source);
const input = readFileSync(path, "utf8");
const statement = "import { DataRecord } from '@superset-ui/core';";
if (!input.includes(statement)) throw new Error("Review Superset percentChange.ts before rebuilding");
const compiled = stripTypeScriptTypes(input.replace(statement, ""), { mode: "transform" });
mkdirSync(output, { recursive: true });
writeFileSync(new URL("percentChange.js", output), compiled);
copyFileSync(new URL("LICENSE.txt", source), new URL("LICENSE.txt", output));
copyFileSync(new URL("NOTICE", source), new URL("NOTICE.txt", output));
