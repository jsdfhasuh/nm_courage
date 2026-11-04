import { DEFAULTS, validateSettings, calculate } from './time.mjs';
import {mountDonkeyScene} from './scene-player.mjs';
import {normalizeMotionChoice,motionState,toggleMotion} from './motion.mjs';
const $ = id => document.getElementById(id);
const STORE = 'carrot-workday-settings-v1';
const MOTION_STORE = 'carrot-workday-motion-v1';
let settings = {...DEFAULTS,workdays:[...DEFAULTS.workdays]};
let hasSettings = false;
let goal={name:'一杯好喝的奶茶',price:25};
let focusMode=false;
let motionChoice='auto';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let storageAvailable = true;
try {
 const saved = localStorage.getItem(STORE);
 if (saved) { const result=validateSettings(JSON.parse(saved)); if(result.ok){settings=result.settings;hasSettings=true;} }
 motionChoice=normalizeMotionChoice(localStorage.getItem(MOTION_STORE));
 focusMode=localStorage.getItem('carrot-workday-focus-v1')==='true';
 const g=JSON.parse(localStorage.getItem('carrot-workday-goal-v1')||'null');
 if(g && typeof g.name==='string' && g.name.trim() && Number.isFinite(g.price) && g.price>0 && g.price<=1e9)goal={name:g.name.slice(0,24),price:g.price};
} catch {storageAvailable=false;}
const money = n => n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const bigMoney = n => n >= 100000000 ? money(n/100000000)+'亿' : n >= 100000 ? money(n/10000)+'万' : money(n);
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const stateCopy = {
 working:['努力搬砖中','距离下班还有','每一秒，都没有白跑。','小驴在跑，快乐在靠近。'],
 break:['休息充电中','距离下班还有','先吃饱，才有力气追胡萝卜。','休息不计薪，小驴也在充电。'],
 before:['准备出发','距离上班还有','不着急，先给自己充个电。','今天的故事，还没开始。'],
 after:['今日已收工','今天辛苦了，下班快乐！','胡萝卜到手！现在去享受生活。','今日努力已记下，去好好生活。'],
 off:['今天休息','距离下次上班还有','放假啦！小驴也要晒太阳。','今天不搬砖，快乐不打烊。']
};
let lastState='';
function render() {
 const now=new Date(),c=calculate(now,settings),copy=stateCopy[c.state];
 const dateText=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(now);
 $('dateLabel').textContent=dateText;
 $('clockLabel').textContent=now.toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'})+' · 本地';
 $('stateLabel').lastChild.textContent=copy[0];
 $('timerLabel').textContent=focusMode?'专注模式':copy[1];
 const h=Math.floor(c.countdownSeconds/3600),m=Math.floor(c.countdownSeconds%3600/60),s=c.countdownSeconds%60;
 $('timerHours').textContent=String(h).padStart(2,'0');$('timerMinutes').textContent=String(m).padStart(2,'0');$('timerSeconds').textContent=String(s).padStart(2,'0');
 document.querySelector('.timer').classList.toggle('long-timer',h>=100);
 document.querySelector('.timer').setAttribute('aria-label',`${copy[1]} ${h} 小时 ${m} 分钟 ${s} 秒`);
 $('earnedTitle').innerHTML=(c.shiftDate!==dateKey(now)?'本班次已赚':'今日已赚')+' <span>估算</span>';
 $('todayEarned').textContent=bigMoney(c.todayEarned);$('todayEarned').title='¥'+money(c.todayEarned);
 $('todayEarned').classList.toggle('smaller-money',$('todayEarned').textContent.length>7);
 $('dayRate').textContent='¥'+bigMoney(c.state==='off'?0:c.dayRate);
 $('hourlyRate').textContent='¥'+bigMoney(c.hourlyRate);
 $('incomeMessage').textContent=copy[3];
 $('sampleNote').textContent=hasSettings?'按你的本地设置估算，不代表实际到账。':'正在使用示例薪资，不是你的真实收入。';
 const percent=c.percent.toFixed(1);
 $('progressPercent').innerHTML=percent+'<span>%</span>';
 $('progressFill').style.width=percent+'%';
 $('workProgress').setAttribute('aria-valuenow',percent);
 $('workProgress').setAttribute('aria-valuetext',`${percent}% · 已完成 ${(c.workedSeconds/3600).toFixed(2)} 小时，共 ${(c.totalSeconds/3600).toFixed(2)} 小时`);
 $('hoursWorked').textContent=(c.workedSeconds/3600).toFixed(2);$('hoursTotal').textContent=(c.totalSeconds/3600).toFixed(2);
 $('progressMessage').textContent=c.state==='off'?'休息也是正经事':c.percent>=100?'今日任务，顺利完成':c.percent>=80?'胜利就在前方':c.percent>=50?'已经超过一半啦':'慢慢来，也是在前进';
 let breakText='不扣休息';
 if(settings.breakEnabled){let a=+settings.breakStart.slice(0,2)*60+ +settings.breakStart.slice(3),b=+settings.breakEnd.slice(0,2)*60+ +settings.breakEnd.slice(3);breakText=`休息 ${((b-a)+1440)%1440} 分钟`;}
 $('shiftLabel').textContent=`${settings.start}—${settings.end}${settings.end<settings.start?'（次日）':''} · ${breakText}`;
 if(c.shiftDate!==dateKey(now))$('shiftLabel').textContent=`${c.shiftDate.slice(5)} 开始的班次 · ${settings.start}—${settings.end}`;
 $('monthEarned').textContent=bigMoney(c.monthEarned);$('monthEarned').title='¥'+money(c.monthEarned);
 const monthTotal=settings.salaryType==='monthly'?settings.salary:settings.salary*c.monthWorkdays;
 $('monthTotal').textContent='/ 本月预计 ¥'+bigMoney(monthTotal);
 const monthPercent=Math.min(100,c.monthEarned/monthTotal*100);
 $('monthPercent').textContent=monthPercent.toFixed(1)+'%';$('monthFill').style.width=monthPercent+'%';
 $('monthLabel').textContent=`${now.getMonth()+1} 月 · 共 ${c.monthWorkdays} 个排班日`;
 $('monthDescription').textContent=`已完成 ${c.completedDays} 班 · 按本月班表推算`;
 $('setupBanner').hidden=hasSettings;
 $('goalName').textContent=goal.name;$('goalPrice').textContent='¥'+bigMoney(goal.price);
 const needed=Math.max(0,goal.price-c.todayEarned),seconds=c.hourlyRate>0?Math.ceil(needed/c.hourlyRate*3600):0;
 $('goalHint').textContent=needed>0?'还需有效工时':'当班估算已达到';
 $('goalTime').textContent=needed<=0?'小目标，达成！':seconds>=36000000?'超过 1 万小时':seconds>=360000?`${(seconds/3600).toFixed(1)} 小时`:`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 if(lastState!==c.state){
  $('motivation').textContent=copy[2];
  document.body.classList.toggle('resting',c.state!=='working');
  updateSceneDescription(c.state);
  lastState=c.state;
 }
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>$('toast').classList.remove('show'),4000);}
const form=$('settingsForm');
function updateBreakFields(){const enabled=form.elements.breakEnabled.checked;$('breakFields').hidden=!enabled;form.elements.breakStart.disabled=!enabled;form.elements.breakEnd.disabled=!enabled;}
function populateSettings(){
 for(const key of ['salaryType','salary','start','end','breakStart','breakEnd'])form.elements[key].value=settings[key];
 form.elements.breakEnabled.checked=settings.breakEnabled;
 form.querySelectorAll('[name=workday]').forEach(input=>input.checked=settings.workdays.includes(Number(input.value)));
 $('salaryLabel').textContent=settings.salaryType==='monthly'?'月薪金额（元）':'日薪金额（元）';
 form.elements.goalName.value=goal.name;form.elements.goalPrice.value=goal.price;form.elements.motionChoice.value=motionChoice;
 $('formError').hidden=true;updateBreakFields();
}
for(const button of document.querySelectorAll('.settings-open'))button.addEventListener('click',()=>{populateSettings();$('settingsDialog').showModal();});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
$('aboutButton').addEventListener('click',()=>$('aboutDialog').showModal());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
form.elements.breakEnabled.addEventListener('change',updateBreakFields);
form.elements.salaryType.addEventListener('change',()=>{$('salaryLabel').textContent=form.elements.salaryType.value==='monthly'?'月薪金额（元）':'日薪金额（元）';});
form.addEventListener('submit',e=>{
 e.preventDefault();
 const input={salaryType:form.elements.salaryType.value,salary:Number(form.elements.salary.value),start:form.elements.start.value,end:form.elements.end.value,breakEnabled:form.elements.breakEnabled.checked,breakStart:form.elements.breakStart.value,breakEnd:form.elements.breakEnd.value,workdays:[...form.querySelectorAll('[name=workday]:checked')].map(el=>Number(el.value))};
 const result=validateSettings(input);
 const gp=Number(form.elements.goalPrice.value),gn=form.elements.goalName.value.trim();
 if(!gn || !Number.isFinite(gp) || gp<=0 || gp>1e9){$('formError').textContent='请填写目标名称，以及大于 0 且不超过 10 亿的目标金额。';$('formError').hidden=false;return;}
 if(!result.ok){$('formError').textContent=result.errors.join(' ');$('formError').hidden=false;return;}
 settings=result.settings;hasSettings=true;goal={name:gn.slice(0,24),price:gp};motionChoice=normalizeMotionChoice(form.elements.motionChoice.value);setMotion();
 try{localStorage.setItem(STORE,JSON.stringify(settings));localStorage.setItem('carrot-workday-goal-v1',JSON.stringify(goal));localStorage.setItem(MOTION_STORE,motionChoice);storageAvailable=true;}catch{storageAvailable=false;}
 $('settingsDialog').close();render();toast(storageAvailable?'已保存。你的专属搬砖小队，出发！':'设置已应用，但浏览器未允许保存；刷新后会恢复示例。');
});
function updateSceneDescription(state=lastState) {
 const m=motionState(motionChoice,reduced.matches);
 $('landscape').setAttribute('aria-label',!m.playing?'灰色长耳小驴场景，动画已暂停':state==='working'?'灰色长耳小驴带着杆上胡萝卜，迈着自然的步子慢慢前进并转向':'灰色长耳小驴轻轻呼吸、眨眼休息，等待下一次出发');
}
function setMotion(){
 const m=motionState(motionChoice,reduced.matches);
 document.body.classList.toggle('paused',!m.playing);
 document.body.classList.toggle('motion-on',m.explicitPlay);
 $('motionButton').disabled=false;
 $('motionButton').textContent=m.playing?'Ⅱ 暂停动画':'▶ 播放动画';
 $('motionButton').setAttribute('aria-pressed',String(!m.playing));
 $('motionButton').setAttribute('aria-label',m.playing?'暂停小驴动画':'播放小驴动画');
 $('motionButton').title=m.playing?'暂停动画':'播放动画（可覆盖系统减少动态效果）';
 $('motionHint').hidden=m.playing;
 $('motionHint').textContent=m.systemPaused?'系统开启了减少动态效果。点击右上角「播放动画」，小驴就会动起来。':'动画已暂停。点击右上角「播放动画」继续，不影响计时和收入估算。';
 updateSceneDescription();
}
$('motionButton').addEventListener('click',()=>{
 motionChoice=toggleMotion(motionChoice,reduced.matches);setMotion();
 try{localStorage.setItem(MOTION_STORE,motionChoice);}catch{}
});
function setFocus(){ $('timerDigits').hidden=focusMode;$('focusMessage').hidden=!focusMode;$('focusButton').textContent=focusMode?'显示倒计时 · 看看进度':'隐藏倒计时 · 专注一会儿';$('focusButton').setAttribute('aria-pressed',String(focusMode));$('timerLabel').textContent=focusMode?'专注模式':stateCopy[lastState||'before'][1]; }
 $('focusButton').addEventListener('click',()=>{focusMode=!focusMode;setFocus();try{localStorage.setItem('carrot-workday-focus-v1',String(focusMode));}catch{}});
reduced.addEventListener?.('change',setMotion);
window.addEventListener('storage',e=>{if(e.key===MOTION_STORE){motionChoice=normalizeMotionChoice(e.newValue);setMotion();}if(e.key===STORE){try{const valid=validateSettings(JSON.parse(e.newValue));if(valid.ok){settings=valid.settings;hasSettings=true;}else{settings={...DEFAULTS,workdays:[...DEFAULTS.workdays]};hasSettings=false;}render();}catch{}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
setMotion();render();setFocus();mountDonkeyScene($('donkeyCanvas'));setInterval(render,1000);
