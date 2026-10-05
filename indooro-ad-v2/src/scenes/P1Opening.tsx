import React from 'react';
import {AbsoluteFill,staticFile,useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Pass} from '../components/Pass';
import {PrototypeLabel} from '../components/PrototypeLabel';
import proj from '../data/projection-P1.json';
import {C,clamp,smooth} from '../design/system';

export const P1Opening:React.FC<{withAudio?:boolean;withLabel?:boolean}>=({withAudio=true,withLabel=true})=>{
  const f=useCurrentFrame(),active=smooth((f-75)/25),p=proj[Math.min(119,f)].shopper;
  const ripple=f<77?0:smooth((f-77)/15);
  return <AbsoluteFill style={{backgroundColor:C.bg}}>
    <Pass kind="P1" frame={f}/>
    <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 35% 63%,transparent 6%,#01080DE6 94%)',opacity:.25+active*.3}}/>
    <svg style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
      {f<75&&<g opacity={.27*(1-smooth((f-48)/26))}>
        <path d="M 240 690 C 280 550 440 520 470 390" fill="none" stroke={C.amber} strokeWidth="3" strokeLinecap="round"/>
        <path d="M 240 690 C 290 570 650 560 740 350" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round"/>
      </g>}
      {f>=75&&p.visible&&<g opacity={clamp((f-75)/12)}>
        <circle cx={p.x} cy={p.y} r={8+28*ripple} fill="none" stroke={C.mint} strokeWidth="2" opacity={1-ripple}/>
        <circle cx={p.x} cy={p.y} r="5" fill={C.mint}/>
      </g>}
    </svg>
    <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 30% 63%,#63E6B420,transparent 55%)',opacity:active}}/>
    {withAudio&&<Audio src={staticFile('audio/P1-temp.wav')} volume={.55}/>}
    {withLabel&&<PrototypeLabel name="01 CHAOS → RICHTUNG"/>}
  </AbsoluteFill>;
};
