/* Head-locked flight readings and world-referenced attitude symbols. */
function createFlightVisor(canvas, T){
  const ctx=canvas.getContext("2d"),forward=new T.Vector3(),look=new T.Vector3(),ray=new T.Vector3(),inverse=new T.Quaternion();
  const degrees=180/Math.PI,green="#b5f1ab";
  let width=1,height=1,dpr=1;
  function resize(w,h){
    width=w;height=h;dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  }
  function readout(value,unit,x,y,size){
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font="600 "+size+"px ui-monospace,Menlo,monospace";
    const number=String(Math.round(value)),w=Math.max(size*2.6,ctx.measureText(number).width+10);
    ctx.strokeRect(x-w/2,y-size*.70,w,size*1.38);ctx.fillText(number,x,y+.25);
    ctx.font="600 "+Math.round(size*.68)+"px ui-monospace,Menlo,monospace";ctx.fillText(unit,x,y+size*1.32);
  }
  function draw(s,cam,aircraft){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    cam.getWorldDirection(look);inverse.copy(cam.quaternion).invert();
    const azimuth=Math.atan2(look.x,-look.z),viewPitch=Math.asin(T.MathUtils.clamp(look.y,-1,1))*degrees;
    const mid=width*.5,eyeY=height*.44,span=Math.min(width*.205,Math.max(76,height*.19)),size=T.MathUtils.clamp(height*.021,11,16);
    ctx.save();
    ctx.globalAlpha=s.engine>.1?.88:.72;ctx.strokeStyle=ctx.fillStyle=green;ctx.shadowColor="rgba(12,43,26,.8)";ctx.shadowBlur=2.7;ctx.lineWidth=1.2;
    // These three readings belong to the helmet and stay readable when the pilot turns.
    readout(s.airspeed*1.943844,"KT",mid-span,eyeY,size);
    readout(s.msl*3.28084,"FT",mid+span,eyeY,size);
    const sight=(Math.round(azimuth*degrees)%360+360)%360;
    ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="600 "+Math.round(size*.81)+"px ui-monospace,Menlo,monospace";
    ctx.fillText("LOOK "+String(sight).padStart(3,"0")+"°",mid,eyeY-Math.min(67,span*.59));
    // The waterline W stays on the airframe nose. Pitch marks are projected in
    // world space, including at an oblique look angle or inverted attitude.
    forward.set(0,1.29,-1250).applyMatrix4(aircraft.matrixWorld).project(cam);
    if(forward.z>0&&forward.z<1&&Math.abs(forward.x)<.9&&Math.abs(forward.y)<.88){
      ctx.save();ctx.translate(width*(.5+.5*forward.x),height*(.5-.5*forward.y));
      ctx.beginPath();ctx.moveTo(-13,-2);ctx.lineTo(-7,-2);ctx.lineTo(-4.5,2.5);ctx.lineTo(0,-3);
      ctx.lineTo(4.5,2.5);ctx.lineTo(7,-2);ctx.lineTo(13,-2);ctx.stroke();ctx.restore();
    }
    const inner=span*.15,outer=span*.55,focal=height*.5*cam.projectionMatrix.elements[5];
    ctx.save();ctx.beginPath();ctx.rect(mid-outer-13,height*.5-span*.41,2*outer+26,span*.82);ctx.clip();
    ctx.globalAlpha*=.68;
    // Sample bearings either side of the helmet view to form level marks on the sky.
    for(let mark=Math.ceil((viewPitch-18)/5)*5;mark<=viewPitch+18;mark+=5){
      if(Math.abs(mark)>=90)continue;
      const e=mark/degrees,cos=Math.cos(e);ctx.setLineDash(mark<0?[3,3]:[]);ctx.beginPath();
      for(const sign of [-1,1]){
        for(const end of [false,true]){
          const offset=(end?outer:inner)*(mark===0?1:.73);
          const a=azimuth+sign*Math.atan2(offset,focal*Math.max(.18,cos));
          ray.set(Math.sin(a)*cos,Math.sin(e),-Math.cos(a)*cos).applyQuaternion(inverse);
          if(ray.z>=-.02)break;
          const x=mid+focal*ray.x/-ray.z,y=height*.5-focal*ray.y/-ray.z;
          if(end)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();ctx.restore();
  }
  return {resize,draw};
}
