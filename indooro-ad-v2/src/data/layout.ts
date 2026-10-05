import layout from './store-layout.json';
export {layout};
export type P={x:number;y:number};
export const mapX=(x:number)=>(x-layout.bounds.xMin)/(layout.bounds.xMax-layout.bounds.xMin);
export const mapY=(y:number)=>(y-layout.bounds.yMin)/(layout.bounds.yMax-layout.bounds.yMin);
export const routeD=(w:number,h:number)=>layout.route.map((p,i)=>
  `${i?'L':'M'} ${(mapX(p.x)*w).toFixed(1)} ${(mapY(p.y)*h).toFixed(1)}`).join(' ');
export function routeLength():number {
  return layout.route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-layout.route[i].x,p.y-layout.route[i].y),0);
}
