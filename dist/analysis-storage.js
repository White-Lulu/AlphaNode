let database;

function openStorage() {
  if (!globalThis.crypto?.subtle||!globalThis.indexedDB) throw new Error("AI_PRIVATE_STORAGE");
  database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open("alphanode-ai",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("settings");
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error("AI_PRIVATE_STORAGE"));
  }).catch(error=>{database=null;throw error;});
  return database;
}

async function entry(name,create) {
  const db=await openStorage();
  const replacement=create&&await create();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction("settings",create?"readwrite":"readonly");
    const store=transaction.objectStore("settings"),request=store.get(name);
    let value;
    request.onsuccess=()=>{
      value=request.result;
      if (value===undefined&&create) {
        value=replacement;
        store.add(value,name);
      }
    };
    transaction.oncomplete=()=>resolve(value);
    transaction.onabort=()=>reject(new Error("AI_PRIVATE_STORAGE"));
  });
}

async function encryptionKey() {
  return await entry("encryption-key")??await entry("encryption-key",()=>crypto.subtle.generateKey(
    {name:"AES-GCM",length:256},false,["encrypt","decrypt"]));
}

export async function readAnalysisConfig() {
  const record=await entry("config");
  if (!record) return null;
  try {
    const key=await entry("encryption-key");
    const decoded=await crypto.subtle.decrypt({name:"AES-GCM",iv:record.iv},key,record.ciphertext);
    return JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    throw new Error("AI_PRIVATE_STORAGE");
  }
}

export async function writeAnalysisConfig(config) {
  const key=await encryptionKey();
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(config));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
  const db=await openStorage();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction("settings","readwrite");
    transaction.objectStore("settings").put({iv,ciphertext},"config");
    transaction.oncomplete=()=>resolve();
    transaction.onabort=()=>reject(new Error("AI_PRIVATE_STORAGE"));
  });
}
