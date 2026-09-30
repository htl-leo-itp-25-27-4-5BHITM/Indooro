export const C={
  bg:'#071117',panel:'#11242B',panel2:'#18313A',mint:'#63E6B4',
  white:'#F4F7F5',muted:'#91A6A8',amber:'#E8B86D',stroke:'#31565D'
};
export const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x)};
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
