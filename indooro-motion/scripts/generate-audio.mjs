import fs from 'node:fs';
import path from 'node:path';

// Original procedural score: synthesized oscillators and noise only, no samples.
const sr=44100,seconds=65,n=sr*seconds,data=new Int16Array(n*2);
const cuts=[6,13,23,34,43,52,59];
const notes=[146.83,174.61,220,293.66];
const fract=x=>x-Math.floor(x);
const noise=i=>fract(Math.sin(i*12.9898+78.233)*43758.5453)*2-1;
for(let i=0;i<n;i++){
  const t=i/sr,beat=t*92/60,phase=fract(beat);
  const fade=Math.min(1,t/1.5,Math.max(0,(seconds-t)/2));
  const chord=notes.reduce((s,hz,j)=>s+Math.sin(2*Math.PI*hz*t+(j*.16))*(.022/(j+1)),0);
  const bass=Math.sin(2*Math.PI*73.416*t)*Math.pow(Math.max(0,1-phase*3),2)*.055;
  const tick=Math.pow(Math.max(0,1-fract(beat*2)*13),3)*noise(i)*.016;
  let accent=0;
  for(const cut of cuts){const dt=t-cut;if(dt>=0&&dt<.65)accent+=Math.sin(2*Math.PI*(440+dt*160)*dt)*Math.exp(-dt*9)*.042;}
  const finalDt=t-60;if(finalDt>=0&&finalDt<2.5)accent+=Math.sin(2*Math.PI*(finalDt<.7?293.66:440)*finalDt)*Math.exp(-finalDt*1.4)*.036;
  const swell=(t>55&&t<61)?Math.sin((t-55)/6*Math.PI)*.018*Math.sin(2*Math.PI*349.23*t):0;
  const sample=Math.max(-.8,Math.min(.8,(chord+bass+tick+accent+swell)*fade*4));
  data[i*2]=Math.round(sample*32767);data[i*2+1]=Math.round(sample*32767);
}
const out=Buffer.alloc(44+data.byteLength);out.write('RIFF',0);out.writeUInt32LE(36+data.byteLength,4);out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(data.byteLength,40);
Buffer.from(data.buffer).copy(out,44);const target=path.join('public','audio','indooro-original-score.wav');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,out);
console.log(`Generated ${target}: ${seconds}s, stereo PCM, original synthesis`);
