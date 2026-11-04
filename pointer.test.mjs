import test from 'node:test';
import assert from 'node:assert/strict';
import {pointerAllowed,scenePointer,sceneBounds,needsResizeReframe} from './dist/scene-player.mjs';
const allowed={finePointer:true,width:1200,playing:true,visible:true,focused:true,dialogOpen:false,pointerType:'mouse'};
test('pointer carrot is optional, scene-only and cannot override paused or inaccessible states',()=>{
 assert.equal(pointerAllowed(allowed),true);
 for(const change of [{finePointer:false},{width:760},{playing:false},{visible:false},{focused:false},{dialogOpen:true},{pointerType:'touch'},{pointerType:'pen'}])assert.equal(pointerAllowed({...allowed,...change}),false);
});
test('carrot tip matches the real pointer even on scene edges',()=>{
 const rect={left:25,top:100,width:630,height:278};
 assert.deepEqual(scenePointer(325,250,rect),{x:300,y:150});
 assert.deepEqual(scenePointer(-100,-100,rect),{x:0,y:0});
 assert.deepEqual(scenePointer(5000,5000,rect),{x:630,y:278});
});
test('scene safety bounds retain room for donkey, ears and carrier at narrow widths',()=>{
 for(const w of [247,262,295,310,639,1000]){const b=sceneBounds(w);assert.ok(Number.isFinite(b.minX+b.maxX));assert.ok(b.minX<b.maxX);assert.equal(b.minZ,-16);assert.equal(b.maxZ,16);const scale=Math.min(1.08,Math.max(.78,w/620)),cx=w*.49;assert.ok(cx+(b.minX-100)*scale>=17.99);assert.ok(cx+(b.maxX+100)*scale<=w-17.99);}
});

test('only an out-of-frame pose is reframed after layout shrink, including resting chasers',()=>{
 const farRight={body:{x:180,z:0}},center={body:{x:0,z:0}};
 assert.equal(needsResizeReframe(farRight,639),false);
 assert.equal(needsResizeReframe(farRight,247),true);
 assert.equal(needsResizeReframe(center,247),false);
 assert.equal(needsResizeReframe(null,247),false);
});
