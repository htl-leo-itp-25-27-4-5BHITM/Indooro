"""Original, internal-only scratch cues for four prototype reviews. Not final audio."""
from pathlib import Path
import math, struct, wave
sr=48000
out=Path(__file__).parent/'public/audio'
out.mkdir(parents=True,exist_ok=True)
lengths={'P1':4,'P2':2,'P3':4,'P4':8}
def env(t,start,dur):
    u=(t-start)/dur
    return 0 if u<0 or u>1 else math.sin(math.pi*u)**2
for kind,dur in lengths.items():
    samples=[]
    for i in range(sr*dur):
        t=i/sr
        v=0.0
        if kind=='P1':
            v+=.08*math.sin(2*math.pi*55*t)*(1-.5*env(t,2.5,.3))
            for at in (.22,1.05,2.2):v+=.035*env(t,at,.09)*math.sin(2*math.pi*270*t)
            v+=.05*env(t,2.62,.55)*math.sin(2*math.pi*466*t)
        elif kind=='P2':
            v+=.035*math.sin(2*math.pi*110*t)
            v+=.09*env(t,.9,.13)*math.sin(2*math.pi*620*t)
            v+=.05*env(t,1.45,.28)*math.sin(2*math.pi*440*t)
        elif kind=='P3':
            v+=.035*math.sin(2*math.pi*55*t)
            v+=.08*env(t,.05,2.8)*math.sin(2*math.pi*(440+105*t)*t)
            v+=.055*env(t,1.7,1.9)*math.sin(2*math.pi*88*t)
        else:
            v+=.025*math.sin(2*math.pi*55*t)*(1-.6*env(t,3.9,.5))
            v+=.07*env(t,2.35,.7)*math.sin(2*math.pi*440*t)
            v+=.07*env(t,4.15,.8)*math.sin(2*math.pi*440*t)
            v+=.07*env(t,4.63,1.1)*math.sin(2*math.pi*587.33*t)
        samples.append(struct.pack('<h',int(max(-1,min(1,v))*32767)))
    with wave.open(str(out/f'{kind}-temp.wav'),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes(b''.join(samples))
    print(kind,dur)
