"""Original 26-second stereo timing bed for internal rough-cut review only.

No sampled, licensed, cloned or third-party audio. This is deliberately not a
final score, designed sound mix or German voice-over.
"""
from array import array
from pathlib import Path
import math
import wave

SR=48000
DURATION=26
TAU=math.tau
OUT=Path(__file__).parent/'public/audio/roughcut-temp.wav'
OUT.parent.mkdir(parents=True,exist_ok=True)

def clamp(v): return max(0.0,min(1.0,v))
def window(t,start,length):
    u=(t-start)/length
    return 0.0 if u<0 or u>1 else math.sin(math.pi*u)**2
def strike(t,start,length,frequency):
    u=t-start
    if u<0 or u>length: return 0.0
    return math.exp(-7*u/length)*(math.sin(TAU*frequency*u)+.22*math.sin(TAU*frequency*2*u))
def route_tone(t,start,length,frequency):
    u=t-start
    if u<0 or u>length: return 0.0
    envelope=math.sin(math.pi*u/length)**1.3
    return envelope*(math.sin(TAU*frequency*u)+.18*math.sin(TAU*frequency*2.01*u))

pcm=array('h')
for i in range(SR*DURATION):
    t=i/SR
    # The score follows the planned 13 bars at 120 BPM: uncertainty, route,
    # movement, destination and a quiet brand tail.
    music=(.015*math.sin(TAU*110*t)+.009*math.sin(TAU*164.81*t))
    if t<4:
        music+=.012*math.sin(TAU*146.83*t)
    elif t<22:
        music+=.012*math.sin(TAU*196*t)
    else:
        music+=.011*math.sin(TAU*220*t)
    movement=clamp((t-5.8)/1.5)*(1-clamp((t-18)/3.6))
    beat_phase=t%0.5
    beat=math.exp(-beat_phase*19)*math.sin(TAU*55*t)
    music+=beat*(.014 if t<4 else .038*movement+.014)
    # At activation the bed makes room for the image's clarity shift.
    music*=1-.72*window(t,2.43,.42)
    # During the last two seconds the brand holds rather than pushing louder.
    music*=1-.42*clamp((t-23.5)/2.5)

    common=music
    common+=.028*strike(t,5.13,.15,620)
    common+=.042*route_tone(t,6.0,.48,440)
    common+=.036*route_tone(t,6.23,.7,587.33)
    common+=.02*window(t,7.15,2.45)*math.sin(TAU*(82+12*(t-7.15))*t)
    common+=.028*route_tone(t,20.30,.45,440)
    common+=.031*route_tone(t,20.55,.58,587.33)
    common+=.03*strike(t,21.42,.24,315)
    common+=.042*route_tone(t,22.45,.50,440)
    common+=.047*route_tone(t,22.70,.72,587.33)

    # Two restrained directional aisle passes and one overhead accent.
    left=common+.022*strike(t,.40,.22,265)+.015*strike(t,15.17,.25,415)
    right=common+.022*strike(t,1.50,.20,310)+.015*strike(t,15.17,.25,515)
    for value in (left,right):
        pcm.append(int(max(-1,min(1,value*3.2))*32767))

with wave.open(str(OUT),'wb') as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(SR)
    file.writeframes(pcm.tobytes())
print(f'Wrote {OUT} ({DURATION} s, stereo 48 kHz, original scratch bed)')
