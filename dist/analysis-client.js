import {prose} from "./i18n.js";
const responseMessages={
  ARK_KEY_REQUIRED:["默认接口尚未配置方舟 API Key，可切换到自定义接口。","The default provider has no Volcengine API key. You can switch to a custom provider."],
  AI_MODEL_REQUIRED:["请填写或选择模型。","Enter or select a model."],
  INVALID_AI_KEY:["API Key 含空格或无效字符。","The API key contains spaces or invalid characters."],
  AI_ENDPOINT:["接口或模型不存在，请核对 Base URL 和模型名。","The endpoint or model was not found. Check the base URL and model name."],
  AI_EMPTY:["接口已响应，但没有返回模型文本。","The provider responded without model text."],
  AI_AUTH:["接口拒绝了鉴权，请核对密钥和模型权限。","The provider rejected authentication. Check the key and model access."],
  AI_QUOTA:["接口暂时限流或额度不足。","The provider is rate-limited or out of quota."],
  AI_TIMEOUT:["连接模型接口超时。可检查代理和接口地址后重试。","The connection to the model timed out. Check the proxy and endpoint."],
  AI_NETWORK:["无法连接模型接口。请检查网络或代理。","Could not reach the model endpoint. Check the network or proxy."],
  AI_REJECTED:["接口拒绝了生成参数。请核对接口类型和模型。","The provider rejected the generation parameters. Check the API type and model."],
  AI_FORMAT:["接口返回了无法识别的响应。请核对 Base URL 与接口类型。","The response format was unrecognized. Check the base URL and API type."],
  AI_UPSTREAM:["模型服务暂不可用。","The model service is temporarily unavailable."],
  INVALID_AI_URL:["请输入 HTTPS Base URL，本机接口可用 HTTP。","Enter an HTTPS base URL. Local endpoints may use HTTP."],
  INVALID_AI_SETTINGS:["请检查模型和 API 设置。","Check the model and API settings."],
  AI_SETTINGS_UNSAVED:["AI 配置尚未保存，请检查设置。","AI settings could not be saved. Check the configuration."],
  AI_DEFAULT_ALREADY_USED:["上次已用默认配置分析。","Last analysis used the default configuration."],
  REQUEST_SIZE:["该图表序列过多，超出了单次分析的大小。","This chart exceeds the analysis request size."]
};

export async function request(path,body) {
  const headers={"X-AlphaNode-Local":"1"};
  const options=body?{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)}:{headers};
  const response=await fetch(path,options);
  const result=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(result.error||"LOCAL_SERVICE_UNAVAILABLE");
  return result;
}
export function message(error) {
  return prose(...(responseMessages[error.message]??["本地服务暂不可用，请重新启动工作台后再试。","The local service is unavailable. Restart the workbench and try again."]));
}
