import {$,esc} from "./model.js";
import {pair,prose} from "./i18n.js";
import {request,message} from "./analysis-client.js";
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

const apiBases={
  chat:"https://api.openai.com/v1",responses:"https://api.openai.com/v1",
  anthropic:"https://api.anthropic.com/v1",gemini:"https://generativelanguage.googleapis.com/v1beta"
};
const aiInput=key=>$("ai-"+key);
let aiConfig,settingsToken=0,editVersion=0,keyEdited=false,saveTimer,saving,operation;
let pending={};

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
  if (!keyEdited) input.value="";
}
function fillAISettings(config) {
  aiConfig=config;
  aiInput("api-type").value=apiBases[config.apiType]?config.apiType:"chat";
  for (const key of ["url","model","prompt"]) aiInput(key).value=config[key];
  keyEdited=false;
  maskAIKey();
  aiInput("key").placeholder=config.hasKey?"••••••••":"";
  renderAIModels();
  updateAIControls();
}
function flushAISettings() {
  clearTimeout(saveTimer);
  if (saving) return saving;
  const token=settingsToken;
  saving=(async()=>{
    let changed=false;
    while (Object.keys(pending).length) {
      const patch=pending;
      pending={};
      try {
        const config=await request("/api/analysis-settings",patch);
        setAnalysisSettings(config);
        changed=true;
        if (token===settingsToken&&aiConfig) {
          aiConfig.hasKey=config.hasKey;
          aiInput("key").placeholder=config.hasKey?"••••••••":"";
        }
      } catch (error) {
        pending={...patch,...pending};
        if (token===settingsToken) reportAI(message(error));
        return false;
      }
    }
    if (changed&&!operation&&token===settingsToken) reportAI(prose("已自动保存。","Saved automatically."));
    return true;
  })().finally(()=>{saving=null;});
  return saving;
}
function queueAISetting(key,value,immediate=false) {
  editVersion++;
  pending[key]=value;
  clearTimeout(saveTimer);
  if (!operation) reportAI(prose("正在保存…","Saving…"));
  if (immediate) void flushAISettings();
  else saveTimer=setTimeout(flushAISettings,400);
}
async function refreshAnalysisSettings() {
  const config=await request("/api/analysis-settings");
  setAnalysisSettings(config);
  return config;
}
async function prepareAnalysis() {
  if (!await flushAISettings()) throw new Error("AI_SETTINGS_UNSAVED");
  await refreshAnalysisSettings();
}
export function resetAISettings() {
  settingsToken++;
  aiConfig=null;
  operation=null;
  keyEdited=false;
  maskAIKey();
  aiInput("model-options").hidePopover();
  updateAIControls();
  void flushAISettings();
}
export async function loadAISettings() {
  const token=++settingsToken;
  reportAI("");
  updateAIControls();
  try {
    if (!await flushAISettings()) {
      if (token===settingsToken) reportAI(prose("上次改动暂未保存，请检查本地服务。","The last edit could not be saved. Check the local service."));
      return;
    }
    const config=await refreshAnalysisSettings();
    if (token===settingsToken) fillAISettings(config);
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
    const result=await request("/api/analysis-"+kind,{});
    if (!current()) return;
    if (kind==="models") {
      renderAIModels(result.models);
      if (result.models.length) {
        reportAI(prose("已拉取 "+result.models.length+" 个模型。","Fetched "+result.models.length+" models."));
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
    aiConfig.provider=provider;
    if (provider==="default") {
      maskAIKey();
      aiInput("model-options").hidePopover();
    }
    updateAIControls();
    queueAISetting("provider",provider,true);
  };
  aiInput("api-type").onchange=event=>{
    renderAIModels();
    updateAIControls();
    queueAISetting("apiType",event.target.value,true);
  };
  for (const key of ["url","key","model","prompt"]) aiInput(key).oninput=event=>{
    if (key==="key") keyEdited=true;
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
  aiInput("show-key").onclick=async()=>{
    const input=aiInput("key"),button=aiInput("show-key");
    if (input.type==="text") {maskAIKey();return;}
    const token=settingsToken;
    if (!keyEdited&&!input.value&&aiConfig?.hasKey) {
      button.disabled=true;
      try {
        const revealed=await request("/api/analysis-settings?reveal=1");
        if (token!==settingsToken||aiConfig?.provider!=="custom") return;
        if (!keyEdited) input.value=revealed.key;
      } catch (error) {
        if (token===settingsToken) reportAI(message(error));
        return;
      } finally {button.disabled=false;}
    }
    input.type="text";
    button.setAttribute("aria-pressed","true");
  };
  aiInput("fetch-models").onclick=()=>void runAIAction("models");
  aiInput("test-model").onclick=()=>void runAIAction("test");
  aiInput("settings-form").onsubmit=event=>{event.preventDefault();void flushAISettings();};
}
