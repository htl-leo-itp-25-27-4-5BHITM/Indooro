import {Easing,interpolate} from 'remotion';
export const ease=Easing.bezier(0.16,1,0.3,1);
export const lerp=(f:number,a:number,b:number,x=0,y=1)=>interpolate(f,[a,b],[x,y],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
export const linear=(f:number,a:number,b:number,x=0,y=1)=>interpolate(f,[a,b],[x,y],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
export const inOut=(f:number,d:number)=>Math.min(lerp(f,0,18),1-lerp(f,d-18,d));
