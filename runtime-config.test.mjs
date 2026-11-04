import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULTS} from './dist/time.mjs';
import {GOAL_DEFAULTS, SETTINGS_STORE, GOAL_STORE, resolveDefaults, loadRuntimeConfig, readPreferences, applyStorageChange, resetPreferences} from './dist/runtime-config.mjs';
const storage = (values={}) => ({values:{...values},getItem(k){return this.values[k]??null;},removeItem(k){delete this.values[k];}});
test('partial defaults are merged, with Sunday 0 retained',()=>{
 const d=resolveDefaults({settings:{salary:5500,workdays:[0]},goal:{price:50}});
 assert.equal(d.settings.salary,5500);assert.deepEqual(d.settings.workdays,[0]);assert.equal(d.goal.name,GOAL_DEFAULTS.name);assert.equal(d.goal.price,50);assert.equal(d.hasSiteSettings,true);
});
test('untrusted settings reject zero, wrong types and invalid schedules as a group',()=>{
 for(const settings of [{salary:0},{salary:'2500'},{breakEnabled:'false'},{workdays:[false]},{workdays:[]},{breakEnabled:false,breakStart:5},{start:'19:00',end:'20:00'},{start:'09:00',end:'09:00'}]) assert.deepEqual(resolveDefaults({settings}).settings,DEFAULTS);
 for(const value of [null,[],5,'hello',{settings:null},{settings:[]}]) assert.deepEqual(resolveDefaults(value).settings,DEFAULTS);
 assert.equal(resolveDefaults({settings:{salary:0},goal:{price:60}}).goal.price,60);
});
test('cross-midnight shift and break validity',()=>{
 const d=resolveDefaults({settings:{start:'22:00',end:'06:00',breakStart:'01:00',breakEnd:'01:30'}});assert.equal(d.settings.start,'22:00');assert.equal(d.hasSiteSettings,true);
 assert.deepEqual(resolveDefaults({settings:{start:'22:00',end:'06:00',breakStart:'07:00',breakEnd:'08:00'}}).settings,DEFAULTS);
});
test('goals use strict positive numeric prices and retain hostile strings only as text',()=>{
 for(const goal of [{price:0},{price:'5'},{name:8},{name:' '}]) assert.deepEqual(resolveDefaults({goal}).goal,GOAL_DEFAULTS);
 assert.equal(resolveDefaults({goal:{name:'<img onerror=alert(1)>'}}).goal.name,'<img onerror=alert(1)>');
});
test('valid local settings and goals always win over changing site defaults',()=>{
 const s=storage({[SETTINGS_STORE]:JSON.stringify({...DEFAULTS,salary:9999}),[GOAL_STORE]:JSON.stringify({name:'my goal',price:99})});
 for(const salary of [100,200]){const p=readPreferences(s,resolveDefaults({settings:{salary}}));assert.equal(p.settings.salary,9999);assert.equal(p.goal.price,99);assert.equal(p.hasSettings,true);}
});
test('malformed local settings do not abort independently valid goal, motion or focus',()=>{
 const s=storage({[SETTINGS_STORE]:'{bad',[GOAL_STORE]:'{"name":"reward","price":90}','carrot-workday-motion-v1':'pause','carrot-workday-focus-v1':'true'});
 const p=readPreferences(s,resolveDefaults({settings:{salary:4444}}));assert.equal(p.settings.salary,4444);assert.equal(p.goal.price,90);assert.equal(p.motionChoice,'pause');assert.equal(p.focusMode,true);assert.equal(p.storageAvailable,true);
});
test('storage deletion uses site defaults, invalid changes leave current valid state alone',()=>{
 const d=resolveDefaults({settings:{salary:8000},goal:{price:77}}),p=readPreferences(storage(),d);
 assert.equal(applyStorageChange(p,{key:SETTINGS_STORE,newValue:'{}'},d),p);
 assert.equal(applyStorageChange(p,{key:GOAL_STORE,newValue:'not json'},d),p);
 assert.equal(applyStorageChange({...p,settings:{...DEFAULTS,salary:1}},{key:SETTINGS_STORE,newValue:null},d).settings.salary,8000);
 assert.equal(applyStorageChange({...p,goal:{name:'mine',price:1}},{key:GOAL_STORE,newValue:null},d).goal.price,77);
});
test('explicit reset requires confirmation and removes only settings and goal',()=>{
 const s=storage({[SETTINGS_STORE]:'x',[GOAL_STORE]:'x','carrot-workday-motion-v1':'play','carrot-workday-focus-v1':'true',unrelated:'keep'}),d=resolveDefaults({settings:{salary:7000}});
 assert.equal(resetPreferences(s,d,()=>false),null);assert.equal(s.values[SETTINGS_STORE],'x');
 const p=resetPreferences(s,d,()=>true);assert.equal(p.settings.salary,7000);assert.equal(p.hasSettings,false);assert.equal(p.motionChoice,'play');assert.equal(p.focusMode,true);assert.deepEqual(Object.keys(s.values).sort(),['carrot-workday-focus-v1','carrot-workday-motion-v1','unrelated']);
});
test('fetch uses module-relative base path, no-store and JSON only',async()=>{
 let request; const result=await loadRuntimeConfig({moduleURL:'https://example.org/nested/runtime-config.mjs',fetcher:async(url,options)=>{request={url:String(url),options};return {ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>({settings:{salary:123}})};}});
 assert.equal(request.url,'https://example.org/nested/runtime-config.json');assert.equal(request.options.cache,'no-store');assert.equal(result.settings.salary,123);
});
test('static {}, missing, HTML, invalid JSON and timeout safely fall back',async()=>{
 const responses=[{ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>({})},{ok:false},{ok:true,headers:new Headers({'Content-Type':'text/html'}),json:async()=>({settings:{salary:1}})},{ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>{throw Error('bad JSON')}}];
 for(const response of responses)assert.deepEqual((await loadRuntimeConfig({fetcher:async()=>response})).settings,DEFAULTS);
 assert.deepEqual((await loadRuntimeConfig({fetcher:()=>new Promise(()=>{}),timeoutMs:5})).settings,DEFAULTS);
 assert.deepEqual((await loadRuntimeConfig({fetcher:async()=>{throw Error('network')}})).settings,DEFAULTS);
});
test('UI renders goal with textContent and exposes confirmed reset without clearing storage',async()=>{
 const app=await readFile(new URL('./dist/app.mjs',import.meta.url),'utf8'),html=await readFile(new URL('./dist/index.html',import.meta.url),'utf8');
 assert.match(app,/\$\('goalName'\)\.textContent=goal\.name/);assert.match(html,/id="resetDefaults"/);assert.match(app,/resetPreferences/);assert.doesNotMatch(app,/localStorage\.clear\(/);
});

test('runtime motion/focus and unknown keys cannot change browser preferences',()=>{
 const d=resolveDefaults(JSON.parse('{"settings":{"salary":6000,"focusMode":true,"motionChoice":"play","__proto__":{"polluted":true}},"motionChoice":"play","focusMode":true}'));
 const p=readPreferences(storage(),d);assert.equal(p.motionChoice,'auto');assert.equal(p.focusMode,false);assert.equal(d.settings.salary,6000);assert.equal(Object.prototype.polluted,undefined);
});
test('blocked storage still loads safe defaults and reset reports persistence failure',()=>{
 const blocked={getItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}},d=resolveDefaults({settings:{salary:5000}});
 const p=readPreferences(blocked,d);assert.equal(p.settings.salary,5000);assert.equal(p.storageAvailable,false);
 assert.equal(resetPreferences(blocked,d,()=>true).storageAvailable,false);
});
test('timeout also bounds a stalled response body',async()=>{
 const d=await loadRuntimeConfig({timeoutMs:5,fetcher:async()=>({ok:true,headers:new Headers({'Content-Type':'application/json'}),json:()=>new Promise(()=>{})})});assert.deepEqual(d.settings,DEFAULTS);
});
test('legacy valid saved settings retain disabled blank breaks and personal salary after reload',()=>{
 const personal={...DEFAULTS,salary:9876,breakEnabled:false,breakStart:'',breakEnd:''};
 const d=resolveDefaults({settings:{salary:5555}});
 const p=readPreferences(storage({[SETTINGS_STORE]:JSON.stringify(personal)}),d);
 assert.equal(p.hasSettings,true);assert.deepEqual(p.settings,personal);
 const changed=applyStorageChange(readPreferences(storage(),d),{key:SETTINGS_STORE,newValue:JSON.stringify(personal)},d);
 assert.equal(changed.hasSettings,true);assert.deepEqual(changed.settings,personal);
 // Runtime defaults remain strict, including inactive break field types/formats.
 assert.deepEqual(resolveDefaults({settings:personal}).settings,DEFAULTS);
});
