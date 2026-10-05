import React from 'react';
import {AbsoluteFill,staticFile,useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Pass} from '../components/Pass';
import {Phone} from '../components/Phone';
import {PrototypeLabel} from '../components/PrototypeLabel';
import {C,clamp,smooth} from '../design/system';

export const P3EnterMap:React.FC<{withAudio?:boolean;withLabel?:boolean}>=({withAudio=true,withLabel=true})=>{
  const f=useCurrentFrame();
  const zoom=smooth(f/56),fade=1-smooth((f-53)/25);
  const scale=1+zoom*2.75;
  return <AbsoluteFill style={{backgroundColor:C.bg,overflow:'hidden'}}>
    <Pass kind="P3" frame={f}/>
    <div style={{position:'absolute',inset:0,background:'#061014',opacity:.35*fade}}/>
    <div style={{position:'absolute',left:449,top:22,transformOrigin:'191px 330px',scale,opacity:fade,
      translate:`${-0.0*zoom}px ${-13*zoom}px`}}>
      <Phone frame={60} mode="map" mapProgress={clamp((f-3)/36)}/>
    </div>
    <div style={{position:'absolute',inset:0,pointerEvents:'none',
      background:'radial-gradient(ellipse at 52% 68%,transparent 36%,#02090D99 100%)',
      opacity:clamp((f-57)/34)}}/>
    {withLabel&&<div style={{position:'absolute',left:55,top:35,letterSpacing:3,fontSize:15,fontWeight:700,color:C.mint,
      opacity:1-smooth((f-48)/15)}}>DEIN WEG WIRD SICHTBAR</div>
    }
    {withAudio&&<Audio src={staticFile('audio/P3-temp.wav')} volume={.55}/>}
    {withLabel&&<PrototypeLabel name="03 IN DIE KARTE"/>}
  </AbsoluteFill>;
};
