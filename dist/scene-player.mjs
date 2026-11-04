import {poseAt,renderScene} from './donkey-scene.mjs';
import {createChaseController,updateChaseController} from './chase.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function pointerAllowed({finePointer,width,playing,visible,focused,dialogOpen,pointerType='mouse'}){
 return Boolean(finePointer&&width>760&&playing&&visible&&focused&&!dialogOpen&&pointerType==='mouse');
}
export function scenePointer(clientX,clientY,rect){
 return {x:clamp(clientX-rect.left,0,Math.max(0,rect.width)),y:clamp(clientY-rect.top,0,Math.max(0,rect.height))};
}
export function sceneBounds(width){
 const s=Math.min(1.08,Math.max(.78,width/620)),cx=width*.49;
 return {minX:(18-cx)/s+100,maxX:(width-18-cx)/s-100,minZ:-16,maxZ:16};
}

export function needsResizeReframe(pose,width){
 if(!pose?.body)return false;const b=sceneBounds(width),p=pose.body;
 return p.x<b.minX||p.x>b.maxX||p.z<b.minZ||p.z>b.maxZ;
}

export function mountDonkeyScene(canvas){
 const ctx=canvas.getContext('2d'),scene=canvas.parentElement,hint=document.getElementById('interactionHint');
 const fine=matchMedia('(hover: hover) and (pointer: fine)'),dialogs=[...document.querySelectorAll('dialog')];
 let width=0,height=0,time=0,last=null,frame=0,pointer=null,controller=null,lastPose=null,dirty=true,focused=document.hasFocus(),oldWorking=null,oldPlaying=null;
 let ready=false,mode='auto';
 const playing=()=>!document.body.classList.contains('paused');
 const working=()=>!document.body.classList.contains('resting');
 const allowed=(pointerType='mouse')=>pointerAllowed({finePointer:fine.matches,width:innerWidth,playing:playing(),visible:!document.hidden,focused,dialogOpen:dialogs.some(d=>d.open),pointerType});
 function updateHint(){
  const nextReady=allowed(),nextMode=pointer?'pointer':'auto';
  if(nextReady===ready&&nextMode===mode&&!dirty)return;
  ready=nextReady;mode=nextMode;scene.dataset.interaction=mode;canvas.classList.toggle('is-pointer-chasing',Boolean(pointer));
  if(hint)hint.textContent=pointer?'你带路，小驴跟上。':'auto'===mode&&ready?'鼠标移进来，变成萝卜带它走。':'小步向前，也是在靠近。';
 }
 function clearPointer(reason="policy"){if(pointer){canvas.dataset.pointerReset=typeof reason==="string"?reason:reason.type;pointer=null;dirty=true;}canvas.classList.remove('is-pointer-chasing');updateHint();}
 function move(e){
  if(!allowed(e.pointerType)){clearPointer();return;}
  const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  pointer=scenePointer(e.clientX,e.clientY,rect);
  if(!controller)controller=createChaseController(lastPose||poseAt(time,working()));
  dirty=true;updateHint();
 }
 function inside(e){const r=canvas.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;}
 function leave(e){if(!inside(e))clearPointer('pointerleave');}
 function track(e){if(!pointer)return;if(inside(e))move(e);else clearPointer('outside');}
 function paint(){
  const walking=working()||Boolean(pointer);
  const pose=lastPose||poseAt(time,walking);
  renderScene(ctx,width,height,time,walking,{pose,pointer});
  canvas.dataset.animationTime=time.toFixed(4);
  canvas.dataset.animationState=!playing()?'paused':document.hidden||!focused?'inactive':pointer?'chasing':walking?'walking':'idle';
  canvas.dataset.bodyX=pose.body.x.toFixed(3);canvas.dataset.bodyZ=pose.body.z.toFixed(3);canvas.dataset.bodyYaw=pose.body.yaw.toFixed(4);
  canvas.dataset.pointerX=pointer?pointer.x.toFixed(2):'';canvas.dataset.pointerY=pointer?pointer.y.toFixed(2):'';
  dirty=false;
 }
 function resize(){
  clearPointer("resize");const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
  // A layout reflow may strand an idle chaser outside a newly narrow viewport.
  // Rejoin the normal scene only in that case; ordinary pointer exits never reset it.
  if(controller&&needsResizeReframe(lastPose||controller.pose,width)){controller=null;lastPose=poseAt(time,working());}
  const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  dirty=true;updateHint();paint();
 }
 function tick(now){
  frame=requestAnimationFrame(tick);
  const isPlaying=playing(),isWorking=working(),active=isPlaying&&!document.hidden&&focused&&!dialogs.some(d=>d.open);
  if(!allowed())clearPointer("eligibility");
  if(isPlaying!==oldPlaying||isWorking!==oldWorking){dirty=true;oldPlaying=isPlaying;oldWorking=isWorking;updateHint();}
  if(last===null)last=now;
  const elapsed=now-last,interval=innerWidth>760?1000/60:1000/30;
  if(elapsed<interval-.3&&!dirty)return;
  const dt=Math.min(Math.max(elapsed/1000,0),.05);last=now;
  if(active){
   time+=dt;
   if(controller){const s=Math.min(1.08,Math.max(.78,width/620));const target=pointer?{x:(pointer.x-width*.49)/s,z:clamp((pointer.y-height*.6)*.08,-12,12)}:null;
    lastPose=updateChaseController(controller,dt,{target,walking:isWorking||Boolean(pointer),bounds:sceneBounds(width)});
   }else lastPose=poseAt(time,isWorking);
   dirty=true;
  }
  if(dirty&&!document.hidden)paint();
 }
 function visibility(){clearPointer("visibility/focus");last=null;dirty=true;}
 function blur(){focused=false;visibility();}
 function focus(){focused=true;visibility();updateHint();}
 function policyChanged(){clearPointer();dirty=true;updateHint();}
 canvas.addEventListener('pointerenter',move,{passive:true});canvas.addEventListener('pointermove',move,{passive:true});canvas.addEventListener('pointerleave',leave,{passive:true});document.addEventListener('pointermove',track,{passive:true});canvas.addEventListener('pointercancel',clearPointer,{passive:true});
 const bodyObserver=new MutationObserver(policyChanged);bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 const dialogObserver=new MutationObserver(policyChanged);dialogs.forEach(d=>dialogObserver.observe(d,{attributes:true,attributeFilter:['open']}));
 fine.addEventListener?.('change',policyChanged);window.addEventListener('blur',blur);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
 const ro=new ResizeObserver(resize);ro.observe(canvas);resize();frame=requestAnimationFrame(tick);
 return()=>{cancelAnimationFrame(frame);ro.disconnect();bodyObserver.disconnect();dialogObserver.disconnect();fine.removeEventListener?.('change',policyChanged);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointerenter',move);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);document.removeEventListener('pointermove',track);canvas.removeEventListener('pointercancel',clearPointer);};
}
