import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Phone} from '../components/Phone';
import {PrototypeLabel} from '../components/PrototypeLabel';
import {C,smooth} from '../design/system';

export const P2PhoneSearch:React.FC<{withAudio?:boolean;withLabel?:boolean}>=({withAudio=true,withLabel=true})=>{
  const f=useCurrentFrame();
  return <AbsoluteFill style={{backgroundColor:C.bg,overflow:'hidden'}}>
    <Img src={staticFile('3d-passes/P1/frame_0120.png')} style={{position:'absolute',inset:-20,width:1320,height:760,objectFit:'cover',filter:'blur(3px) brightness(.64)',scale:1+f/1800}}/>
    <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,#07111735 0%,#07111799 54%,#07111777 100%)'}}/>
    <div style={{position:'absolute',left:730,top:28,scale:1+smooth(f/60)*.06,translate:`${-25*smooth(f/60)}px 0px`}}>
      <Phone frame={f} mode="search"/>
    </div>
    {withAudio&&<Audio src={staticFile('audio/P2-temp.wav')} volume={.5}/>}
    {withLabel&&<PrototypeLabel name="02 MILCH SUCHEN"/>}
  </AbsoluteFill>;
};
