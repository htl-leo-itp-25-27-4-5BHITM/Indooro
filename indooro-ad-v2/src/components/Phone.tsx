import React from 'react';
import {C,clamp,smooth} from '../design/system';
import {MapView} from './MapView';

type Mode='search'|'map';
export const Phone:React.FC<{frame:number;mode:Mode;mapProgress?:number}>=({frame,mode,mapProgress=0})=>{
  const selected=smooth((frame-20)/10),showMap=mode==='map'||frame>=43;
  return <div style={{width:382,height:660,position:'relative',borderRadius:56,padding:11,
    background:'linear-gradient(145deg,#728E95 0%,#1A3039 18%,#081318 48%,#46636A 92%,#0C1A1E)',
    boxShadow:'0 38px 90px #000d,0 0 0 2px #72909255'}}>
    <div style={{position:'absolute',inset:11,borderRadius:46,overflow:'hidden',background:C.bg,border:'2px solid #18313A'}}>
      <div style={{position:'absolute',top:10,left:122,width:116,height:25,borderRadius:25,background:'#02080B',zIndex:5}}/>
      <div style={{padding:'61px 24px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:19,fontWeight:800,letterSpacing:-.8}}>
          indooro<span style={{color:C.mint}}>●</span>
          <span style={{width:29,height:29,borderRadius:25,background:'#20353C',border:'1px solid #38565C'}}/>
        </div>
        <div style={{fontSize:12,color:C.muted,marginTop:27,letterSpacing:2,fontWeight:700}}>{showMap?'DEIN WEG':'PRODUKT SUCHEN'}</div>
        {showMap?
          <><div style={{fontSize:25,fontWeight:700,marginTop:9,marginBottom:17}}>Route zu Milch</div>
          <div style={{borderRadius:18,overflow:'hidden',border:'1px solid #31565D'}}><MapView width={308} height={373} progress={mapProgress}/></div>
          <div style={{marginTop:18,padding:'13px 17px',borderRadius:13,background:C.mint,color:C.bg,fontSize:17,fontWeight:800,textAlign:'center'}}>Route anzeigen ↗</div></>:
          <><div style={{fontSize:27,fontWeight:700,marginTop:12}}>Was suchst du?</div>
          <div style={{marginTop:22,padding:'15px 17px',borderRadius:14,border:`2px solid ${C.mint}`,background:C.panel2,fontSize:22,fontWeight:600}}>
            <span style={{color:C.muted,marginRight:15}}>⌕</span>{frame<9?'': 'Milch'}
          </div>
          <div style={{color:C.muted,fontSize:12,letterSpacing:2,fontWeight:700,marginTop:31}}>ERGEBNIS</div>
          <div style={{opacity:clamp((frame-14)/7),marginTop:12,padding:'19px 17px',borderRadius:16,
            background:selected>.5?'#1C4A43':C.panel,border:`1px solid ${selected>.5?C.mint:C.stroke}`,
            display:'flex',justifyContent:'space-between',fontSize:20,fontWeight:650}}>
            <span>Milch</span><span style={{color:C.mint}}>↗</span>
          </div>
          <div style={{opacity:clamp((frame-16)/8),marginTop:13,color:C.muted,fontSize:14}}>Kühlregal · Konzeptdarstellung</div>
          </>}
      </div>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(120deg,#ffffff11 0%,transparent 24%,transparent 72%,#ffffff07 100%)'}}/>
    </div>
  </div>;
};
