import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,validateSettings,calculate} from './dist/time.mjs';
const settings=(x={})=>({...DEFAULTS,workdays:[1,2,3,4,5],...x});
const date=(day,time)=>new Date(`${day}T${time}:00`);
const calc=(time,x={})=>calculate(date('2026-11-04',time),settings(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('validation rejects invalid and sanitizes workdays',()=>{
 for(const change of [{salary:0},{salary:Infinity},{salary:'12000'},{salary:1e10},{salaryType:'x'},{start:'9:00'},{start:'18:00'},{end:'25:00'},{workdays:[]},{workdays:[7]},{workdays:[1.2]},{breakEnabled:'true'},{breakEnd:'12:00'},{breakStart:'08:00'},{breakEnd:'19:00'},{breakStart:'09:00',breakEnd:'18:00'}])assert.equal(validateSettings(settings(change)).ok,false,JSON.stringify(change));
 assert.equal(validateSettings(null).ok,false);assert.deepEqual(validateSettings(settings({workdays:[5,1,1]})).settings.workdays,[1,5]);
 assert.equal(validateSettings(settings({breakEnabled:false,breakStart:'bad'})).ok,true);
 assert.throws(()=>calculate(new Date(NaN),settings()));
});
test('daytime boundaries and resting accrual',()=>{
 assert.equal(calc('08:00').state,'before');assert.equal(calc('08:00').countdownSeconds,3600);
 assert.equal(calc('09:00').state,'working');assert.equal(calc('09:00').percent,0);assert.equal(calc('09:00').countdownSeconds,32400);
 assert.equal(calc('12:00').state,'break');assert.equal(calc('13:29').state,'break');assert.equal(calc('13:30').state,'working');
 assert.equal(calc('12:00').workedSeconds,10800);assert.equal(calc('13:30').workedSeconds,10800);
 assert.equal(calc('18:00').state,'after');assert.equal(calc('18:00').percent,100);assert.equal(calc('18:00').countdownSeconds,0);assert.equal(calc('23:59').percent,100);
 assert.equal(calc('18:00').totalSeconds,27000);near(calc('10:00').percent,100/7.5);
});
test('weekend has no today accrual and finds next start',()=>{
 const c=calculate(date('2026-11-07','15:00'),settings());assert.equal(c.state,'off');assert.equal(c.todayEarned,0);assert.equal(c.target.getDay(),1);assert.equal(c.target.getHours(),9);assert.equal(c.countdownSeconds,42*3600);
});
test('monthly and daily estimates',()=>{
 const c=calc('18:00');assert.equal(c.monthWorkdays,21);near(c.dayRate,12000/21);near(c.monthEarned,3*12000/21);assert.equal(c.completedDays,3);
 near(calc('10:00',{salaryType:'daily',salary:750}).todayEarned,100);near(calc('10:00',{salaryType:'daily',salary:750}).monthEarned,1600);
 near(calculate(date('2026-11-30','23:59'),settings()).monthEarned,12000);
 assert.equal(calculate(date('2026-12-01','08:00'),settings()).monthEarned,0);
 assert.equal(calculate(date('2027-01-01','08:00'),settings()).monthEarned,0);
});
const overnight={start:'22:00',end:'06:00',breakStart:'01:00',breakEnd:'02:00'};
test('overnight spans midnight and preserves start weekday',()=>{
 assert.equal(validateSettings(settings(overnight)).ok,true);
 const c=calculate(date('2026-11-07','00:00'),settings(overnight));assert.equal(c.state,'working');assert.equal(c.shiftDate,'2026-11-06');assert.equal(c.workedSeconds,7200);assert.equal(c.countdownSeconds,21600);
 assert.equal(calculate(date('2026-11-07','01:00'),settings(overnight)).state,'break');assert.equal(calculate(date('2026-11-07','02:00'),settings(overnight)).state,'working');
 assert.equal(calculate(date('2026-11-07','06:00'),settings(overnight)).state,'after');assert.equal(calculate(date('2026-11-07','06:01'),settings(overnight)).state,'off');
 assert.equal(calculate(date('2026-11-09','01:00'),settings(overnight)).state,'before');
 assert.equal(validateSettings(settings({...overnight,breakStart:'23:30',breakEnd:'00:30'})).ok,true);
 assert.equal(validateSettings(settings({...overnight,breakStart:'05:00',breakEnd:'23:00'})).ok,false);
});
test('overnight month and year rollover: accrual belongs to shift-start month',()=>{
 const s=settings({...overnight,workdays:[0,1,2,3,4,5,6]});const c=calculate(date('2027-01-01','03:00'),s);
 assert.equal(c.shiftDate,'2026-12-31');assert.equal(c.state,'working');assert.equal(c.monthEarned,0);near(c.dayRate,12000/31);near(c.todayEarned,12000/31*4/7);
 const nov=calculate(date('2026-12-01','03:00'),s);near(nov.dayRate,12000/30);assert.equal(nov.monthEarned,0);
});
test('no break, full-day workweek, subsecond countdown',()=>{
 const s=settings({breakEnabled:false,workdays:[0,1,2,3,4,5,6]});assert.equal(calculate(date('2026-11-08','12:00'),s).state,'working');assert.equal(calc('18:00',{breakEnabled:false}).totalSeconds,32400);
 assert.equal(calculate(new Date(2026,10,4,8,59,59,500),s).countdownSeconds,1);
});

test('midnight shift end retains completed prior shift exactly at boundary',()=>{
 const s=settings({start:'16:00',end:'00:00',breakEnabled:false});
 const c=calculate(date('2026-11-07','00:00'),s);assert.equal(c.state,'after');assert.equal(c.shiftDate,'2026-11-06');assert.equal(c.percent,100);
 assert.equal(calculate(date('2026-11-07','00:01'),s).state,'off');
});
