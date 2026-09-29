export type Point={x:number;y:number};
export type Block={x:number;y:number;w:number;h:number;label:string};
export const cols=18,rows=11,cell=48;
export const blocks:Block[]=[
  {x:3,y:2,w:2,h:3,label:'Brot'}, {x:7,y:2,w:2,h:3,label:'Obst'},
  {x:11,y:2,w:2,h:3,label:'Haushalt'}, {x:15,y:2,w:2,h:3,label:'Milch'},
  {x:3,y:7,w:2,h:2,label:'Getränke'}, {x:7,y:7,w:2,h:2,label:'Nudeln'},
  {x:11,y:7,w:2,h:2,label:'Snack'}, {x:15,y:7,w:2,h:2,label:'Äpfel'},
];
export const entrance:Point={x:1,y:9};
export const products={Milch:{x:14,y:3},Brot:{x:2,y:3},Nudeln:{x:9,y:8},Äpfel:{x:14,y:8}} as const;
export const key=(p:Point)=>`${p.x},${p.y}`;
export const blocked=(p:Point)=>p.x<0||p.y<0||p.x>=cols||p.y>=rows||blocks.some(b=>p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h);
const h=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function route(from:Point,to:Point):Point[]{
  const open:Point[]=[from],came=new Map<string,Point>(),g=new Map<string,number>([[key(from),0]]),closed=new Set<string>();
  while(open.length){
    open.sort((a,b)=>(g.get(key(a))??Infinity)+h(a,to)-(g.get(key(b))??Infinity)-h(b,to));
    const at=open.shift()!; if(key(at)===key(to)){const path=[at];let k=key(at);while(came.has(k)){const prev=came.get(k)!;path.unshift(prev);k=key(prev);}return path;}
    closed.add(key(at));
    for(const n of [{x:at.x+1,y:at.y},{x:at.x-1,y:at.y},{x:at.x,y:at.y+1},{x:at.x,y:at.y-1}]){
      if(blocked(n)||closed.has(key(n)))continue;
      const score=(g.get(key(at))??Infinity)+1;
      if(score<(g.get(key(n))??Infinity)){came.set(key(n),at);g.set(key(n),score);if(!open.some(o=>key(o)===key(n)))open.push(n);}
    }
  }
  throw new Error(`No walkable route ${key(from)} -> ${key(to)}`);
}
export const px=(p:Point)=>({x:p.x*cell+cell/2,y:p.y*cell+cell/2});
export const path=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${px(p).x},${px(p).y}`).join(' ');
export const milkRoute=route(entrance,products.Milch);
export const names=['Milch','Brot','Nudeln','Äpfel'] as const;
export type ProductName=typeof names[number];
export const distance=(a:Point,b:Point)=>route(a,b).length-1;
export const tourLength=(order:readonly ProductName[])=>order.reduce((total,name,i)=>total+distance(i?products[order[i-1]]:entrance,products[name]),0);
export function optimizedTour():ProductName[]{
  const remaining=[...names];let at:Point=entrance;const order:ProductName[]=[];
  while(remaining.length){remaining.sort((a,b)=>distance(at,products[a])-distance(at,products[b]));const name=remaining.shift()!;order.push(name);at=products[name];}
  let improved=true;while(improved){improved=false;for(let i=0;i<order.length-1;i++)for(let j=i+1;j<order.length;j++){const candidate=[...order.slice(0,i),...order.slice(i,j+1).reverse(),...order.slice(j+1)];if(tourLength(candidate)<tourLength(order)){order.splice(0,order.length,...candidate);improved=true;}}}
  return order;
}
export const optimized=optimizedTour();
export const inefficient:ProductName[]=['Milch','Brot','Äpfel','Nudeln'];
export const tourPath=(order:readonly ProductName[])=>{let at:Point=entrance;const all:Point[]=[];for(const name of order){const segment=route(at,products[name]);all.push(...(all.length?segment.slice(1):segment));at=products[name];}return all;};
