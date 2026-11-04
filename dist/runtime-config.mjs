import {DEFAULTS,validateSettings} from './time.mjs';
import {normalizeMotionChoice} from './motion.mjs';
export const SETTINGS_STORE='carrot-workday-settings-v1';
export const GOAL_STORE='carrot-workday-goal-v1';
export const GOAL_DEFAULTS=Object.freeze({name:'一杯好喝的奶茶',price:25});
const settingsKeys=Object.keys(DEFAULTS);
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const time=value=>typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const copySettings=value=>({...value,workdays:[...value.workdays]});
function strictSettings(value){
 if(!record(value)||!settingsKeys.every(key=>own(value,key)))return null;
 // Validate even disabled break inputs, which validateSettings intentionally ignores.
 if(!time(value.breakStart)||!time(value.breakEnd))return null;
 const valid=validateSettings(value);
 return valid.ok?valid.settings:null;
}
// Existing saved settings use the same validator as the form. In particular,
// disabled break fields may legitimately be blank (or omitted by older clients).
function savedSettings(value){
 const valid=validateSettings(value);
 return valid.ok?valid.settings:null;
}
function strictGoal(value){
 if(!record(value)||typeof value.name!=='string'||!value.name.trim()||typeof value.price!=='number'||!Number.isFinite(value.price)||value.price<=0||value.price>1e9)return null;
 return {name:value.name.trim().slice(0,24),price:value.price};
}
const parse=(value,validate)=>{try{return validate(JSON.parse(value));}catch{return null;}};
function mergeKnown(base,input,keys){
 const merged={...base};
 for(const key of keys)if(own(input,key))merged[key]=input[key];
 return merged;
}
/** Each settings/goal group is atomic: invalid input never produces a half-valid schedule. */
export function resolveDefaults(input){
 let settings=copySettings(DEFAULTS),goal={...GOAL_DEFAULTS},hasSiteSettings=false;
 if(record(input)){
  if(record(input.settings)){
   const candidate=strictSettings(mergeKnown(DEFAULTS,input.settings,settingsKeys));
   if(candidate){settings=candidate;hasSiteSettings=settingsKeys.some(key=>own(input.settings,key));}
  }
  if(record(input.goal))goal=strictGoal(mergeKnown(GOAL_DEFAULTS,input.goal,['name','price']))||goal;
 }
 return {settings,goal,hasSiteSettings};
}
/** Timeout includes response parsing; static hosts may return their HTML fallback with HTTP 200. */
export async function loadRuntimeConfig({fetcher=globalThis.fetch,moduleURL=import.meta.url,timeoutMs=1500}={}){
 const controller=new AbortController();let timer;
 try{
  const payload=await Promise.race([
   (async()=>{
    const response=await fetcher(new URL('./runtime-config.json',moduleURL),{cache:'no-store',signal:controller.signal});
    if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')||''))return null;
    return response.json();
   })(),
   new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);})
  ]);
  return resolveDefaults(payload);
 }catch{return resolveDefaults(null);}finally{clearTimeout(timer);}
}
/** Read each preference independently: corrupt settings must not hide valid unrelated preferences. */
export function readPreferences(storage,defaults){
 let storageAvailable=true;
 const read=key=>{try{return storage.getItem(key);}catch{storageAvailable=false;return null;}};
 const localSettings=parse(read(SETTINGS_STORE),savedSettings),savedGoal=parse(read(GOAL_STORE),strictGoal);
 const motionChoice=normalizeMotionChoice(read('carrot-workday-motion-v1'));
 const focusMode=read('carrot-workday-focus-v1')==='true';
 return {settings:localSettings||copySettings(defaults.settings),goal:savedGoal||{...defaults.goal},hasSettings:!!localSettings,motionChoice,focusMode,storageAvailable};
}
export function applyStorageChange(current,event,defaults){
 if(event.key===null)return {...current,settings:copySettings(defaults.settings),goal:{...defaults.goal},hasSettings:false};
 if(event.key===SETTINGS_STORE){
  if(event.newValue===null)return {...current,settings:copySettings(defaults.settings),hasSettings:false};
  const settings=parse(event.newValue,savedSettings);
  return settings?{...current,settings,hasSettings:true}:current;
 }
 if(event.key===GOAL_STORE){
  if(event.newValue===null)return {...current,goal:{...defaults.goal}};
  const goal=parse(event.newValue,strictGoal);
  return goal?{...current,goal}:current;
 }
 return current;
}
export function resetPreferences(storage,defaults,confirm){
 if(!confirm())return null;
 let storageAvailable=true;
 for(const key of [SETTINGS_STORE,GOAL_STORE])try{storage.removeItem(key);}catch{storageAvailable=false;}
 const state=readPreferences(storage,defaults);
 return {...state,settings:copySettings(defaults.settings),goal:{...defaults.goal},hasSettings:false,storageAvailable:storageAvailable&&state.storageAvailable};
}
