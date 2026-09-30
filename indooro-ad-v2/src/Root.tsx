import React from 'react';
import {Composition,Folder} from 'remotion';
import {P1Opening} from './scenes/P1Opening';
import {P2PhoneSearch} from './scenes/P2PhoneSearch';
import {P3EnterMap} from './scenes/P3EnterMap';
import {P4DestinationBrand} from './scenes/P4DestinationBrand';
import './index.css';

export const RemotionRoot:React.FC=()=> <Folder name="SignaturePrototypes">
  <Composition id="P1Opening" component={P1Opening} durationInFrames={120} fps={30} width={1280} height={720}/>
  <Composition id="P2PhoneSearch" component={P2PhoneSearch} durationInFrames={60} fps={30} width={1280} height={720}/>
  <Composition id="P3EnterMap" component={P3EnterMap} durationInFrames={120} fps={30} width={1280} height={720}/>
  <Composition id="P4DestinationBrand" component={P4DestinationBrand} durationInFrames={240} fps={30} width={1280} height={720}/>
</Folder>;
