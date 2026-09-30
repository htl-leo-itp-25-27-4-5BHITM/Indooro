import React from 'react';
import {Composition,Folder} from 'remotion';
import {P1Opening} from './scenes/P1Opening';
import {P2PhoneSearch} from './scenes/P2PhoneSearch';
import {P3EnterMap} from './scenes/P3EnterMap';
import {P4DestinationBrand} from './scenes/P4DestinationBrand';
import {P5RouteChase} from './scenes/P5RouteChase';
import {P6ShopperReveal} from './scenes/P6ShopperReveal';
import {P7OverheadTurn} from './scenes/P7OverheadTurn';
import {IndooroV2RoughCut} from './scenes/IndooroV2RoughCut';
import './index.css';

export const RemotionRoot:React.FC=()=> <>
  <Composition id="IndooroV2RoughCut" component={IndooroV2RoughCut} durationInFrames={780} fps={30} width={1280} height={720}/>
  <Folder name="Scenes">
    <Composition id="P1Opening" component={P1Opening} durationInFrames={120} fps={30} width={1280} height={720}/>
    <Composition id="P2PhoneSearch" component={P2PhoneSearch} durationInFrames={60} fps={30} width={1280} height={720}/>
    <Composition id="P3EnterMap" component={P3EnterMap} durationInFrames={120} fps={30} width={1280} height={720}/>
    <Composition id="P5RouteChase" component={P5RouteChase} durationInFrames={75} fps={30} width={1280} height={720}/>
    <Composition id="P6ShopperReveal" component={P6ShopperReveal} durationInFrames={75} fps={30} width={1280} height={720}/>
    <Composition id="P7OverheadTurn" component={P7OverheadTurn} durationInFrames={90} fps={30} width={1280} height={720}/>
    <Composition id="P4DestinationBrand" component={P4DestinationBrand} durationInFrames={240} fps={30} width={1280} height={720}/>
  </Folder>
</>;
