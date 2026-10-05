import React from 'react';
import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Pass} from '../components/Pass';
import {PrototypeLabel} from '../components/PrototypeLabel';
import {C} from '../design/system';

export const P7OverheadTurn:React.FC<{withLabel?:boolean}>=({withLabel=true})=>{
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{backgroundColor:C.bg,overflow:'hidden'}}>
    <Pass kind="P7" frame={frame}/>
    {withLabel&&<PrototypeLabel name="07 LETZTE ABBIEGUNG"/>}
  </AbsoluteFill>;
};
