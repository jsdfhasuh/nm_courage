import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DEFAULTS, validateSettings} from './dist/time.mjs';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'nm-runtime-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return join(dir,'runtime-config.json');
}
function render(output, overrides={}) {
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NM_')));
  const result=spawnSync('sh',['deploy/40-runtime-config.sh',output,'deploy/runtime-config.jq'],{
    env:{...env,...overrides},encoding:'utf8'
  });
  return {...result,json:result.status===0?JSON.parse(readFileSync(output,'utf8')):null};
}

test('runtime renderer emits only supplied whitelist fields and ignores other environment',t=>{
  const file=fixture(t), r=render(file,{NM_SALARY:'15000',NM_SECRET:'never-public',UNRELATED_SECRET:'never-public'});
  assert.equal(r.status,0,r.stderr);
  assert.deepEqual(r.json,{settings:{salary:15000}});
  assert.equal(r.stdout,'');
  assert.equal(readFileSync(file,'utf8').includes('never-public'),false);
  assert.equal(statSync(file).mode & 0o777,0o644);
});
test('unset or blank defaults produce empty JSON and clear previous generated defaults',t=>{
  const file=fixture(t);
  assert.equal(render(file,{NM_SALARY:'15000'}).status,0);
  const r=render(file,{NM_SALARY:'  ',NM_GOAL_NAME:'',NM_BREAK_ENABLED:''});
  assert.equal(r.status,0,r.stderr);
  assert.deepEqual(r.json,{});
});
test('runtime renderer handles typed values, Sunday, deduplication and overnight breaks',t=>{
  const r=render(fixture(t),{NM_SALARY_TYPE:'daily',NM_SALARY:'300.50',NM_WORK_START:'22:00',NM_WORK_END:'06:00',NM_BREAK_START:'01:00',NM_BREAK_END:'01:30',NM_BREAK_ENABLED:'true',NM_WORKDAYS:'0, 1,1,6',NM_GOAL_PRICE:'35.25'});
  assert.equal(r.status,0,r.stderr);
  assert.deepEqual(r.json.settings,{salaryType:'daily',salary:300.5,start:'22:00',end:'06:00',breakEnabled:true,breakStart:'01:00',breakEnd:'01:30',workdays:[0,1,6]});
  assert.equal(r.json.goal.price,35.25);
  assert.equal(validateSettings({...DEFAULTS,...r.json.settings}).ok,true);
});
test('false break switch is preserved rather than treated as a missing value',t=>{
  const r=render(fixture(t),{NM_BREAK_ENABLED:'false',NM_WORK_START:'22:00',NM_WORK_END:'06:00',NM_WORKDAYS:'0'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.json.settings.breakEnabled,false);
  assert.deepEqual(r.json.settings.workdays,[0]);
  assert.equal(validateSettings({...DEFAULTS,...r.json.settings}).ok,true);
});
test('hostile text and quotes are JSON data, not executable configuration',t=>{
  const name='</script><img src=x>"\\';
  const r=render(fixture(t),{NM_GOAL_NAME:name});
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.json.goal.name,name);
});
test('invalid environment values fail closed without echoing supplied values',t=>{
  const cases=[
    {NM_SALARY:'0'},{NM_SALARY:'-1'},{NM_SALARY:'NaN'},{NM_SALARY:'1000000001'},
    {NM_SALARY:'$(cat /etc/passwd)'},{NM_SALARY_TYPE:'weekly'},
    {NM_WORK_START:'24:00'},{NM_WORK_END:'09:00'},{NM_BREAK_ENABLED:'yes'},
    {NM_WORKDAYS:'7'},{NM_WORKDAYS:'1,,2'},{NM_WORKDAYS:'false'},
    {NM_BREAK_START:'08:00'},{NM_BREAK_START:'12:00',NM_BREAK_END:'12:00'},
    {NM_WORK_START:'22:00',NM_WORK_END:'06:00'},
    {NM_GOAL_PRICE:'0'},{NM_GOAL_PRICE:'Infinity'},{NM_GOAL_NAME:'x'.repeat(25)}
  ];
  for (const env of cases) {
    const r=render(fixture(t),env);
    assert.notEqual(r.status,0,JSON.stringify(env));
    assert.match(r.stderr,/Invalid NM_/);
    assert.equal(r.stdout,'');
    assert.equal(r.stderr.includes('cat /etc/passwd'),false);
  }
});
test('invalid regeneration never replaces previously valid JSON',t=>{
  const file=fixture(t);
  assert.equal(render(file,{NM_SALARY:'15000'}).status,0);
  assert.notEqual(render(file,{NM_SALARY:'0'}).status,0);
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{settings:{salary:15000}});
});
