import test from 'node:test';
import assert from 'node:assert/strict';
import {poseAt,hoofGeometry} from './dist/donkey-scene.mjs';
import {createChaseController,updateChaseController,DEFAULT_CHASE_LIMITS} from './dist/chase.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const near=(a,b,message,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} != ${b}`);
const bounds={minX:-60,maxX:46,minZ:-16,maxZ:16};

function checkPose(p,previous=null){
  assert.ok(p.legs.filter(l=>l.stance).length>=2,'at least two supporting feet');
  for(const [i,leg] of p.legs.entries()){
    for(const point of [leg.root,leg.knee,leg.foot])assert.ok(Number.isFinite(point.x+point.y+point.z),'finite joints');
    near(dist(leg.root,leg.knee),20,'20-unit upper bone');
    near(dist(leg.knee,leg.foot),33,'33-unit lower bone');
    assert.ok(dist(leg.root,leg.foot)<53,'reachable ankle without stretching');
    const sole=hoofGeometry(leg).bottom;
    assert.ok(sole.every(p=>p.y>=-1e-9),'the sole does not sink through the ground');
    if(leg.stance){
      assert.equal(leg.foot.y,0);
      if(previous?.legs[i].stance){
        near(dist(leg.foot,previous.legs[i].foot),0,'world-space foot anchor');
        near(leg.hoofYaw,previous.legs[i].hoofYaw,'world-space hoof orientation');
        const oldSole=hoofGeometry(previous.legs[i]).bottom;
        sole.forEach((point,j)=>near(dist(point,oldSole[j]),0,'whole contact sole is fixed'));
      }
    }
  }
  near(dist(p.anchor,p.carrot),40,'carrier string length');
}

test('initialization preserves the complete current pose, including mid-swing sole orientation',()=>{
  for(let t=0;t<10;t+=.031){
    for(const walking of [false,true]){
      const initial=poseAt(t,walking),s=createChaseController(initial);
      assert.deepEqual(s.pose,initial);assert.notEqual(s.pose,initial);
      const p=updateChaseController(s,1e-7,{target:{x:180,z:8},walking:true});
      for(let i=0;i<4;i++){
        assert.ok(dist(initial.legs[i].foot,p.legs[i].foot)<.0001,'no initial foot teleport');
        const a=hoofGeometry(initial.legs[i]).bottom,b=hoofGeometry(p.legs[i]).bottom;
        a.forEach((point,j)=>assert.ok(dist(point,b[j])<.0001,'no initial sole rotation pop'));
      }
      assert.ok(Math.hypot(initial.body.x-p.body.x,initial.body.z-p.body.z)<.0001);
      checkPose(p);
    }
  }
});

test('zero, negative and nonfinite dt freeze all visible geometry, even with changed input',()=>{
  const s=createChaseController(poseAt(3.6)),p=s.pose;
  for(const dt of [0,-2,NaN,Infinity]){
    assert.equal(updateChaseController(s,dt,{target:{x:-300,z:20},walking:false,bounds}),p);
    assert.equal(s.time,3.6);
  }
});

test('slow frames and returning from background use the same capped integration',()=>{
  const a=createChaseController(poseAt(7.8)),b=createChaseController(poseAt(7.8)),input={target:{x:200,z:-12}};
  const pa=updateChaseController(a,1000,input),pb=updateChaseController(b,.05,input);
  assert.deepEqual(pa,pb);near(pa.t,7.85,'capped clock');
});

test('rapid target reversals preserve contacts, speed, acceleration and angular limits',()=>{
  let seed=123456;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let start=0;start<10;start+=.25){
    const s=createChaseController(poseAt(start),{bounds});let previous=s.pose,previousV={x:0,z:0,w:0},target;
    for(let i=0;i<1200;i++){
      if(i%37===0)target={x:(random()-.5)*1500,z:(random()-.5)*400};
      const p=updateChaseController(s,1/120,{target,walking:i%500<400});
      checkPose(p,previous);
      const v={x:(p.body.x-previous.body.x)*120,z:(p.body.z-previous.body.z)*120,w:(p.body.yaw-previous.body.yaw)*120};
      assert.ok(Math.hypot(v.x,v.z)<=DEFAULT_CHASE_LIMITS.maxSpeed+1e-7,'bounded linear speed');
      assert.ok(Math.hypot(v.x-previousV.x,v.z-previousV.z)*120<=DEFAULT_CHASE_LIMITS.maxAcceleration+1e-6,'bounded linear acceleration');
      assert.ok(Math.abs(v.w)<=DEFAULT_CHASE_LIMITS.maxTurnRate+1e-7,'bounded turn speed');
      assert.ok(Math.abs(v.w-previousV.w)*120<=DEFAULT_CHASE_LIMITS.maxTurnAcceleration+1e-6,'bounded turn acceleration');
      assert.equal(s.contactLimited,false,'normal steering should not reach the emergency root brake');
      assert.ok(p.body.x>=Math.min(previous.body.x,bounds.minX)-1e-7&&p.body.x<=Math.max(previous.body.x,bounds.maxX)+1e-7,'no motion farther outside x bounds');
      assert.ok(p.body.z>=Math.min(previous.body.z,bounds.minZ)-1e-7&&p.body.z<=Math.max(previous.body.z,bounds.maxZ)+1e-7,'no motion farther outside z bounds');
      previous=p;previousV=v;
    }
  }
});

test('low-frame-rate pursuit, idle transitions and patrol return remain anatomically valid',()=>{
  for(const fps of [15,20,30,60,144])for(let start=0;start<10;start+=.5){
    const s=createChaseController(poseAt(start,start%1<.5),{bounds});let previous=s.pose;
    for(let i=0;i<fps*12;i++){
      const input={target:Math.floor(i/fps)%4===2?null:{x:Math.floor(i/fps)%2?200:-200,z:Math.sin(i/7)*16},walking:Math.floor(i/fps)%5!==4};
      const p=updateChaseController(s,1/fps,input);checkPose(p,previous);
      assert.equal(s.contactLimited,false,'early recovery steps avoid body emergency stops');previous=p;
    }
  }
});

test('idle settles every hoof, holds root position and resumes without a teleport',()=>{
  const s=createChaseController(poseAt(1.4));
  for(let i=0;i<150;i++)updateChaseController(s,1/60,{target:{x:190,z:12}});
  for(let i=0;i<240;i++)updateChaseController(s,1/60,{walking:false,target:null});
  assert.ok(s.pose.legs.every(l=>l.stance));near(s.vx,0,'idle x speed');near(s.vz,0,'idle z speed');near(s.omega,0,'idle turn speed');
  const stopped=s.pose;
  for(let i=0;i<120;i++){const p=updateChaseController(s,1/60);checkPose(p,stopped);near(p.body.x,stopped.body.x,'idle root x');near(p.body.z,stopped.body.z,'idle root z');}
  const resumed=updateChaseController(s,1/60,{target:{x:-190,z:-12},walking:true});
  assert.ok(Math.hypot(resumed.body.x-stopped.body.x,resumed.body.z-stopped.body.z)<.03,'acceleration-limited restart');
});

test('the donkey approaches a fixed carrot and leaves a muzzle-sized stopping distance',()=>{
  const s=createChaseController(poseAt(0)),target={x:100,z:-12};
  for(let i=0;i<1200;i++)updateChaseController(s,1/60,{target});
  const d=Math.hypot(s.pose.body.x-target.x,s.pose.body.z-target.z);
  assert.ok(d>=49&&d<=51,`carrot gap ${d}`);assert.ok(s.pose.legs.every(l=>l.stance));
  const previous=s.pose;
  const after=updateChaseController(s,1/60,{target:null});
  assert.ok(Math.hypot(after.body.x-previous.body.x,after.body.z-previous.body.z)<.03,'clearing the pointer does not reset to patrol position');
  for(let i=0;i<900;i++)updateChaseController(s,1/60);
  assert.ok(Math.hypot(s.pose.body.x-previous.body.x,s.pose.body.z-previous.body.z)>15,'patrol resumes');
});

test('a narrower resized stage is approached smoothly rather than snapping the body',()=>{
  const s=createChaseController(poseAt(4)),initial=s.pose;
  updateChaseController(s,0,{bounds});assert.deepEqual(s.pose,initial);
  for(let i=0;i<900;i++)updateChaseController(s,1/60,{target:{x:200,z:0}});
  assert.ok(s.pose.body.x<=bounds.maxX&&s.pose.body.x>=bounds.minX);
  assert.ok(s.pose.body.z<=bounds.maxZ&&s.pose.body.z>=bounds.minZ);
});
