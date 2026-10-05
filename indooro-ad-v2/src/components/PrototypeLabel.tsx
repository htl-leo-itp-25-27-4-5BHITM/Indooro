import React from 'react';
import {C} from '../design/system';
export const PrototypeLabel:React.FC<{name:string}>=({name})=><div style={{
  position:'absolute',bottom:21,right:27,color:C.muted,opacity:.7,fontSize:13,letterSpacing:1.4,fontWeight:700
}}>V2 PROTOTYP · {name} · KONZEPTDARSTELLUNG</div>;
