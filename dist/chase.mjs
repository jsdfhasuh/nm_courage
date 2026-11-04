// Numeric, DOM-free steering and planted-foot locomotion for the 2.5D donkey.
// Positions are world units, time is seconds, and yaw is an unwrapped angle.
const TAU = Math.PI * 2;
const STANCE = .68;
const UPPER = 20, LOWER = 33, REACH = UPPER + LOWER - .015;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));
const fraction = n => n - Math.floor(n);
const ease = n => n ** 3 * (10 + n * (-15 + 6 * n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const copyPoint = p => ({x:p.x, y:p.y, z:p.z});
const mix = (a,b,u) => a + (b-a)*u;
const clone = obj => JSON.parse(JSON.stringify(obj));

export const DEFAULT_CHASE_LIMITS = Object.freeze({
  maxSpeed:36, maxAcceleration:75, maxTurnRate:1.25,
  maxTurnAcceleration:3.6, maxDt:.05, substep:1/240,
  stopDistance:50, minCadence:1.15, maxCadence:3.5, strideDistance:24,
  minX:-120, maxX:120, minZ:-45, maxZ:45,
});

function local(p,b) {
  const c=Math.cos(b.yaw),s=Math.sin(b.yaw);
  return {x:b.x+p.x*c+p.z*s,y:p.y-15+b.bob,
    z:b.z-p.x*s+p.z*c+(p.y>50?b.roll:0)};
}
function rootAt(leg,b) { return local({x:leg.x,y:63,z:leg.z},b); }
function floorAt(leg,b) { const p=local({x:leg.x,y:0,z:leg.z},b);p.y=0;return p; }
function normalizedBounds(input, fallback=DEFAULT_CHASE_LIMITS) {
  const b={};
  for(const key of ['minX','maxX','minZ','maxZ'])b[key]=Number.isFinite(input?.[key])?input[key]:fallback[key];
  if(b.minX>b.maxX)[b.minX,b.maxX]=[b.maxX,b.minX];
  if(b.minZ>b.maxZ)[b.minZ,b.maxZ]=[b.maxZ,b.minZ];
  return b;
}
function validTarget(p) { return p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:p.x,z:p.z}:null; }
function patrolTarget(t,bounds) {
  // Same quiet ten-second capsule as the original patrol, used as a goal only.
  const r=fraction(t/10)*10,R=12,side=u=>u-.66*Math.sin(TAU*u)/TAU;
  let x,z;
  if(r<3){x=-50+100*side(r/3);z=-R;}
  else if(r<5){const u=(r-3)/2;x=50+(100/3*(1-.66))*2*(u-2*u**3+u**4);z=-R+2*R*u**4*(35+u*(-84+u*(70-20*u)));}
  else if(r<8){x=50-100*side((r-5)/3);z=R;}
  else{const u=(r-8)/2;x=-50-(100/3*(1-.66))*2*(u-2*u**3+u**4);z=R-2*R*u**4*(35+u*(-84+u*(70-20*u)));}
  return {x:clamp(x,bounds.minX,bounds.maxX),z:clamp(z,bounds.minZ,bounds.maxZ)};
}

/** Start from the exact currently displayed pose, including in-flight feet. */
export function createChaseController(initialPose, options={}) {
  if(!initialPose?.body||initialPose.legs?.length!==4)throw new TypeError('A complete four-legged initial pose is required');
  const pose=clone(initialPose), limits={...DEFAULT_CHASE_LIMITS,...options};
  for(const key of ['maxSpeed','maxAcceleration','maxTurnRate','maxTurnAcceleration','maxDt','substep','minCadence','maxCadence','strideDistance']){
    if(!Number.isFinite(limits[key])||limits[key]<=0)limits[key]=DEFAULT_CHASE_LIMITS[key];
  }
  limits.maxDt=Math.min(limits.maxDt,.05);limits.substep=Math.min(limits.substep,1/120);
  limits.stopDistance=Math.max(0,Number.isFinite(limits.stopDistance)?limits.stopDistance:50);
  const state={pose,limits,bounds:normalizedBounds(options.bounds||options),
    target:validTarget(options.target),walking:pose.walking!==false,
    time:Number.isFinite(pose.t)?pose.t:0,patrolTime:Number.isFinite(pose.t)?pose.t:0,
    clock:pose.legs[0].phase||0,cadence:limits.minCadence,
    vx:0,vz:0,omega:0,desiredVx:0,desiredVz:0,desiredOmega:0,
    pendulum:{x:pose.carrot.x-pose.anchor.x,z:pose.carrot.z-pose.anchor.z},
    contactLimited:false,
    legs:pose.legs.map(leg=>({...leg,foot:copyPoint(leg.foot),hoofYaw:leg.hoofYaw,
      mode:leg.stance?'stance':'swing',swing:null})),
  };
  for(const leg of state.legs)if(leg.mode==='swing'){
    const q=clamp((leg.phase-STANCE)/(1-STANCE),0,1);
    leg.swing={from:copyPoint(leg.foot),to:floorAt(leg,pose.body),fromYaw:leg.hoofYaw,toYaw:leg.hoofYaw,q:0,qStart:q,duration:Math.max(.03,(1-q)*(1-STANCE)/state.cadence)};
  }
  return state;
}

function constrainVelocityToBounds(s,vx,vz) {
  const b=s.pose.body,B=s.bounds,a=s.limits.maxAcceleration*.65;
  // Brake before reaching the stage edge; never clamp/teleport the body itself.
  if(vx>0)vx=Math.min(vx,Math.sqrt(2*a*Math.max(0,B.maxX-b.x-.04)));
  else vx=Math.max(vx,-Math.sqrt(2*a*Math.max(0,b.x-B.minX-.04)));
  if(vz>0)vz=Math.min(vz,Math.sqrt(2*a*Math.max(0,B.maxZ-b.z-.04)));
  else vz=Math.max(vz,-Math.sqrt(2*a*Math.max(0,b.z-B.minZ-.04)));
  return {x:vx,z:vz};
}
function predictBody(s,seconds) {
  const b=s.pose.body;
  // Desired steering keeps swing placement useful even while planted feet brake.
  const vx=mix(s.vx,s.desiredVx,.35),vz=mix(s.vz,s.desiredVz,.35),w=mix(s.omega,s.desiredOmega,.25);
  return {...b,x:clamp(b.x+vx*seconds,Math.min(b.x,s.bounds.minX),Math.max(b.x,s.bounds.maxX)),
    z:clamp(b.z+vz*seconds,Math.min(b.z,s.bounds.minZ),Math.max(b.z,s.bounds.maxZ)),yaw:b.yaw+w*seconds};
}
function startSwing(s,leg,duration) {
  const future=predictBody(s,duration+STANCE/(2*s.cadence));
  leg.mode='swing';leg.swing={from:copyPoint(leg.foot),to:floorAt(leg,future),
    fromYaw:leg.hoofYaw,toYaw:future.yaw,q:0,qStart:0,duration};
}
function advanceFeet(s,h,allowSteps) {
  let grounded=s.legs.filter(leg=>leg.mode==='stance').length;
  for(const leg of s.legs){
    const previous=leg.phase;leg.phase=fraction(s.clock-(leg.offset||0));
    if(leg.mode==='stance'&&allowSteps){
      if(previous<STANCE&&leg.phase>=STANCE)leg.pendingStep=true;
      // A sharp reversal can exhaust an old contact before its regular beat.
      // Lift that foot early instead of letting the hip stretch or snap to a stop.
      const needsRecovery=distance(rootAt(leg,predictBody(s,.06)),leg.foot)>51.5;
      if(grounded>2&&(leg.pendingStep||needsRecovery)){
        startSwing(s,leg,(1-STANCE)/s.cadence);leg.pendingStep=false;grounded--;
      }
    }
    if(leg.mode==='swing'){
      const swing=leg.swing;
      swing.q=Math.min(1,swing.q+h/swing.duration);
      const u=ease(swing.q);
      leg.foot={x:mix(swing.from.x,swing.to.x,u),z:mix(swing.from.z,swing.to.z,u),
        y:swing.from.y*(1-u)+8*64*swing.q**3*(1-swing.q)**3};
      leg.hoofYaw=swing.fromYaw+wrap(swing.toYaw-swing.fromYaw)*u;
      // Renderer uses phase for the sole's swing roll. Match actual flight progress.
      if(swing.q>=1){leg.foot.y=0;leg.mode='stance';leg.swing=null;grounded++;}
    }
  }
}
function reachable(s,b,margin=0) {
  for(const leg of s.legs){const d=distance(rootAt(leg,b),leg.foot);if(d>REACH-margin||d<LOWER-UPPER+.01)return false;}
  return true;
}
function solveLeg(leg,body) {
  const root=rootAt(leg,body),foot=copyPoint(leg.foot),dx=foot.x-root.x,dy=foot.y-root.y,dz=foot.z-root.z,
    d=Math.hypot(dx,dy,dz),ux=dx/d,uy=dy/d,uz=dz/d,
    fx=Math.cos(body.yaw)*leg.bend,fz=-Math.sin(body.yaw)*leg.bend,dot=fx*ux+fz*uz;
  let vx=fx-dot*ux,vy=-dot*uy,vz=fz-dot*uz;
  const n=Math.hypot(vx,vy,vz)||1;vx/=n;vy/=n;vz/=n;
  const along=(UPPER*UPPER-LOWER*LOWER+d*d)/(2*d),heightSquared=UPPER*UPPER-along*along;
  // This is not a stretched-limb fallback. The controller must keep targets reachable.
  if(heightSquared< -1e-8)throw new RangeError(`Unreachable ${leg.name} foot (${d.toFixed(6)})`);
  const height=Math.sqrt(Math.max(0,heightSquared));
  return {name:leg.name,x:leg.x,z:leg.z,offset:leg.offset,bend:leg.bend,root,
    knee:{x:root.x+ux*along+vx*height,y:root.y+uy*along+vy*height,z:root.z+uz*along+vz*height},
    foot,hoofYaw:leg.hoofYaw,stance:leg.mode==='stance',
    phase:leg.mode==='swing'?STANCE+(1-STANCE)*(leg.swing.qStart+(1-leg.swing.qStart)*leg.swing.q):Math.min(leg.phase,STANCE-1e-8)};
}
function frame(s,h) {
  const L=s.limits,old=s.pose.body;
  s.time+=h;s.patrolTime+=h;
  const outside=old.x<s.bounds.minX||old.x>s.bounds.maxX||old.z<s.bounds.minZ||old.z>s.bounds.maxZ,
    goal=outside?{x:clamp(old.x,s.bounds.minX+.1,s.bounds.maxX-.1),z:clamp(old.z,s.bounds.minZ+.1,s.bounds.maxZ-.1)}:s.target||patrolTarget(s.patrolTime+.65,s.bounds),
    dx=goal.x-old.x,dz=goal.z-old.z,d=Math.hypot(dx,dz),
    stop=outside?0:s.target?L.stopDistance:2,
    error=d>.5?wrap(Math.atan2(-dz,dx)-old.yaw):0,
    remaining=Math.max(0,d-stop),facing=Math.max(0,Math.cos(error));
  let desiredSpeed=s.walking?Math.min(L.maxSpeed,Math.sqrt(2*L.maxAcceleration*.65*remaining))*facing*facing:0;
  if(remaining<.3)desiredSpeed=0;
  const desiredOmega=s.walking&&d>(outside?.01:8)?Math.sign(error)*Math.min(L.maxTurnRate,Math.sqrt(2*L.maxTurnAcceleration*.7*Math.abs(error)),Math.abs(error)*3):0;
  let desired=constrainVelocityToBounds(s,Math.cos(old.yaw)*desiredSpeed,-Math.sin(old.yaw)*desiredSpeed);
  s.desiredVx=desired.x;s.desiredVz=desired.z;s.desiredOmega=desiredOmega;
  const maxChange=L.maxAcceleration*h/Math.SQRT2,
    v={x:s.vx+clamp(desired.x-s.vx,-maxChange,maxChange),z:s.vz+clamp(desired.z-s.vz,-maxChange,maxChange)},
    omega=s.omega+clamp(desiredOmega-s.omega,-L.maxTurnAcceleration*h,L.maxTurnAcceleration*h);
  let vx=v.x,vz=v.z;
  const effort=Math.max(Math.hypot(vx,vz)+38*Math.abs(omega),Math.hypot(desired.x,desired.z)+30*Math.abs(desiredOmega));
  const allowSteps=Math.hypot(vx,vz)+38*Math.abs(omega)>.4||s.walking&&(effort>.4||remaining>1&&Math.abs(error)>.02),
    settling=s.legs.some(l=>l.mode==='swing'),
    targetCadence=clamp(effort/L.strideDistance,L.minCadence,L.maxCadence);
  s.cadence+=clamp(targetCadence-s.cadence,-5*h,5*h);
  const clockDelta=allowSteps||settling?s.cadence*h:0;
  s.clock+=clockDelta;
  // Preserve the old contacts before moving the root. Flight follows independent arcs.
  advanceFeet(s,h,allowSteps);
  const activity=clamp(effort/18,0,1),phase=TAU*s.clock,
    desiredBob=activity*(.65*Math.cos(phase*2)-.2*Math.cos(phase*4))+(1-activity)*.45*Math.sin(s.time*1.8),
    blend=1-Math.exp(-10*h);
  let next={...old,
    x:clamp(old.x+vx*h,Math.min(old.x,s.bounds.minX),Math.max(old.x,s.bounds.maxX)),
    z:clamp(old.z+vz*h,Math.min(old.z,s.bounds.minZ),Math.max(old.z,s.bounds.maxZ)),yaw:old.yaw+omega*h,
    bob:mix(old.bob,desiredBob,blend),
    head:mix(old.head,activity*.9*Math.sin(phase*2-.7)+(1-activity)*.4*Math.sin(s.time*1.8-.3),blend),
    reach:mix(old.reach,activity*.75*Math.sin(phase*2-1.1)+(1-activity)*.3*Math.sin(s.time*1.8),blend),
    roll:mix(old.roll||0,activity*.55*Math.sin(phase-.4),blend)};
  const acceptable=b=>reachable(s,b);
  const contactLimited=!acceptable(next);s.contactLimited ||= contactLimited;
  if(contactLimited){
    // Shorten the root's movement, never the leg. Whole contact soles remain fixed.
    let lo=0,hi=1;
    for(let i=0;i<18;i++){
      const u=(lo+hi)/2,b={...next,x:mix(old.x,next.x,u),z:mix(old.z,next.z,u),yaw:mix(old.yaw,next.yaw,u),bob:mix(old.bob,next.bob,u),roll:mix(old.roll||0,next.roll,u)};
      if(acceptable(b))lo=u;else hi=u;
    }
    next={...next,x:mix(old.x,next.x,lo),z:mix(old.z,next.z,lo),yaw:mix(old.yaw,next.yaw,lo),bob:mix(old.bob,next.bob,lo),roll:mix(old.roll||0,next.roll,lo)};
    // A swing target planned before a sharp reversal may need to be brought toward
    // its current hip. Correct only airborne feet, never a grounded contact.
    for(const leg of s.legs)if(leg.mode==='swing'&&distance(rootAt(leg,next),leg.foot)>REACH){
      const root=rootAt(leg,next),horizontal=Math.sqrt(Math.max(0,REACH*REACH-(root.y-leg.foot.y)**2)),
        dx=leg.foot.x-root.x,dz=leg.foot.z-root.z,n=Math.hypot(dx,dz),u=Math.min(1,horizontal/n);
      leg.foot.x=root.x+dx*u;leg.foot.z=root.z+dz*u;
    }
  }
  s.vx=(next.x-old.x)/h;s.vz=(next.z-old.z)/h;s.omega=(next.yaw-old.yaw)/h;
  const anchor=local({x:90,y:160+next.head,z:0},next),
    pendulumBlend=1-Math.exp(-5*h),ax=(s.vx-vx)/Math.max(h,.02),az=(s.vz-vz)/Math.max(h,.02);
  s.pendulum.x=mix(s.pendulum.x,clamp(-ax/9,-5,5),pendulumBlend);
  s.pendulum.z=mix(s.pendulum.z,clamp(-az/9,-5,5),pendulumBlend);
  const carrot={x:anchor.x+s.pendulum.x,z:anchor.z+s.pendulum.z,
    y:anchor.y-Math.sqrt(1600-s.pendulum.x**2-s.pendulum.z**2)};
  s.pose={t:s.time,body:next,legs:s.legs.map(leg=>solveLeg(leg,next)),anchor,carrot,walking:s.walking};
}

/**
 * Advance by capped seconds. Omitted input fields retain their previous value;
 * target:null smoothly returns to patrol. dt<=0 returns the same pose untouched,
 * so paused/resized renders cannot move feet or chase a newly moved cursor.
 */
export function updateChaseController(state,dt,input={}) {
  if(Object.hasOwn(input,'target'))state.target=validTarget(input.target);
  if(Object.hasOwn(input,'walking'))state.walking=!!input.walking;
  if(input.bounds)state.bounds=normalizedBounds(input.bounds,state.bounds);
  if(!Number.isFinite(dt)||dt<=0)return state.pose;
  const duration=Math.min(dt,state.limits.maxDt),steps=Math.max(1,Math.ceil(duration/state.limits.substep)),h=duration/steps;
  state.contactLimited=false;
  for(let i=0;i<steps;i++)frame(state,h);
  return state.pose;
}
