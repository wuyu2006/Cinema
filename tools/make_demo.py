"""仅用于生成已随项目交付的试映素材；运行影院不依赖此脚本或 FFmpeg。"""
from pathlib import Path
import subprocess, numpy as np
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]
width,height,fps=960,540,24
public=root/'dist' if (root/'dist').exists() else root
out=public/'assets/first-light.mp4'
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',36)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',10)
rng=np.random.default_rng(42);stars=rng.random((420,3))
y,x=np.mgrid[0:height,0:width];dx=(x-width/2)/width;dy=(y-height/2)/height
cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(fps),'-i','-','-f','lavfi','-i','sine=frequency=110:sample_rate=48000:duration=12','-filter_complex','[1:a]volume=0.09,pan=stereo|c0=c0|c1=c0,afade=t=in:d=2,afade=t=out:st=10:d=2[a]','-map','0:v','-map','[a]','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-t','12',str(out)]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for frame in range(fps*12):
 t=frame/fps
 haze=np.exp(-((dx*.65+dy*.8+np.sin(t*.15)*.05)**2/.015+((dx*.8-dy*.65)**2/.4)))
 vignette=np.clip(1-(dx*1.3)**2-(dy*1.4)**2,.15,1)
 arr=np.stack([(7+haze*15)*vignette,(11+haze*31)*vignette,(19+haze*40)*vignette],axis=-1).astype('uint8')
 image=Image.fromarray(arr);d=ImageDraw.Draw(image)
 for sx,sy,sv in stars:
  px=int((sx*width+t*(sv-.5)*2)%width);py=int(sy*height);v=int((50+sv*120)*(.8+.2*np.sin(t+sx*7)))
  d.point((px,py),fill=(v,v,min(255,v+15)))
 cx,cy=width/2,height*.38;r=77+np.sin(t*.2)*3
 for i in range(24,0,-1):
  rr=r+i*.8;v=int(12+(24-i)*.7);d.ellipse([cx-rr,cy-rr,cx+rr,cy+rr],outline=(v,int(v*1.45),int(v*1.65)))
 d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=(4,10,16),outline=(123,153,163),width=1)
 d.arc([cx-r,cy-r,cx+r,cy+r],200+t*2,325+t*2,fill=(191,198,187),width=2)
 for i in range(3):
  rx=125+i*3;ry=37+i;d.arc([cx-rx,cy-ry,cx+rx,cy+ry],5,190,fill=(116-i*20,97-i*15,72-i*10),width=1)
 title='F I R S T   L I G H T';box=d.textbbox((0,0),title,font=font);d.text(((width-(box[2]-box[0]))/2,370),title,font=font,fill=(215,211,198))
 subtitle='AN IMMERSIVE CINEMA TEST SCREENING';box=d.textbbox((0,0),subtitle,font=small);d.text(((width-(box[2]-box[0]))/2,437),subtitle,font=small,fill=(153,157,157))
 fade=min(1,t/1.5,(12-t)/1.7);image=Image.fromarray((np.array(image)*max(0,fade)).astype('uint8'))
 proc.stdin.write(image.tobytes())
proc.stdin.close();assert proc.wait()==0
print(out, out.stat().st_size,'bytes')
