import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMotionChoice,motionState,toggleMotion} from './dist/motion.mjs';
test('system preference is respected until user explicitly chooses',()=>{
 assert.deepEqual(motionState('auto',true),{choice:'auto',playing:false,explicitPlay:false,systemPaused:true});
 assert.equal(motionState('auto',false).playing,true);
 assert.equal(motionState('play',true).playing,true);
 assert.equal(motionState('pause',false).playing,false);
 assert.equal(motionState('pause',true).playing,false);
});
test('toggle is never locked by reduced motion and choice round-trips',()=>{
 for(const reduced of [true,false])for(const choice of ['auto','play','pause']){
  const before=motionState(choice,reduced).playing;
  const next=toggleMotion(choice,reduced);
  assert.equal(motionState(next,reduced).playing,!before);
  assert.equal(normalizeMotionChoice(JSON.parse(JSON.stringify(next))),next);
 }
});
test('legacy saved preferences migrate and unknown values return to auto',()=>{
 assert.equal(normalizeMotionChoice('playing'),'play');
 assert.equal(normalizeMotionChoice('paused'),'pause');
 for(const value of [null,undefined,'bad',{},0])assert.equal(normalizeMotionChoice(value),'auto');
});
