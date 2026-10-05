import React from 'react';
import {C,clamp} from '../design/system';
import {layout,mapX,mapY,routeD} from '../data/layout';

export const MapView:React.FC<{width:number;height:number;progress:number;expanded?:boolean}>=
({width,height,progress,expanded=false})=>{
  const d=routeD(width,height);
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display:'block',overflow:'hidden'}}>
    <defs>
      <linearGradient id={expanded?'floorBig':'floorSmall'} x2="1" y2="1"><stop stopColor="#10242C"/><stop offset="1" stopColor="#071419"/></linearGradient>
      <filter id={expanded?'glowBig':'glowSmall'} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={expanded?6:3}/></filter>
    </defs>
    <rect width={width} height={height} rx={expanded?0:18} fill={`url(#${expanded?'floorBig':'floorSmall'})`}/>
    {[0.25,0.5,0.75].map(v=><React.Fragment key={v}>
      <path d={`M${v*width},0V${height}`} stroke="#29434A" strokeOpacity=".4"/>
      <path d={`M0,${v*height}H${width}`} stroke="#29434A" strokeOpacity=".4"/>
    </React.Fragment>)}
    {layout.shelves.map(s=>{
      const x=mapX(s.x-s.width/2)*width,y=mapY(s.y-s.length/2)*height;
      const w=s.width/(layout.bounds.xMax-layout.bounds.xMin)*width;
      const h=s.length/(layout.bounds.yMax-layout.bounds.yMin)*height;
      return <g key={s.id}><rect x={x} y={y} width={w} height={h} rx={expanded?5:3} fill="#29454D" stroke="#5A777A" strokeWidth={expanded?2:1}/>
      <path d={`M${x+4} ${y+10}H${x+w-4}`} stroke="#779497" opacity=".4"/></g>;
    })}
    <path d={d} fill="none" stroke={C.mint} strokeWidth={expanded?14:9} opacity=".18" filter={`url(#${expanded?'glowBig':'glowSmall'})`}/>
    <path d={d} fill="none" stroke={C.mint} strokeWidth={expanded?5.4:4} strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray={1} strokeDashoffset={1-clamp(progress)}/>
    <circle cx={mapX(layout.shopperStart.x)*width} cy={mapY(layout.shopperStart.y)*height} r={expanded?9:7} fill={C.mint}/>
    <circle cx={mapX(layout.milkAccess.x)*width} cy={mapY(layout.milkAccess.y)*height} r={expanded?15:11} fill="none" stroke={C.mint} strokeWidth={expanded?3:2}/>
    <circle cx={mapX(layout.milkAccess.x)*width} cy={mapY(layout.milkAccess.y)*height} r={expanded?4:3} fill={C.white}/>
  </svg>;
};
