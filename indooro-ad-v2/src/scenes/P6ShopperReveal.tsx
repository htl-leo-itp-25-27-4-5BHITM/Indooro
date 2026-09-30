import React from 'react';
import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Pass} from '../components/Pass';
import {PrototypeLabel} from '../components/PrototypeLabel';
import {C} from '../design/system';

export const P6ShopperReveal:React.FC<{withLabel?:boolean}>=({withLabel=true})=>{
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{backgroundColor:C.bg,overflow:'hidden'}}>
    <Pass kind="P6" frame={frame}/>
    {withLabel&&<PrototypeLabel name="06 SHOPPER IM WEG"/>}
  </AbsoluteFill>;
};
