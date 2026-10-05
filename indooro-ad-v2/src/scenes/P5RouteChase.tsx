import React from 'react';
import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Pass} from '../components/Pass';
import {PrototypeLabel} from '../components/PrototypeLabel';
import {C} from '../design/system';

export const P5RouteChase:React.FC<{withLabel?:boolean}>=({withLabel=true})=>{
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{backgroundColor:C.bg,overflow:'hidden'}}>
    <Pass kind="P5" frame={frame}/>
    <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 53% 55%,transparent 48%,#03101677 100%)',pointerEvents:'none'}}/>
    {withLabel&&<PrototypeLabel name="05 ROUTE FOLGEN"/>}
  </AbsoluteFill>;
};
