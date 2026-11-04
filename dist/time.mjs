/** Local-calendar work estimates. Scheduled days are shift-start dates; holidays are not inferred. */
export const DEFAULTS = Object.freeze({salaryType:'monthly',salary:12000,start:'09:00',end:'18:00',breakEnabled:true,breakStart:'12:00',breakEnd:'13:30',workdays:Object.freeze([1,2,3,4,5])});
const MINUTE=60000;
const minutes = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0,2))*60+Number(value.slice(3)) : NaN;
export function validateSettings(input) {
  const errors=[];
  if (!input || typeof input!=='object' || Array.isArray(input)) return {ok:false,errors:['请填写有效的设置。']};
  const s={...input};
  if(!['monthly','daily'].includes(s.salaryType)) errors.push('请选择月薪或日薪。');
  if(typeof s.salary!=='number'||!Number.isFinite(s.salary)||s.salary<=0||s.salary>1e9) errors.push('薪资须大于 0 且不超过 10 亿。');
  const a=minutes(s.start),b=minutes(s.end);
  if(!Number.isFinite(a)||!Number.isFinite(b)) errors.push('上下班时间须为有效的 HH:mm。');
  else if(a===b) errors.push('上下班时间不能相同。');
  if(typeof s.breakEnabled!=='boolean') errors.push('请选择是否扣除休息时间。');
  if(s.breakEnabled && Number.isFinite(a) && Number.isFinite(b) && a!==b){
    let bs=minutes(s.breakStart),be=minutes(s.breakEnd),end=b+(b<a?1440:0);
    if(bs<a)bs+=1440;
    if(be<a)be+=1440;
    if(!Number.isFinite(bs)||!Number.isFinite(be)||be<=bs||bs<a||be>end||be-bs>=end-a)errors.push('休息时间须在班次内、结束晚于开始，且不能覆盖整个班次。');
  }
  if(!Array.isArray(s.workdays)||!s.workdays.length||s.workdays.some(d=>!Number.isInteger(d)||d<0||d>6))errors.push('请至少选择一个有效工作日。');
  if(errors.length)return {ok:false,errors};
  return {ok:true,settings:{salaryType:s.salaryType,salary:s.salary,start:s.start,end:s.end,breakEnabled:s.breakEnabled,breakStart:s.breakStart??DEFAULTS.breakStart,breakEnd:s.breakEnd??DEFAULTS.breakEnd,workdays:[...new Set(s.workdays)].sort((a,b)=>a-b)}};
}
const day = (d, offset=0) => new Date(d.getFullYear(),d.getMonth(),d.getDate()+offset);
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function at(d,minute){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+Math.floor(minute/1440),Math.floor((minute%1440)/60),minute%60);}
function shift(d,s){
 const a=minutes(s.start),b=minutes(s.end),start=at(d,a),end=at(d,b+(b<a?1440:0));
 let breakStart=null,breakEnd=null;
 if(s.breakEnabled){let bs=minutes(s.breakStart),be=minutes(s.breakEnd);breakStart=at(d,bs+(bs<a?1440:0));breakEnd=at(d,be+(be<a?1440:0));}
 return {date:day(d),start,end,breakStart,breakEnd,totalSeconds:Math.max(0,(end-start-(breakStart?breakEnd-breakStart:0))/1000)};
}
function worked(t,sh){const elapsed=Math.max(0,Math.min(t,sh.end)-sh.start);const rest=sh.breakStart?Math.max(0,Math.min(t,sh.breakEnd)-sh.breakStart):0;return Math.max(0,Math.min(sh.totalSeconds,(elapsed-rest)/1000));}
function monthDays(d,s){let count=0;const n=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();for(let i=1;i<=n;i++)if(s.workdays.includes(new Date(d.getFullYear(),d.getMonth(),i).getDay()))count++;return count;}
function rate(d,s){return s.salaryType==='daily'?s.salary:s.salary/monthDays(d,s);}
/** Dates are Date objects; money is unrounded so clients can format to 2 decimals. */
export function calculate(nowDate,settings){
 if(!(nowDate instanceof Date)||!Number.isFinite(nowDate.getTime()))throw new TypeError('nowDate must be a valid Date');
 const valid=validateSettings(settings);if(!valid.ok)throw new TypeError(valid.errors.join(' '));const s=valid.settings,now=nowDate.getTime(),today=day(nowDate),yesterday=day(nowDate,-1);
 const todayScheduled=s.workdays.includes(today.getDay());let selected=shift(today,s),state;
 const previous=shift(yesterday,s);
 if(s.workdays.includes(yesterday.getDay())&&previous.end>=today&&now>=previous.start&&now<=previous.end){selected=previous;state=now===+previous.end?'after':'working';}
 else if(!todayScheduled)state='off';
 else if(now<selected.start)state='before';
 else if(now>=selected.end)state='after';
 else state='working';
 if(state==='working'&&selected.breakStart&&now>=selected.breakStart&&now<selected.breakEnd)state='break';
 let target=null,targetLabel='今天辛苦了',countdownSeconds=0;
 if(state==='working'||state==='break'){target=selected.end;targetLabel='距离下班';}
 else if(state==='before'){target=selected.start;targetLabel='距离上班';}
 else if(state==='off'){for(let i=0;i<=7;i++){const d=day(today,i),sh=shift(d,s);if(s.workdays.includes(d.getDay())&&sh.start>now){target=sh.start;break;}}targetLabel='距离下次上班';}
 if(target)countdownSeconds=Math.max(0,Math.ceil((target-now)/1000));
 const workedSeconds=state==='off'?0:worked(now,selected),totalSeconds=selected.totalSeconds;
 const percent=totalSeconds?Math.min(100,workedSeconds/totalSeconds*100):0;
 const dayRate=rate(selected.date,s),hourlyRate=totalSeconds?dayRate/(totalSeconds/3600):0;
 let monthEarned=0,completedDays=0,monthWorkedEquivalentDays=0;const monthWorkdays=monthDays(today,s);
 for(let i=1;i<=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();i++){
 const d=new Date(today.getFullYear(),today.getMonth(),i);if(!s.workdays.includes(d.getDay()))continue;
 const sh=shift(d,s),fraction=sh.totalSeconds?worked(now,sh)/sh.totalSeconds:0;
 monthWorkedEquivalentDays+=fraction;if(now>=sh.end)completedDays++;
 }
 monthEarned=monthWorkedEquivalentDays*(s.salaryType==='daily'?s.salary:s.salary/monthWorkdays);
 return {state,countdownSeconds,target,targetLabel,percent,workedSeconds,totalSeconds,todayEarned:dayRate*percent/100,dayRate,hourlyRate,monthEarned,monthWorkdays,completedDays,monthWorkedEquivalentDays,shiftDate:dateKey(selected.date),shiftStart:selected.start,shiftEnd:selected.end,breakStart:selected.breakStart,breakEnd:selected.breakEnd};
}
