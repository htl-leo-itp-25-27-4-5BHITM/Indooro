import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {blocked,entrance,inefficient,milkRoute,optimized,products,route,tourLength} from './store';
test('route stays on walkable cells and reaches milk access node',()=>{
  assert.deepEqual(milkRoute[0],entrance);assert.deepEqual(milkRoute[milkRoute.length-1],products.Milch);
  for(const point of milkRoute)assert.equal(blocked(point),false);
  for(let i=1;i<milkRoute.length;i++)assert.equal(Math.abs(milkRoute[i].x-milkRoute[i-1].x)+Math.abs(milkRoute[i].y-milkRoute[i-1].y),1);
});
test('all sample destinations are routable and illustrated tour improves',()=>{
  for(const point of Object.values(products))assert.ok(route(entrance,point).length>0);
  assert.ok(tourLength(optimized)<tourLength(inefficient),`${tourLength(optimized)} must be less than ${tourLength(inefficient)}`);
});
