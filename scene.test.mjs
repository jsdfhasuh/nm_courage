import test from 'node:test';
import assert from 'node:assert/strict';
import {poseAt,bodyAt,gaitClock,timeAtGait,GAIT,hoofGeometry} from './dist/donkey-scene.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('world-space stance contacts and invariant limb lengths throughout patrol',()=>{
 let prev=null;for(let i=0;i<=12000;i++){
  const t=i/600,p=poseAt(t,true);assert.ok(p.legs.filter(l=>l.stance).length>=2);
  for(const [j,l] of p.legs.entries()){
   assert.ok(Number.isFinite(l.knee.x+l.knee.y+l.knee.z));
   assert.ok(dist(l.root,l.foot)<53,'reachable IK target');
   assert.ok(Math.abs(dist(l.root,l.knee)-20)<1e-8,'upper bone constant');
   assert.ok(Math.abs(dist(l.knee,l.foot)-33)<1e-8,'lower bone constant');
   if(l.stance){assert.equal(l.foot.y,0);if(prev&&prev.legs[j].stance&&l.phase>prev.legs[j].phase)assert.ok(dist(l.foot,prev.legs[j].foot)<1e-9,'planted hoof cannot slide');}
   else assert.ok(l.foot.y>=0&&l.foot.y<=GAIT.lift+1e-9);
  }prev=p;
 }
});
test('patrol has long profiles, continuous turn boundaries and inverse gait clock',()=>{
 for(const t of [-10,-1,0,.2,2.8,3,3.4,5,7.8,8,9.99,10,23])assert.ok(Math.abs(timeAtGait(gaitClock(t))-t)<1e-10);
 assert.equal(bodyAt(1).yaw,0);assert.equal(bodyAt(6).yaw,-Math.PI);
 for(const t of [0,3,5,8,10]){const a=bodyAt(t-1e-6),b=bodyAt(t+1e-6);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.001);assert.ok(Math.abs(Math.sin(a.yaw-b.yaw))<.001);}
 assert.ok(bodyAt(2.5).x>bodyAt(.5).x);assert.ok(bodyAt(7.5).x<bodyAt(5.5).x);
});
test('carrot remains attached by a 40-unit string, including turns',()=>{
 for(let i=0;i<1000;i++){const p=poseAt(i/100);assert.ok(Math.abs(dist(p.anchor,p.carrot)-40)<1e-9);}
});
test('resting pose keeps hooves planted while head and tail may idle',()=>{
 for(let i=0;i<1000;i++){const p=poseAt(i/100,false);for(const l of p.legs){assert.equal(l.foot.y,0);assert.ok(Math.abs(dist(l.knee,l.foot)-33)<1e-8);}}
});
test('patrol never stalls and direction tracks world velocity through smooth turns',()=>{
 const e=1e-5;for(let i=0;i<=1000;i++){const t=i/100,a=bodyAt(t-e),b=bodyAt(t+e),v={x:(b.x-a.x)/(2*e),z:(b.z-a.z)/(2*e)},p=bodyAt(t);assert.ok(Math.hypot(v.x,v.z)>10,'no stationary marching');assert.ok(Math.abs(Math.sin(Math.atan2(-v.z,v.x)-p.yaw))<1e-7);}
 for(const t of [0,3,5,8,10]){const v=x=>{let a=bodyAt(x-e),b=bodyAt(x+e);return [(b.x-a.x)/(2*e),(b.z-a.z)/(2*e)]},a=v(t-e*2),b=v(t+e*2);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-4);const a1=(gaitClock(t)-gaitClock(t-e))/e,b1=(gaitClock(t+e)-gaitClock(t))/e;assert.ok(Math.abs(a1-b1)<1e-6);}
});
test('patrol repeats after ten seconds without joint or carrot discontinuity',()=>{
 for(let i=0;i<1000;i++){const a=poseAt(i/100),b=poseAt(i/100+10);for(let j=0;j<4;j++){for(const p of ['root','knee','foot'])assert.ok(dist(a.legs[j][p],b.legs[j][p])<1e-8);}}
});

test('all four hoof contact corners stay fixed and never sink below the floor',()=>{
 let prev;for(let i=0;i<=6000;i++){const pose=poseAt(i/600),corners=pose.legs.map(l=>hoofGeometry(l).bottom);for(let j=0;j<4;j++){for(let k=0;k<4;k++){assert.ok(corners[j][k].y>=-1e-10);if(prev&&pose.legs[j].stance&&prev.pose.legs[j].stance&&pose.legs[j].phase>prev.pose.legs[j].phase)assert.ok(dist(corners[j][k],prev.corners[j][k])<1e-9);}}prev={pose,corners};}
});
