import {$,esc} from "./model.js";
import {pair,prose} from "./i18n.js";
import {request,message,apiBases,listCustomModels,testCustomModel} from "./analysis-client.js";
import {readAnalysisConfig,writeAnalysisConfig} from "./analysis-storage.js";
import {wireSavedCharts,renderSavedCharts,setAnalysisSettings} from "./saved-charts.js";
import {renderWatchlist} from "./watchlist.js";

export function renderCollection() {
  renderSavedCharts();
  renderWatchlist();
}
export function wireCollection(config) {
  wireSavedCharts({...config,prepareAnalysis});
  wireAISettings();
  void refreshAnalysisSettings().catch(()=>{});
}

const defaults={provider:"default",apiType:"chat",url:"",model:"",key:"",prompt:""};
const aiInput=key=>$("ai-"+key);
let aiConfig,configRequest,serverRequest,serverSettings={},settingsToken=0,editVersion=0,saveTimer,saving,operation;
let pending=false;

function reportAI(text) {
  aiInput("settings-status").textContent=text;
}
function updateAIControls() {
  const custom=aiConfig?.provider==="custom";
  for (const button of aiInput("modes").querySelectorAll("[data-ai-provider]")) {
    const active=button.dataset.aiProvider===(aiConfig?.provider??"default");
    button.disabled=!aiConfig;
    button.setAttribute("aria-pressed",String(active));
    button.classList.toggle("primary",active);
    button.classList.toggle("quiet",!active);
  }
  aiInput("api-type").disabled=!custom;
  aiInput("fields").disabled=!custom;
  aiInput("fetch-models").disabled=Boolean(operation);
  aiInput("test-model").disabled=Boolean(operation);
  aiInput("url").placeholder=apiBases[aiInput("api-type").value];
}
function renderAIModels(models=[]) {
  aiInput("model-options").innerHTML=models.map(model=>'<button type="button" data-ai-model="'+esc(model)+'">'+
    esc(model)+'</button>').join("")||'<div class="ai-model-empty" role="status" aria-label="'+
    esc(pair("暂无已拉取的模型","No models fetched"))+'"></div>';
}
function maskAIKey() {
  const input=aiInput("key");
  input.type="password";
  aiInput("show-key").setAttribute("aria-pressed","false");
  input.value=aiConfig?.key??"";
}
function fillAISettings(config) {
  aiInput("api-type").value=apiBases[config.apiType]?config.apiType:"chat";
  for (const key of ["url","model","prompt"]) aiInput(key).value=config[key];
  maskAIKey();
  renderAIModels();
  updateAIControls();
}
function initAIConfig() {
  configRequest??=readAnalysisConfig().then(config=>{
    aiConfig={...defaults,...config};
    updateAnalysisMode();
  }).catch(error=>{
    configRequest=null;
    throw error;
  });
  return configRequest;
}
function updateAnalysisMode() {
  setAnalysisSettings({...serverSettings,provider:aiConfig?.provider??"default"});
}
function refreshServerSettings() {
  serverRequest??=request("/api/analysis-settings").then(config=>{
    serverSettings=config;
    const notice=$("ai-web-notice");
    if (notice) notice.hidden=!config.publicWeb;
    updateAnalysisMode();
  }).finally(()=>{serverRequest=null;});
  return serverRequest;
}
async function refreshAnalysisSettings() {
  await Promise.allSettled([initAIConfig(),refreshServerSettings()]);
}
function flushAISettings() {
  clearTimeout(saveTimer);
  if (!pending) return saving??Promise.resolve(true);
  if (saving) return saving;
  const token=settingsToken;
  saving=(async()=>{
    while (pending) {
      pending=false;
      try {await writeAnalysisConfig({...aiConfig});}
      catch {
        pending=true;
        if (token===settingsToken) reportAI(message(new Error("AI_PRIVATE_STORAGE")));
        return false;
      }
    }
    if (!operation&&token===settingsToken) reportAI(prose("已在浏览器加密保存。","Saved encrypted in this browser."));
    return true;
  })().finally(()=>{saving=null;});
  return saving;
}
function queueAISetting(key,value,immediate=false) {
  aiConfig[key]=value;
  editVersion++;
  pending=true;
  clearTimeout(saveTimer);
  if (key==="provider") updateAnalysisMode();
  if (immediate) void flushAISettings();
  else saveTimer=setTimeout(flushAISettings,400);
}
async function prepareAnalysis() {
  await initAIConfig();
  if (!await flushAISettings()) throw new Error("AI_SETTINGS_UNSAVED");
  if (aiConfig.provider==="default") await refreshServerSettings();
  return {...aiConfig};
}
export function resetAISettings() {
  settingsToken++;
  operation=null;
  maskAIKey();
  aiInput("key").value="";
  aiInput("model-options").hidePopover();
  updateAIControls();
  void flushAISettings();
}
export async function loadAISettings() {
  const token=++settingsToken;
  reportAI("");
  updateAIControls();
  try {
    await initAIConfig();
    if (token===settingsToken) fillAISettings(aiConfig);
    void refreshServerSettings().catch(()=>{});
  } catch (error) {
    if (token===settingsToken) reportAI(message(error));
  }
}
async function runAIAction(kind) {
  if (operation||aiConfig?.provider!=="custom") return;
  const job={kind},token=settingsToken,version=editVersion;
  operation=job;
  updateAIControls();
  reportAI(kind==="models"?prose("正在拉取模型…","Fetching models…"):prose("正在测试模型连通…","Testing the model connection…"));
  const current=()=>token===settingsToken&&version===editVersion;
  try {
    if (!await flushAISettings()||!current()) return;
    const config={...aiConfig};
    const result=kind==="models"?await listCustomModels(config):await testCustomModel(config);
    if (!current()) return;
    if (kind==="models") {
      renderAIModels(result);
      if (result.length) {
        reportAI(prose("已拉取 "+result.length+" 个模型。","Fetched "+result.length+" models."));
        const menu=aiInput("model-options");
        if (!menu.matches(":popover-open")) menu.showPopover({source:aiInput("model-menu")});
      } else reportAI(prose("接口未返回可选模型，可手动填写。","The provider returned no models. You can type a model name."));
    } else reportAI(prose("连通成功："+result.model,"Connection successful: "+result.model));
  } catch (error) {
    if (current()) reportAI(message(error));
  } finally {
    if (operation===job) {
      operation=null;
      updateAIControls();
      if (!current()&&token===settingsToken) reportAI("");
    }
  }
}
function wireAISettings() {
  renderAIModels();
  aiInput("modes").onclick=event=>{
    const provider=event.target.closest("[data-ai-provider]")?.dataset.aiProvider;
    if (!aiConfig||!provider||provider===aiConfig.provider) return;
    queueAISetting("provider",provider,true);
    if (provider==="default") {
      maskAIKey();
      aiInput("model-options").hidePopover();
    }
    updateAIControls();
  };
  aiInput("api-type").onchange=event=>{
    renderAIModels();
    updateAIControls();
    queueAISetting("apiType",event.target.value,true);
  };
  for (const key of ["url","key","model","prompt"]) aiInput(key).oninput=event=>{
    if (key==="url"||key==="key") renderAIModels();
    queueAISetting(key,event.target.value);
  };
  aiInput("model-options").onclick=event=>{
    const model=event.target.closest("[data-ai-model]")?.dataset.aiModel;
    if (!model) return;
    aiInput("model").value=model;
    aiInput("model-options").hidePopover();
    aiInput("model").focus();
    queueAISetting("model",model,true);
  };
  aiInput("show-key").onclick=()=>{
    const input=aiInput("key");
    if (input.type==="text") {maskAIKey();return;}
    input.type="text";
    aiInput("show-key").setAttribute("aria-pressed","true");
  };
  aiInput("fetch-models").onclick=()=>void runAIAction("models");
  aiInput("test-model").onclick=()=>void runAIAction("test");
  aiInput("settings-form").onsubmit=event=>{event.preventDefault();void flushAISettings();};
}
