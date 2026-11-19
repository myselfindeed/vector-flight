/* Compact, independently scaled attitude and flight instrument. */
function createPilotDisplay(canvas, fixedSize=null) {
  const ctx=canvas.getContext('2d');
  const width=280, height=168, cx=139, cy=77, bottom=134;
  const deg=180/Math.PI, knotsPerMetreSecond=1.943844492, feetPerMetre=3.280839895;
  const amber='#ffd080', cyan='#9ad9df', ink='#0e191d', white='#f3f1df';
  const digits='"Barlow Condensed", "Arial Narrow", ui-monospace, monospace';
  const labels='Arial, Helvetica, sans-serif';
  let scale=0, offsetX=0, offsetY=0;
  const finite=n=>Number.isFinite(n)?n:0;
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  if(!canvas.hasAttribute('aria-label'))canvas.setAttribute('aria-label','主飞行显示器，显示姿态、空速、海拔、航向和升降率');
  if(!canvas.hasAttribute('role'))canvas.setAttribute('role','img');

  function resize(){
    const box=fixedSize||canvas.getBoundingClientRect();
    if(!box.width||!box.height){scale=0;return;}
    const ratio=fixedSize?1:Math.min(3,Math.max(1,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round((fixedSize?box.width:canvas.clientWidth||box.width)*ratio));
    const h=Math.max(1,Math.round((fixedSize?box.height:canvas.clientHeight||box.height)*ratio));
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    scale=Math.min(w/width,h/height);offsetX=(w-width*scale)/2;offsetY=(h-height*scale)/2;
  }
  function stroke(points,color,weight=1){
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.stroke();
  }
  function polygon(points,fill,border,weight=1){
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    if(border){ctx.strokeStyle=border;ctx.lineWidth=weight;ctx.stroke();}
  }
  function label(value,x,y,size,color,align='center',family=digits,weight=600){
    ctx.font=weight+' '+size+'px '+family;ctx.textAlign=align;ctx.textBaseline='middle';
    ctx.fillStyle=color;ctx.fillText(value,x,y);
  }
  function attitude(pitch,bank){
    const x0=52,x1=220;
    ctx.save();ctx.beginPath();ctx.rect(x0,1,x1-x0,bottom-1);ctx.clip();
    const perDegree=2.60;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(bank);ctx.translate(0,pitch*perDegree);
    const sky=ctx.createLinearGradient(0,-105,0,0);
    sky.addColorStop(0,'#244657');sky.addColorStop(1,'#5b91a0');
    ctx.fillStyle=sky;ctx.fillRect(-480,-510,960,510);
    const ground=ctx.createLinearGradient(0,0,0,110);
    ground.addColorStop(0,'#94734f');ground.addColorStop(1,'#524438');
    ctx.fillStyle=ground;ctx.fillRect(-480,0,960,510);
    stroke([[-460,0],[460,0]],'#e9f0d8',1.6);ctx.restore();

    // Keep ladder labels out of the bank arc and the fixed readout windows.
    ctx.save();ctx.beginPath();ctx.rect(x0+4,36,x1-x0-8,bottom-39);ctx.clip();
    ctx.translate(cx,cy);ctx.rotate(bank);
    for(let angle=Math.floor((pitch-27)/5)*5;angle<=pitch+27;angle+=5){
      if(angle===0||Math.abs(angle)>90)continue;
      const y=(pitch-angle)*perDegree, major=angle%10===0, length=major?22:11;
      const shade=major?'#e1e9da':'rgba(233,238,222,.78)';
      if(angle<0)ctx.setLineDash([3,2]);
      stroke([[-length,y],[-4,y]],shade,major?1.15:.9);stroke([[4,y],[length,y]],shade,major?1.15:.9);
      ctx.setLineDash([]);
      if(major){
        const hook=angle>0?3:-3;
        stroke([[-length,y],[-length,y+hook]],shade);stroke([[length,y],[length,y+hook]],shade);
        const tx=length+5,ty=y+.5,sx=cx+Math.cos(bank)*tx-Math.sin(bank)*ty,sy=cy+Math.sin(bank)*tx+Math.cos(bank)*ty;
        if(sy>44&&sy<bottom-10&&sx>x0+8&&sx<x1-17)label(String(Math.abs(angle)),tx,ty,10.7,shade,'left');
      }
    }
    ctx.restore();

    // Bank angle is read against a fixed scale. The horizon rolls left in a right bank.
    const bankRad=61, bankY=76;
    const onArc=(a,r)=>[cx+Math.sin(a)*r,bankY-Math.cos(a)*r];
    ctx.beginPath();ctx.arc(cx,bankY,bankRad,-Math.PI*.78,-Math.PI*.22);
    ctx.strokeStyle='rgba(238,246,225,.45)';ctx.lineWidth=.9;ctx.stroke();
    for(const mark of [-45,-30,-20,-10,0,10,20,30,45]){
      const a=mark/deg, long=mark%30===0||Math.abs(mark)===45;
      stroke([onArc(a,bankRad-1),onArc(a,bankRad+(long?5:2.5))],white,long?1.65:1);
    }
    const a=clamp(-bank,-.86,.86);
    polygon([onArc(a,bankRad-1),onArc(a-.054,bankRad-9),onArc(a+.054,bankRad-9)],amber,'#4c4131',.8);

    // The amber reference wings stay fixed to the display as the earth moves behind them.
    const left=[[cx-35,cy],[cx-13,cy],[cx-13,cy+5]], right=[[cx+13,cy+5],[cx+13,cy],[cx+35,cy]];
    ctx.lineJoin='round';ctx.lineCap='round';
    for(const wing of [left,right]){stroke(wing,'#263130',4.5);stroke(wing,amber,2.45);}
    ctx.fillStyle='#263130';ctx.fillRect(cx-3.8,cy-3.8,7.6,7.6);
    ctx.fillStyle=amber;ctx.fillRect(cx-2.35,cy-2.35,4.7,4.7);
    ctx.restore();
  }
  function tape(value,left){
    const x0=left?0:220,x1=left?52:width,edge=left?51:220;
    ctx.fillStyle='#18282c';ctx.fillRect(x0,0,x1-x0,bottom);
    ctx.fillStyle='#23373a';ctx.fillRect(edge-(left?0:1),0,1.5,bottom);
    const name=left?'IAS':'MSL',unit=left?'KT':'FT';
    label(name,x0+6,10,11.5,cyan,'left',labels,700);
    label(unit,x1-5,10,10.6,'#a0afad','right',labels,600);
    const step=left?5:Math.abs(value)<450?10:20, majorEvery=left?4:5;
    const pixels=left?6.9:7.8;
    ctx.save();ctx.beginPath();ctx.rect(x0,18,x1-x0,bottom-19);ctx.clip();
    const first=Math.floor((value-(bottom-cy)*step/pixels)/step),last=Math.ceil((value+(cy-17)*step/pixels)/step);
    for(let i=first;i<=last;i++){
      const number=i*step;if(left&&number<0)continue;
      const y=cy-(number-value)*pixels/step,major=i%majorEvery===0, tick=major?8:3;
      const inside=edge+(left?-tick:tick);
      stroke([[edge,y],[inside,y]],major?'#b0c4bd':'#6b8584',major?1.4:.85);
      if(major&&y>25&&y<bottom-8&&Math.abs(y-cy)>18)label(String(number),inside+(left?-3:3),y+.4,13.7,'#c5d3ca',left?'right':'left');
    }
    ctx.restore();
    const yy=cy, window=left?[[1,yy-12],[43,yy-12],[52,yy],[43,yy+12],[1,yy+12]]:
      [[225,yy-12],[279,yy-12],[279,yy+12],[225,yy+12],[218,yy]];
    polygon(window,'#111c20','#b3c6be',1.05);
    const text=String(Math.round(value));
    label(text,left?23.5:252,yy+.1,text.length>4?20:24.5,white);
  }
  function footer(heading,vertical){
    ctx.fillStyle='#132024';ctx.fillRect(0,bottom,width,height-bottom);
    stroke([[0,bottom+.5],[width,bottom+.5]],'#566c6b',1);
    const y=151,div=131;
    stroke([[div,142],[div,160]],'#415456');
    label('HDG',8,y,12,cyan,'left',labels,700);
    const course=String((Math.round(heading)%360+360)%360).padStart(3,'0')+'°';
    label(course,87,y,23,white);
    label('V/S',div+9,y,12,cyan,'left',labels,700);
    const fpm=Math.round(vertical*feetPerMetre*60/10)*10;
    const up=fpm>0,down=fpm<0,tip=up?-1:1,x=184;
    if(up||down){
      stroke([[x,y-tip*5],[x,y+tip*5],[x-3.4,y+tip*1.7]],amber,1.8);
      stroke([[x,y+tip*5],[x+3.4,y+tip*1.7]],amber,1.8);
    }else stroke([[x-3.5,y],[x+3.5,y]],'#a6b5b1',1.5);
    const value=String(Math.min(99999,Math.abs(fpm)));
    label(value,231,y,value.length>4?18:21.5,white,'right');label('FPM',240,y,11.2,'#b3c1b9','left',labels,600);
  }
  function draw(state={}){
    if(!scale){resize();if(!scale)return;}
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=ink;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(scale,0,0,scale,offsetX,offsetY);ctx.lineCap='butt';ctx.lineJoin='miter';
    const roll=finite(state.displayRoll??state.roll), bank=Math.atan2(Math.sin(roll),Math.cos(roll));
    attitude(clamp(finite(state.displayPitch??state.pitch)*deg,-90,90),bank);
    tape(Math.max(0,finite(state.airspeed))*knotsPerMetreSecond,true);
    tape(finite(state.msl)*feetPerMetre,false);
    footer(finite(state.displayHeading??state.heading)*deg,finite(state.vy));
  }
  resize();
  return {resize,draw};
}
