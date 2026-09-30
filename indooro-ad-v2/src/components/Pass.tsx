import React from 'react';
import {Img,staticFile} from 'remotion';
export const Pass:React.FC<{kind:'P1'|'P3'|'P4';frame:number}>=({kind,frame})=>
  <Img src={staticFile(`3d-passes/${kind}/frame_${String(Math.min(120,Math.max(1,frame+1))).padStart(4,'0')}.png`)}
    style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>;
