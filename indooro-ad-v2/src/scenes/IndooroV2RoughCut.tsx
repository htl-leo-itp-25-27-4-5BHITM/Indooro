import React from 'react';
import {AbsoluteFill,Series,staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {P1Opening} from './P1Opening';
import {P2PhoneSearch} from './P2PhoneSearch';
import {P3EnterMap} from './P3EnterMap';
import {P5RouteChase} from './P5RouteChase';
import {P6ShopperReveal} from './P6ShopperReveal';
import {P7OverheadTurn} from './P7OverheadTurn';
import {P4DestinationBrand} from './P4DestinationBrand';
import {C} from '../design/system';

export const IndooroV2RoughCut:React.FC=()=> <AbsoluteFill style={{backgroundColor:C.bg}}>
  <Series>
    <Series.Sequence durationInFrames={120}><P1Opening withAudio={false} withLabel={false}/></Series.Sequence>
    <Series.Sequence durationInFrames={60}><P2PhoneSearch withAudio={false} withLabel={false}/></Series.Sequence>
    <Series.Sequence durationInFrames={120}><P3EnterMap withAudio={false} withLabel={false}/></Series.Sequence>
    <Series.Sequence durationInFrames={75}><P5RouteChase withLabel={false}/></Series.Sequence>
    <Series.Sequence durationInFrames={75}><P6ShopperReveal withLabel={false}/></Series.Sequence>
    <Series.Sequence durationInFrames={90}><P7OverheadTurn withLabel={false}/></Series.Sequence>
    <Series.Sequence durationInFrames={240}><P4DestinationBrand withAudio={false} withLabel={false}/></Series.Sequence>
  </Series>
  <Audio src={staticFile('audio/roughcut-temp.wav')} volume={.85}/>
  <div style={{position:'absolute',right:24,bottom:17,color:C.muted,opacity:.48,fontSize:12,letterSpacing:1.8,fontWeight:700}}>
    INDOORO V2 · KONZEPTDARSTELLUNG
  </div>
</AbsoluteFill>;
