import fs from 'node:fs';
const l=JSON.parse(fs.readFileSync(new URL('../src/data/store-layout.json',import.meta.url)));
const inside=(p,s,clearance=0.05)=>p.x>s.x-s.width/2-clearance&&p.x<s.x+s.width/2+clearance&&p.y>s.y-s.length/2-clearance&&p.y<s.y+s.length/2+clearance;
for(const [i,p] of l.route.entries()){
  if(l.shelves.some(s=>inside(p,s)))throw new Error(`Route point ${i} intersects a shelf`);
  if(i){
    const a=l.route[i-1],steps=Math.ceil(Math.hypot(p.x-a.x,p.y-a.y)/0.05);
    for(let j=0;j<=steps;j++){
      const q={x:a.x+(p.x-a.x)*j/steps,y:a.y+(p.y-a.y)*j/steps};
      if(l.shelves.some(s=>inside(q,s)))throw new Error(`Route segment ${i} intersects a shelf at step ${j}`);
    }
  }
}
const end=l.route.at(-1),access=l.milkAccess;
if(end.x!==access.x||end.y!==access.y)throw new Error('Route endpoint differs from milk access');
console.log(`Verified ${l.route.length} points, ${l.shelves.length} shelves and a walkable milk access point.`);
