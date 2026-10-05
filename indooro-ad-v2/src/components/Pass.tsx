import React from 'react';
import {Img,staticFile} from 'remotion';
const counts={P1:120,P3:120,P4:120,P5:75,P6:75,P7:90} as const;
export const Pass:React.FC<{kind:keyof typeof counts;frame:number}>=({kind,frame})=>
  <Img src={staticFile(`3d-passes/${kind}/frame_${String(Math.min(counts[kind],Math.max(1,frame+1))).padStart(4,'0')}.png`)}
    style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>;
