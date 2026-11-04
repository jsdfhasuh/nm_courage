/** Explicit site preference always wins over the OS default; default remains accessible. */
export function normalizeMotionChoice(value) {
 if(value==='play'||value==='playing')return 'play';
 if(value==='pause'||value==='paused')return 'pause';
 return 'auto';
}
export function motionState(choice,systemReduced) {
 choice=normalizeMotionChoice(choice);
 const playing=choice==='play'||(choice==='auto'&&!systemReduced);
 return {choice,playing,explicitPlay:choice==='play',systemPaused:choice==='auto'&&systemReduced};
}
export function toggleMotion(choice,systemReduced) {return motionState(choice,systemReduced).playing?'pause':'play';}
