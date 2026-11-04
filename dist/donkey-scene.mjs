// Original 2.5D character rig. Feet are planted in world coordinates, not rotated rectangles.
const TAU=Math.PI*2;
export const GAIT={cycle:1,stance:0.68,loop:10,radius:12,lift:8};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>v*v*(3-2*v);
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a,n)=>({x:a.x*n,y:a.y*n,z:a.z*n});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>mul(a,1/(length(a)||1));
// C2-continuous patrol: feet keep moving with the body rather than marching through stops.
const SEGMENTS=[{d:3,g:3.75,a:.25,h:1},{d:2,g:3.25,a:.625,h:2},{d:3,g:3.75,a:.25,h:1},{d:2,g:3.25,a:.625,h:2}];
const phaseIn=(u,d,a,h=1)=>d*((1+a)*u-a*Math.sin(TAU*h*u)/(TAU*h));
export function gaitClock(t){let n=Math.floor(t/10),r=t-n*10,g=n*14;for(const v of SEGMENTS){if(r<=v.d)return g+phaseIn(r/v.d,v.d,v.a,v.h);r-=v.d;g+=v.g;}return g;}
export function timeAtGait(g){let n=Math.floor(g/14),r=g-n*14,t=n*10;for(const v of SEGMENTS){if(r<=v.g){let u=r/v.g;for(let i=0;i<7;i++)u-=(phaseIn(u,v.d,v.a,v.h)-r)/(v.d*(1+v.a-v.a*Math.cos(TAU*v.h*u)));return t+u*v.d;}r-=v.g;t+=v.d;}return t;}
const sideEase=u=>u-.66*Math.sin(TAU*u)/TAU;
const quintic=u=>u*u*u*(10+u*(-15+6*u));
const septic=u=>u**4*(35+u*(-84+u*(70-20*u)));
const END_SPEED=100/3*(1-.66);
function patrolAt(t){
 const r=((t%10)+10)%10,R=GAIT.radius;
 if(r<3)return {x:-50+100*sideEase(r/3),z:-R,yaw:0};
 if(r<5){const u=(r-3)/2,dx=END_SPEED*(1-6*u*u+4*u*u*u),dz=R*140*u**3*(1-u)**3;return {x:50+END_SPEED*2*(u-2*u**3+u**4),z:-R+2*R*septic(u),yaw:-Math.atan2(dz,dx)};}
 if(r<8)return {x:50-100*sideEase((r-5)/3),z:R,yaw:-Math.PI};
 const u=(r-8)/2,dx=END_SPEED*(1-6*u*u+4*u*u*u),dz=R*140*u**3*(1-u)**3;return {x:-50-END_SPEED*2*(u-2*u**3+u**4),z:R-2*R*septic(u),yaw:-Math.PI-Math.atan2(dz,dx)};
}
export function bodyAt(t,walking=true){
 const route=walking?patrolAt(t):{x:0,z:0,yaw:-.3},phase=gaitClock(t),stride=TAU*phase;
 return {...route,bob:walking?.65*Math.cos(stride*2)-.2*Math.cos(stride*4):.45*Math.sin(t*1.8),head:walking?.9*Math.sin(stride*2-.7):.4*Math.sin(t*1.8-.3),reach:walking?.75*Math.sin(stride*2-1.1):.3*Math.sin(t*1.8),roll:walking?.55*Math.sin(stride-.4):0};
}
function local(p,b){const c=Math.cos(b.yaw),s=Math.sin(b.yaw);return {x:b.x+p.x*c+p.z*s,y:p.y-15+b.bob,z:b.z-p.x*s+p.z*c+(p.y>50?b.roll||0:0)};}
function floorLocal(p,b){const v=local(p,b);v.y=0;return v;}
const LEG_DATA=[{name:'near-hind',x:-33,z:11,offset:0,bend:-1},{name:'near-front',x:26,z:10,offset:.25,bend:1},{name:'far-hind',x:-30,z:-11,offset:.5,bend:-1},{name:'far-front',x:23,z:-10,offset:.75,bend:1}];
function touchdown(startClock,leg){const b=bodyAt(timeAtGait(startClock+GAIT.stance*.5));return floorLocal({x:leg.x,y:0,z:leg.z},b);}
export function poseAt(t,walking=true){
 const body=bodyAt(t,walking);
 const legs=LEG_DATA.map(leg=>{
  const raw=gaitClock(t)-leg.offset,cycle=Math.floor(raw),phase=raw-cycle,start=cycle+leg.offset;
  const stance=phase<GAIT.stance;
  let foot,hoofYaw;
  if(!walking){foot=floorLocal({x:leg.x+(leg.bend===1?2:-2),y:0,z:leg.z},body);hoofYaw=body.yaw;}
  else if(stance){foot=touchdown(start,leg);hoofYaw=bodyAt(timeAtGait(start+GAIT.stance*.5)).yaw;}
  else {const q=(phase-GAIT.stance)/(1-GAIT.stance),a=touchdown(start,leg),b=touchdown(start+1,leg),e=quintic(q);foot={x:a.x+(b.x-a.x)*e,z:a.z+(b.z-a.z)*e,y:GAIT.lift*64*q**3*(1-q)**3};const ya=bodyAt(timeAtGait(start+GAIT.stance*.5)).yaw,yb=bodyAt(timeAtGait(start+1+GAIT.stance*.5)).yaw;hoofYaw=ya+Math.atan2(Math.sin(yb-ya),Math.cos(yb-ya))*e;}
  const root=local({x:leg.x,y:63,z:leg.z},body),dVec=sub(foot,root),d=length(dVec),u=unit(dVec),forward={x:Math.cos(body.yaw)*leg.bend,y:0,z:-Math.sin(body.yaw)*leg.bend},v=unit(sub(forward,mul(u,dot(forward,u)))),l1=20,l2=33,a=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-a*a));
  const knee=add(root,add(mul(u,a),mul(v,h)));
  return {...leg,root,knee,foot,hoofYaw,stance:walking?stance:true,phase};
 });
 const anchorLocal={x:90,y:160+body.head,z:0},anchor=local(anchorLocal,body);
 // A low-pass, small-angle pendulum response to rod-tip horizontal acceleration.
 const eps=.018,lag=.16,anchorAt=v=>local(anchorLocal,bodyAt(v,walking)),a0=anchorAt(t-lag-eps),a1=anchorAt(t-lag),a2=anchorAt(t-lag+eps),ax=(a2.x-2*a1.x+a0.x)/(eps*eps),az=(a2.z-2*a1.z+a0.z)/(eps*eps),dx=clamp(-40*ax/360,-5,5),dz=clamp(-40*az/360,-5,5);
 const carrot={x:anchor.x+dx,y:anchor.y-Math.sqrt(40*40-dx*dx-dz*dz),z:anchor.z+dz};
 return {t,body,legs,anchor,carrot,walking};
}
export function hoofGeometry(leg){
 const swing=leg.stance?0:(leg.phase-GAIT.stance)/(1-GAIT.stance),roll=leg.stance?0:-.42*Math.sin(Math.PI*swing)**3,yaw=leg.hoofYaw,forward={x:Math.cos(yaw),y:0,z:-Math.sin(yaw)};
 const hoof=(x,y,z)=>add(leg.foot,add(mul(forward,x*Math.cos(roll)-y*Math.sin(roll)),{x:Math.sin(yaw)*z,y:x*Math.sin(roll)+y*Math.cos(roll),z:Math.cos(yaw)*z}));
 return {bottom:[hoof(-3,0,-2.5),hoof(4.8,0,-2.5),hoof(4.8,0,2.5),hoof(-3,0,2.5)],top:[hoof(-2.1,4.6,-2),hoof(3.5,4.3,-2),hoof(3.5,4.3,2),hoof(-2.1,4.6,2)]};
}
export function renderScene(ctx,width,height,t,walking=true){
 const pose=poseAt(t,walking),b=pose.body,s=Math.min(1.08,Math.max(.78,width/620)),cx=width*.49,base=height-27;
 const project=p=>({x:cx+p.x*s,y:base+(.2*p.z-p.y)*s});
 const point=(x,y,z=0)=>local({x:x+(y>104&&x>28?b.reach:0),y,z},b);
 const P=(x,y,z=0)=>project(point(x,y,z));
 ctx.clearRect(0,0,width,height);
 // A quiet, warm stage: the character, rather than scenery, is the focal point.
 const sky=ctx.createLinearGradient(0,0,width,height);sky.addColorStop(0,'#f6f0df');sky.addColorStop(.5,'#f2f1e4');sky.addColorStop(1,'#e9eee0');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
 ctx.save();ctx.globalAlpha=.36;const glow=ctx.createRadialGradient(width*.55,height*.55,3,width*.55,height*.55,width*.6);glow.addColorStop(0,'#fffff9');glow.addColorStop(1,'#fffff900');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);ctx.restore();
 // Ground cues remain fixed in the world. Contact feet do not slide against them.
 for(let i=0;i<24;i++){const gx=((i*73)%380)-190,gz=((i*43)%110)-55,p=project({x:gx,y:0,z:gz});ctx.fillStyle=i%3?'#adb59a20':'#a8b18c35';ctx.beginPath();ctx.ellipse(p.x,p.y,1.4+(i%2),.5,0,0,TAU);ctx.fill();}
 const sh=project({x:b.x-4,y:0,z:b.z});ctx.save();ctx.fillStyle='#63705a0b';ctx.beginPath();ctx.ellipse(sh.x,sh.y,54*s,8*s,0,0,TAU);ctx.fill();ctx.fillStyle='#63705a09';ctx.beginPath();ctx.ellipse(sh.x,sh.y,40*s,5*s,0,0,TAU);ctx.fill();ctx.restore();
 const parts=[];
 const addPart=(depth,draw)=>parts.push({depth,draw});
 const worldPath=(pts,fill,stroke=null,lineWidth=1)=>{ctx.beginPath();pts.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth*s;ctx.lineJoin='round';ctx.stroke();}};
 const curve=(points,stroke,lineWidth)=>{ctx.beginPath();const ps=points.map(project);ctx.moveTo(ps[0].x,ps[0].y);if(ps.length===4)ctx.bezierCurveTo(ps[1].x,ps[1].y,ps[2].x,ps[2].y,ps[3].x,ps[3].y);else ps.slice(1).forEach(q=>ctx.lineTo(q.x,q.y));ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth*s;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();};
 const ellipse=(center,rx,ry,rz,colors,outline=null)=>{
  const c=project(center),u={x:Math.cos(b.yaw)*rx*s,y:.2*-Math.sin(b.yaw)*rx*s},v={x:0,y:-ry*s},w={x:Math.sin(b.yaw)*rz*s,y:.2*Math.cos(b.yaw)*rz*s};
  const aa=u.x*u.x+w.x*w.x,bb=u.x*u.y+w.x*w.y,cc=u.y*u.y+v.y*v.y+w.y*w.y,disc=Math.sqrt((aa-cc)**2+4*bb*bb),r1=Math.sqrt(Math.max(.1,(aa+cc+disc)/2)),r2=Math.sqrt(Math.max(.1,(aa+cc-disc)/2)),angle=.5*Math.atan2(2*bb,aa-cc);
  ctx.beginPath();ctx.ellipse(c.x,c.y,r1,r2,angle,0,TAU);
  if(Array.isArray(colors)){const g=ctx.createLinearGradient(c.x-20*s,c.y-ry*s,c.x+15*s,c.y+ry*s);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);ctx.fillStyle=g;}else ctx.fillStyle=colors;
  ctx.fill();if(outline){ctx.strokeStyle=outline;ctx.lineWidth=.9*s;ctx.stroke();}
 };
 const limb=(a,b,ra,rb,color)=>{const p=project(a),q=project(b),dx=q.x-p.x,dy=q.y-p.y,n=Math.hypot(dx,dy)||1,nx=-dy/n,ny=dx/n;ctx.beginPath();ctx.moveTo(p.x+nx*ra*s,p.y+ny*ra*s);ctx.lineTo(q.x+nx*rb*s,q.y+ny*rb*s);ctx.quadraticCurveTo(q.x+dx/n*rb*s,q.y+dy/n*rb*s,q.x-nx*rb*s,q.y-ny*rb*s);ctx.lineTo(p.x-nx*ra*s,p.y-ny*ra*s);ctx.quadraticCurveTo(p.x-dx/n*ra*s,p.y-dy/n*ra*s,p.x+nx*ra*s,p.y+ny*ra*s);ctx.fillStyle=color;ctx.fill();};
 // Leg segments follow IK joints; far limbs naturally pass behind the barrel.
 for(const leg of pose.legs){
  const near=Math.cos(b.yaw)*leg.z>0,col=near?'#595b59':'#81817b';
  addPart((leg.root.z+leg.foot.z)/2,()=>{
   const upperEnd=add(leg.root,mul(sub(leg.knee,leg.root),.64));
   limb(leg.root,leg.knee,3.6,1.75,col);limb(leg.knee,leg.foot,1.7,1.15,col);
   limb(add(leg.root,{x:0,y:.8,z:.1}),upperEnd,2.7,2.2,near?'#757970':'#93958a');
   const joint=project(leg.knee);ctx.fillStyle=col;ctx.beginPath();ctx.arc(joint.x,joint.y,1.8*s,0,TAU);ctx.fill();
   // Swing hoof folds back, then levels before touchdown; the sole stays on its planted anchor.
   const {bottom,top}=hoofGeometry(leg);
   const hoofFaces=[{pts:top,color:near?'#535b4e':'#72796a'}];
   for(let i=0;i<4;i++)hoofFaces.push({pts:[bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i]],color:i%2?(near?'#30392f':'#50594b'):(near?'#3e473a':'#66705e')});
   hoofFaces.sort((a,b)=>a.pts.reduce((n,p)=>n+p.z,0)-b.pts.reduce((n,p)=>n+p.z,0)).forEach(face=>worldPath(face.pts,face.color));
   if(leg.stance){const p=project(leg.foot);ctx.fillStyle='#53604b16';ctx.beginPath();ctx.ellipse(p.x,p.y+1,4.2*s,1.1*s,0,0,TAU);ctx.fill();}
  });
 }
 const tailWag=Math.sin(TAU*gaitClock(t)-1.25)*1.8+Math.sin(t*1.1)*1.5;
 const tail=[point(-48,84,0),point(-59,80,tailWag*.4),point(-58,57,tailWag),point(-64,52,tailWag)];
 addPart((tail[0].z+tail[3].z)/2,()=>{curve(tail,'#555953',2.8);const tip=tail[3];ellipse(add(tip,{x:-1,y:-1,z:0}),2.2,4.2,2.2,'#373c37');});
 const bodyCenter=point(-7,78,0);
 addPart(bodyCenter.z,()=>{
  ellipse(bodyCenter,46,25,18,['#73756f','#51554f'],'#454b45');
  // Soft belly, small shoulder and rump highlights, no saddle or block joints.
  ellipse(point(-7,64,-.3),30,7.5,15,'#d4cfb74d');
  ellipse(point(-33,78,Math.cos(b.yaw)>0?13:-13),12,17,4,'#454d442a');
  ellipse(point(23,74,Math.cos(b.yaw)>0?13:-13),9,13,4,'#8e947c28');
 });
 const neckCenter=point(31,96,0);
 addPart(neckCenter.z+.05,()=>{
  curve([point(19,75,0),point(26,94,0),point(36,106,0),point(42,113,0)],'#535951',20);
  curve([point(25,83,Math.cos(b.yaw)>0?8:-8),point(31,97,Math.cos(b.yaw)>0?8:-8),point(38,110,Math.cos(b.yaw)>0?7:-7)],'#b0b09a40',2.8);
 });
 // A small, soft mane follows the back of the neck.
 for(let i=0;i<5;i++){const x=25+i*2.4,y=91+i*4.3,p=point(x,y,0);addPart(p.z-.1,()=>ellipse(p,3,3.4,9,'#373e37'));}
 const headNod=b.head;
 const head=point(44,108+headNod,0);
 for(const side of [-1,1]){
  const z=side*7,earX=side===1?45:35,earLag=Math.sin(TAU*gaitClock(t)*2-1.3+side*.5)*1.1,earFlick=Math.max(0,Math.sin(t*.63+side*1.2))**18*3;
  const coords=[[earX-3,121],[earX-5+earLag,139],[earX-4+earLag+earFlick+(side===1?2:-3),155],[earX+1+earLag+earFlick+(side===1?2:-3),157],[earX+4+earLag,147],[earX+3,123]];
  const pts=coords.map(([x,y])=>point(x,y+headNod,z));
  addPart(pts.reduce((a,p)=>a+p.z,0)/pts.length,()=>{
   worldPath(pts,side*Math.cos(b.yaw)>0?'#62675e':'#7e8276','#4c554b',.8);
   curve([point(earX,127+headNod,z+.2),point(earX+earLag,139+headNod,z+.2),point(earX+earLag+earFlick-1,151+headNod,z+.2)],'#baad9c',2.2);
  });
 }
 addPart(head.z+.2,()=>{ellipse(head,12.8,21.5,11.3,['#747b6d','#515a4f'],'#485346');});
 const muzzle=point(56,92+headNod,0);
 addPart(muzzle.z+.3,()=>{ellipse(muzzle,13,8.5,11.7,['#eee7d4','#d3d3bc'],'#7a85713d');});
 for(const side of [-1,1]){
  const eye=point(48,114+headNod,side*10.4);
  if(side*Math.cos(b.yaw)>-.12)addPart(eye.z+.4,()=>{
   const blinkPhase=((t+side*.015)%6.2+6.2)%6.2,blink=blinkPhase>5.85&&blinkPhase<6.0;
   ellipse(eye,2.7,blink?.4:3.1,.7,'#efe9d6');
   if(!blink){ellipse(point(49.2,114+headNod,side*10.9),1.4,2,.4,'#28362a');ellipse(point(49.55,115+headNod,side*11.25),.42,.6,.15,'#fff9e6');}
   curve([point(45.7,118.1+headNod,side*10.8),point(48,119+headNod,side*11),point(50.3,118.3+headNod,side*10.8)],'#424e40',1.15);
  });
  const nostril=point(64,94.5+headNod,side*6.8);
  if(side*Math.cos(b.yaw)>0)addPart(nostril.z+.7,()=>curve([point(59,88.7+headNod,side*10.8),point(63,88.2+headNod,side*9.2),point(66,90+headNod,side*7)],'#81836b',.8));
  if(side*Math.cos(b.yaw)>-.25)addPart(nostril.z+.6,()=>ellipse(nostril,1.2,.9,.8,'#73806d'));
 }
 // Bridle and carrier are one connected object, with a pendulum at the free end.
 const visibleSide=Math.cos(b.yaw)>0?1:-1,strap=[point(39,122+headNod,visibleSide*10),point(47,106+headNod,visibleSide*11.7),point(57,97+headNod,visibleSide*10.9)];
 addPart(strap.reduce((a,p)=>a+p.z,0)/3+.8,()=>curve(strap,'#c6c7ad',1.6));
 const rod=[point(31,111,0),point(40,146+headNod,0),pose.anchor];
 addPart(rod.reduce((a,p)=>a+p.z,0)/3,()=>{curve(rod,'#756c55',2);curve([pose.anchor,pose.carrot],'#8b8065',1.1);});
 addPart(pose.carrot.z,()=>{
  const c=project(pose.carrot),bottom=project(add(pose.carrot,mul(sub(pose.carrot,pose.anchor),.55))),w=4.5*s;
  ctx.beginPath();ctx.moveTo(c.x-w,c.y+2*s);ctx.quadraticCurveTo(c.x-w-1*s,c.y+11*s,bottom.x,bottom.y);ctx.quadraticCurveTo(c.x+w+1*s,c.y+11*s,c.x+w,c.y+2*s);ctx.quadraticCurveTo(c.x,c.y-1*s,c.x-w,c.y+2*s);ctx.fillStyle='#cb8551';ctx.fill();
  ctx.beginPath();ctx.moveTo(c.x-2*s,c.y+4*s);ctx.quadraticCurveTo(c.x-2*s,c.y+9*s,bottom.x,bottom.y-4*s);ctx.strokeStyle='#e1a56a';ctx.lineWidth=1.5*s;ctx.stroke();
  for(const sign of [-1,0,1]){ctx.beginPath();ctx.moveTo(c.x,c.y+2*s);ctx.quadraticCurveTo(c.x+sign*5*s,c.y-4*s,c.x+sign*4*s,c.y-(sign===0?10:6)*s);ctx.strokeStyle=sign===0?'#567b4e':'#78915b';ctx.lineWidth=2.2*s;ctx.lineCap='round';ctx.stroke();}
 });
 parts.sort((a,b)=>a.depth-b.depth).forEach(p=>p.draw());
 return pose;
}
export function mountDonkeyScene(canvas){
 const ctx=canvas.getContext('2d');let width=0,height=0,dpr=1,time=0,last=null,frame=0,previousPlaying=null,previousWorking=null;
 function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);renderScene(ctx,width,height,time,!document.body.classList.contains('resting'));}
 const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
 function tick(now){const playing=!document.body.classList.contains('paused'),working=!document.body.classList.contains('resting');if(last===null)last=now;const dt=Math.min((now-last)/1000,.05);last=now;if(!document.hidden&&playing)time+=dt;
  if(!document.hidden&&(playing||playing!==previousPlaying||working!==previousWorking)){renderScene(ctx,width,height,time,working);canvas.dataset.animationTime=time.toFixed(4);canvas.dataset.animationState=playing?(working?'walking':'idle'):'paused';}
  previousPlaying=playing;previousWorking=working;frame=requestAnimationFrame(tick);
 }
 frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);ro.disconnect();};
}
