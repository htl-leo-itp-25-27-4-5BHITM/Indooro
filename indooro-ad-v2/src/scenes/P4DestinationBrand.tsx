import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Pass} from '../components/Pass';
import {PrototypeLabel} from '../components/PrototypeLabel';
import proj from '../data/projection-P4.json';
import {C,smooth} from '../design/system';

export const P4DestinationBrand:React.FC=()=>{
  const f=useCurrentFrame(),idx=Math.min(119,f),p=proj[idx],dest=p.destination,milk=p.milk;
  const mark=smooth((f-63)/23),fade=smooth((f-120)/45),brand=smooth((f-140)/25);
  const last=proj[119].destination;
  const path=`M ${last.x} ${last.y} C 560 500, 370 490, 355 380 C 345 320, 420 285, 495 300`;
  return <AbsoluteFill style={{backgroundColor:C.bg,overflow:'hidden'}}>
    {f<120?<Pass kind="P4" frame={f}/>:<Img src={staticFile('3d-passes/P4/frame_0120.png')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>}
    <div style={{position:'absolute',inset:0,background:C.bg,opacity:fade}}/>
    <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible'}}>
      {f<120&&mark>0&&dest.visible&&milk.visible&&<g opacity={mark*(1-smooth((f-108)/12))}>
        <path d={`M ${dest.x} ${dest.y} L ${milk.x} ${milk.y}`} stroke={C.mint} strokeWidth="2" opacity=".48"/>
        <circle cx={dest.x} cy={dest.y} r={19+5*Math.sin(Math.min(1,(f-66)/20)*Math.PI)} fill="none" stroke={C.mint} strokeWidth="3"/>
        <circle cx={dest.x} cy={dest.y} r="5" fill={C.mint}/>
      </g>}
      {f>=120&&<g opacity={fade}>
        <path d={path} fill="none" stroke={C.mint} strokeWidth="10" opacity=".18" filter="blur(10px)"/>
        <path d={path} fill="none" stroke={C.mint} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1-smooth((f-120)/45)}/>
        <circle cx="495" cy="300" r="7" fill={C.mint} opacity={brand}/>
      </g>}
    </svg>
    <div style={{position:'absolute',top:265,left:540,opacity:brand,translate:`0px ${(1-brand)*15}px`}}>
      <div style={{fontSize:77,fontWeight:800,letterSpacing:-5,lineHeight:1}}>INDOORO</div>
      <div style={{fontSize:29,color:C.white,marginTop:19,letterSpacing:-.5}}>Finde deinen Weg.</div>
      <div style={{fontSize:14,color:C.muted,marginTop:22,letterSpacing:2}}>PROTOTYPISCHE MARKENBEHANDLUNG</div>
    </div>
    <Audio src={staticFile('audio/P4-temp.wav')} volume={.55}/>
    <PrototypeLabel name="04 ZIEL → MARKE"/>
  </AbsoluteFill>;
};
