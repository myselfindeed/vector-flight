/* An original floating flight-test station. The deck mesh and contact tests use the same stations. */
function createCarrier(THREE, world, art) {
  'use strict';
  const {box,cylinder,beam,instance,random,seaLevel}=art, TAU=Math.PI*2;
  // z, port edge, starboard edge, hull waterline half-width. The marked trial lane follows x = -5.
  const stations=[[-115,-12.6,7.6,.40],[-111,-16.9,11.9,2.9],[-96,-20.0,17.3,7.7],[-76,-21.3,19.4,12.1],
    [-47,-22.6,21.8,15.7],[-24,-29.7,25.4,17.4],[0,-33.5,27.0,17.9],[35,-29.0,27.2,17.9],
    [57,-24.3,24.7,17.6],[89,-23.5,23.8,16.7],[105,-22.7,22.1,14.8],[112,-19.1,18.2,12.8],[115,-15.2,15.4,11.5]];
  const firstZ=stations[0][0],lastZ=stations[stations.length-1][0];
  function section(z){
    if(z<firstZ||z>lastZ)return null;
    let i=1;while(i<stations.length-1&&z>stations[i][0])i++;
    const a=stations[i-1],b=stations[i],f=(z-a[0])/(b[0]-a[0]);
    return [a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,a[3]+(b[3]-a[3])*f];
  }
  function isDeck(x,z){const edge=section(z);return !!edge&&x>=edge[0]&&x<=edge[1];}
  const objects=[];
  function solidBox(x,y,z,width,height,length,yaw=0){const contact={x,y,z,w:width/2,h:height/2,d:length/2,yaw};objects.push(contact);return contact;}
  function solidPost(x,y,z,radius,height){objects.push({x,y,z,r:radius,h:height/2});}
  function obstacleAt(x,y,z,radius=0){
    const r=Math.max(0,radius);
    for(const o of objects){
      const dy=Math.max(Math.abs(y-o.y)-o.h,0);
      if(dy>r)continue;
      if(o.r!==undefined){
        const lateral=Math.max(Math.hypot(x-o.x,z-o.z)-o.r,0);
        if(lateral*lateral+dy*dy<=r*r)return true;
      }else{
        let ox=x-o.x,oz=z-o.z;
        if(o.yaw){const a=Math.cos(o.yaw),b=Math.sin(o.yaw),px=ox*a-oz*b;oz=ox*b+oz*a;ox=px;}
        const dx=Math.max(Math.abs(ox)-o.w,0),dz=Math.max(Math.abs(oz)-o.d,0);
        if(dx*dx+dy*dy+dz*dz<=r*r)return true;
      }
    }
    return false;
  }
  function meshData(name,points,index,uv,material,casters=true,receivers=true){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(index)g.setIndex(index);g.computeVertexNormals();
    const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=casters;m.receiveShadow=receivers;world.add(m);return m;
  }
  function texture(canvas,tile=false){
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
    if(tile)map.wrapS=map.wrapT=THREE.RepeatWrapping;return map;
  }
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function nonskid(){
    const c=canvas(256,256),ctx=c.getContext('2d'),im=ctx.createImageData(256,256);
    for(let i=0;i<im.data.length;i+=4){
      const v=72+14*(random()-.5)+9*(random()-.5)+(random()>.96?12:0);
      im.data[i]=v;im.data[i+1]=v+4;im.data[i+2]=v+4;im.data[i+3]=255;
    }
    ctx.putImageData(im,0,0);return c;
  }
  const deckGrain=nonskid();
  function deckPaint(){
    const c=canvas(1024,4096),ctx=c.getContext('2d'),xmin=-35,xmax=30,zmin=-117,zmax=117;
    ctx.fillStyle=ctx.createPattern(deckGrain,'repeat');ctx.fillRect(0,0,c.width,c.height);
    const sx=c.width/(xmax-xmin),sz=c.height/(zmax-zmin);
    ctx.setTransform(sx,0,0,sz,-xmin*sx,-zmin*sz);
    function rect(x,z,w,d,col){ctx.fillStyle=col;ctx.fillRect(x,z,w,d);}
    function line(x,z,x1,z1,col,width){ctx.strokeStyle=col;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,z);ctx.lineTo(x1,z1);ctx.stroke();}
    function dot(x,z,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,z,r,0,TAU);ctx.fill();}
    function track(x,z,width,length,opacity){
      ctx.save();ctx.translate(x,z);ctx.scale(width,length);
      const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(14,21,22,${opacity})`);g.addColorStop(.5,`rgba(26,32,33,${opacity*.55})`);g.addColorStop(1,'rgba(26,32,33,0)');
      ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
    }
    for(let z=-119;z<118;z+=9.4)for(let x=-35;x<30;x+=5.4){
      rect(x,z,5.37,9.36,random()>.5?`rgba(137,145,137,${.015+random()*.067})`:`rgba(19,31,34,${.024+random()*.087})`);
    }
    for(let i=0;i<127;i++){const x=-20+random()*39,z=-113+random()*225;
      track(x,z,1.5+random()*4.0,1.6+random()*8.8,.035+random()*.10);}
    for(let i=0;i<92;i++)track(-5+(random()-.5)*8.4,-109+random()*221,.13+random()*.55,1.4+random()*6.6,.11+random()*.18);
    const cream='rgba(229,226,207,.91)',dim='rgba(215,215,195,.70)',amber='rgba(214,172,77,.91)',safety='rgba(211,143,70,.77)';
    // Stand outlines and the long dashed trial lane remain legible from a low pilot camera.
    for(const x of [-16.2,6.15])line(x,-109,x,104,dim,.15);
    for(let z=-108;z<55;z+=9.2)rect(-5.22,z,.44,4.60,cream);
    rect(-5.17,88.5,.34,7.0,cream);rect(-5.17,101.4,.34,5.0,cream);
    for(let x=-13.9;x<5;x+=2.7){rect(x,-109.5,1.46,4.3,cream);rect(x,103.1,1.46,4.05,dim);}
    for(const z of [-92,-68,-43,-18,8,32]){
      line(-15.9,z,-14.8,z,dim,.17);line(4.8,z,5.85,z,dim,.17);
      if(z===-43||z===8){rect(-16.08,z+.9,.32,4.35,cream);rect(5.73,z+.9,.32,4.35,cream);}
    }
    // An amber service route runs exclusively along starboard, clear of the takeoff path.
    ctx.strokeStyle=amber;ctx.lineWidth=.125;ctx.beginPath();ctx.moveTo(8.0,111);ctx.lineTo(8.0,46);ctx.quadraticCurveTo(8,43,9.2,40);ctx.lineTo(11.0,35);ctx.lineTo(11.0,-38);ctx.quadraticCurveTo(11,-45,12,-52);ctx.lineTo(12,-85);ctx.stroke();
    for(let z=-87;z<100;z+=8)rect(9,z,.12,2.8,'rgba(210,169,86,.48)');
    ctx.strokeStyle=dim;ctx.lineWidth=.15;ctx.setLineDash([2.6,1.4]);ctx.strokeRect(-16.8,58.5,23.6,27.0);ctx.setLineDash([]);
    for(const side of [-1,1])for(const end of [-1,1]){
      const x=-5+side*10.3,z=72+end*10.6;
      line(x,z,x-side*2.6,z,cream,.27);line(x,z,x,z-end*2.6,cream,.27);
    }
    ctx.lineWidth=.27;ctx.strokeStyle=dim;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(-5,72,8.65,i*Math.PI/2+.21,(i+1)*Math.PI/2-.21);ctx.stroke();}
    line(-7.8,72,-2.2,72,dim,.32);line(-5,69.3,-5,74.7,dim,.32);
    ctx.font='bold 6.60px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=cream;ctx.fillText('04',12.7,76.3);
    line(9.6,80.2,16.0,80.2,amber,.15);
    ctx.font='bold 1.12px Arial, sans-serif';ctx.fillStyle=dim;ctx.fillText('FLIGHT DECK',12.8,82.3);
    ctx.font='bold 9.4px Arial, sans-serif';ctx.save();ctx.translate(2.25,-92);ctx.rotate(Math.PI);ctx.fillStyle=dim;ctx.fillText('04',0,0);ctx.restore();
    // Painted edge follows exactly the same asymmetric deck stations as the metal structure.
    for(const side of [1,2]){
      ctx.beginPath();for(let i=0;i<stations.length;i++){
        const st=stations[i],x=st[side]+(side===1?.74:-.74),z=st[0];if(i)ctx.lineTo(x,z);else ctx.moveTo(x,z);
      }ctx.strokeStyle=amber;ctx.lineWidth=.16;ctx.stroke();
    }
    for(let z=-108;z<110;z+=3.1){const e=section(z);if(!e)continue;
      for(let side=0;side<2;side++){if(z%31<7)continue;const x=e[side]+(side===0?.93:-.93);line(x,z,x+(side===0?.67:-.67),z+.72,safety,.24);}}
    for(let z=-119;z<118;z+=9.4){line(-35,z,30,z,'rgba(28,31,31,.57)',.059);line(-35,z+.08,30,z+.08,'rgba(155,153,139,.24)',.046);}
    for(let x=-35;x<31;x+=5.4){line(x,-117,x,117,'rgba(26,32,33,.46)',.052);}
    for(let z=-111;z<114;z+=5.45)for(let x=-31.4;x<28;x+=4.82){if(!isDeck(x,z))continue;
      dot(x,z,.158,'rgba(37,41,39,.93)');dot(x-.022,z-.030,.104,'rgba(137,138,122,.59)');dot(x+.015,z+.014,.067,'rgba(52,59,55,.90)');}
    for(let i=0;i<13400;i++)rect(-35+random()*65,-117+random()*234,.025+random()*.125,.028+random()*.087,random()>.5?'rgba(78,82,76,.28)':'rgba(119,124,115,.22)');
    const map=texture(c);return {map,xmin,xmax,zmin,zmax};
  }
  const paint=deckPaint(),points=[],indices=[],uv=[];
  for(let i=0;i<stations.length;i++){
    const [z,left,right]=stations[i];
    for(const x of [left,right]){points.push(x,0,z);uv.push((x-paint.xmin)/(paint.xmax-paint.xmin),1-(z-paint.zmin)/(paint.zmax-paint.zmin));}
    if(i<stations.length-1){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const top=meshData('海岬号 · 飞行甲板',points,indices,uv,new THREE.MeshStandardMaterial({map:paint.map,roughness:.91,metalness:.08}),false,true);
  top.renderOrder=1;
  function hullPaint(){
    const c=canvas(2048,384),ctx=c.getContext('2d'),im=ctx.createImageData(2048,384);
    const levels=[[0,[108,118,116]],[.13,[105,114,114]],[.55,[84,98,99]],[.590,[61,75,74]],[.602,[49,59,57]],[.634,[54,61,58]],[.641,[118,72,59]],[1,[93,57,48]]];
    for(let y=0;y<c.height;y++){
      const t=y/(c.height-1);let b=1;while(b<levels.length-1&&t>levels[b][0])b++;const lo=levels[b-1],hi=levels[b],f=(t-lo[0])/(hi[0]-lo[0]);
      for(let x=0;x<c.width;x++){const k=(y*c.width+x)*4,n=(random()-.5)*4.3+1.3*Math.sin(x*.007+y*.011);
        for(let channel=0;channel<3;channel++)im.data[k+channel]=lo[1][channel]+(hi[1][channel]-lo[1][channel])*f+n;im.data[k+3]=255;}
    }
    ctx.putImageData(im,0,0);
    for(let x=35;x<c.width;x+=65){ctx.fillStyle='rgba(31,42,42,.18)';ctx.fillRect(x,6,1.5,235);ctx.fillStyle='rgba(207,207,184,.12)';ctx.fillRect(x+2,7,1,231);}
    for(const y of [64,125,182]){ctx.fillStyle='rgba(44,57,55,.18)';ctx.fillRect(0,y,c.width,1);ctx.fillStyle='rgba(178,191,177,.09)';ctx.fillRect(0,y+1,c.width,1);}
    for(let i=0;i<250;i++){const x=random()*c.width,y=6+random()*193,w=1+random()*5,h=8+random()*44;const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,`rgba(79,64,44,${.08+random()*.14})`);g.addColorStop(1,'rgba(81,65,48,0)');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);}
    return texture(c);
  }
  const hullTex=hullPaint(), hullMat=new THREE.MeshStandardMaterial({map:hullTex,roughness:.76,metalness:.12,side:THREE.DoubleSide});
  const sideP=[],sideUV=[],sideI=[];
  // The outer flight deck overhangs the narrower flared hull. A red-painted underwater keel is visible at the bow.
  const ys=[-.16,-1.14,-2.55,-5.5,-10.7,-12.8,-14.30,-17.9,-20.6];
  function hullX(st,layer,sign){
    const width=st[3],deckX=sign<0?st[1]:st[2];
    if(layer===0)return deckX;
    if(layer===1)return deckX-sign*.30;
    const half=[0,0,width*1.13+1.02,width*1.09+.75,width*1.033+.30,width+.12,width*.96,width*.77,width*.28][layer];
    return sign*half;
  }
  function hullZ(st,layer){
    const z=st[0];return z< -76?z-(layer>1?((layer<6?layer-1:layer===6?5:3)*.68)*Math.pow((-76-z)/39,2):0):z>90&&layer>1?z-(layer-1)*.25*Math.pow((z-90)/25,2):z;
  }
  for(const sign of [-1,1]){
    const base=sideP.length/3;
    for(let k=0;k<stations.length;k++)for(let v=0;v<ys.length;v++){
      const st=stations[k],x=hullX(st,v,sign),z=hullZ(st,v);sideP.push(x,ys[v],z);sideUV.push((st[0]-firstZ)/(lastZ-firstZ),1-(ys[0]-ys[v])/(ys[0]-ys[ys.length-1]));
      if(k<stations.length-1&&v<ys.length-1){const a=base+k*ys.length+v,b=a+ys.length,c=a+1,d=b+1;if(sign<0)sideI.push(a,c,b,b,c,d);else sideI.push(a,b,c,b,d,c);}
    }
  }
  meshData('海岬号 · 舰体舷侧',sideP,sideI,sideUV,hullMat);
  for(const [k,dir] of [[0,-1],[stations.length-1,1]]){
    const st=stations[k],p=[],u=[],ix=[];
    for(let j=0;j<ys.length;j++){
      const l=hullX(st,j,-1),r=hullX(st,j,1),z=hullZ(st,j);
      for(const x of [l,r]){p.push(x,ys[j],z);u.push((x+32)/64,1-(ys[0]-ys[j])/(ys[0]-ys[ys.length-1]));}
      if(j<ys.length-1){let a=2*j;if(dir<0)ix.push(a,a+1,a+2,a+1,a+3,a+2);else ix.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    meshData(dir<0?'舰艏':'舰艉',p,ix,u,hullMat);
  }
  const keel=[],ki=[];for(let i=0;i<stations.length;i++){
    const st=stations[i],z=hullZ(st,ys.length-1);keel.push(hullX(st,8,-1),ys[8],z,hullX(st,8,1),ys[8],z);
    if(i<stations.length-1){const a=i*2;ki.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  meshData('龙骨',keel,ki,null,new THREE.MeshStandardMaterial({color:0x623b32,roughness:.88,side:THREE.DoubleSide}),false,false);
  const blade=0x637271,lightMetal=0x949e96,railing=0x788984;
  const deckLoop=[...stations.map(s=>[s[1],s[0]]),...stations.slice().reverse().map(s=>[s[2],s[0]])];
  const netP=[],netUV=[],netI=[];
  function netPattern(){
    const c=canvas(64,64),ctx=c.getContext('2d');ctx.clearRect(0,0,64,64);ctx.strokeStyle='rgba(146,154,142,.88)';ctx.lineWidth=2.9;
    for(const x of [-64,0,64,128]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+64,64);ctx.stroke();ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-64,64);ctx.stroke();}
    return texture(c,true);
  }
  for(let i=0;i<deckLoop.length;i++){
    const a=deckLoop[i],b=deckLoop[(i+1)%deckLoop.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const nx=-dz/length,nz=dx/length;
    beam(a[0],-.10,a[1],b[0],-.10,b[1],.20,.22,blade);
    beam(a[0]+nx*1.42,-.52,a[1]+nz*1.42,b[0]+nx*1.42,-.52,b[1]+nz*1.42,.095,.095,railing,'tube');
    const base=netP.length/3;
    netP.push(a[0]+nx*.13,-.20,a[1]+nz*.13,b[0]+nx*.13,-.20,b[1]+nz*.13,a[0]+nx*1.42,-.52,a[1]+nz*1.42,b[0]+nx*1.42,-.52,b[1]+nz*1.42);
    netUV.push(0,0,length/.92,0,0,1.42,length/.92,1.42);netI.push(base,base+1,base+2,base+1,base+3,base+2);
    const steps=Math.ceil(length/4.25);
    for(let q=0;q<steps;q++){
      const t=(q+.40)/steps,x=a[0]+dx*t,z=a[1]+dz*t;
      beam(x,-.96,z,x+nx*1.45,-.50,z+nz*1.45,.12,.12,blade);
      if(q%2===0){cylinder(x-nx*.47,.033,z-nz*.47,.31,.061,0x666e66);cylinder(x-nx*.47,.076,z-nz*.47,.165,.052,i<stations.length?0xecc68d:0xc3d1be,'lit');}
    }
  }
  const netMat=new THREE.MeshStandardMaterial({map:netPattern(),transparent:true,alphaTest:.18,depthWrite:false,side:THREE.DoubleSide,roughness:.83,metalness:.1});
  meshData('外舷安全网',netP,netI,netUV,netMat,false,false);
  function rails(ax,az,bx,bz,y,height=.92){
    const length=Math.hypot(bx-ax,bz-az),steps=Math.max(1,Math.ceil(length/2.65));
    for(let i=0;i<=steps;i++){const f=i/steps;cylinder(ax+(bx-ax)*f,y+height*.5,az+(bz-az)*f,.083,height,railing);}
    for(const h of [.42,height])beam(ax,y+h,az,bx,y+h,bz,.085,.085,railing,'tube');
  }
  // Service walkways, covered liferafts and recessed openings show the height of the deck above water.
  for(const side of [-1,1]){
    for(const z of [-84,-56,-30,-2,27,59,86]){
      const e=section(z),outer=e[side<0?0:1],x=outer+side*.46;
      box(x,-2.05,z,1.65,.31,7.6,0x6b7975,'steel');
      rails(x+side*.72,z-3.49,x+side*.72,z+3.49,-1.90,.90);
      for(const o of [-2.8,2.8])beam(outer-side*1.4,-3.6,z+o,x+side*.72,-2.1,z+o,.20,.22,blade);
      for(const o of [-1.8,0,1.8]){
        instance('round','solid',x,-1.43,z+o,.54,.83,.54,0xa3aaa1,0,0,Math.PI/2);
        box(x-.01,-1.63,z+o,.89,.16,.46,0x6c746b,'steel');
      }
    }
    for(const z of [-88,-73,-58,-43,-28,-13,2,17,32,47,62,77,92]){
      const e=section(z),x=side*(e[2]*1.11+.80);
      for(const off of [-1.52,0,1.52])box(x,-3.85,z+off,.08,.58,.92,0x394a4d,'glass');
    }
  }
  function signPanel(label,width,height,x,y,z,rotation,background,ink){
    const c=canvas(512,160),ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,512,160);ctx.fillStyle=ink;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 120px Arial, sans-serif';ctx.fillText(label,256,84,476);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:texture(c),transparent:true,depthWrite:false,roughness:.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
    m.position.set(x,y,z);m.rotation.y=rotation;m.castShadow=false;m.receiveShadow=false;world.add(m);
  }
  function hullNumeral(side){
    const c=canvas(256,136),ctx=c.getContext('2d');ctx.fillStyle='#c5c7b7';ctx.font='bold 112px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('04',128,74);
    const p=[],u=[],ix=[];
    for(let j=0;j<=2;j++)for(let i=0;i<=6;i++){
      const y=-8.3+1.49*j,z=-52.25-(i/6-.5)*8.1*side;
      let k=1;while(stations[k][0]<z)k++;
      const st0=stations[k-1],st1=stations[k],fz=(z-st0[0])/(st1[0]-st0[0]);
      const fy=(y-ys[3])/(ys[4]-ys[3]);
      const at=st=>hullX(st,3,side)+(hullX(st,4,side)-hullX(st,3,side))*fy;
      const x=at(st0)+(at(st1)-at(st0))*fz;
      p.push(x+side*.055,y,z);u.push(i/6,j/2);
      if(i<6&&j<2){const v=j*7+i;ix.push(v,v+7,v+1,v+1,v+7,v+8);}
    }
    meshData('舷号',p,ix,u,new THREE.MeshStandardMaterial({map:texture(c),transparent:true,depthWrite:false,roughness:.84,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}),false,false);
  }
  hullNumeral(-1);hullNumeral(1);
  signPanel('HAIJIAO  04',13.4,2.05,0,-4.55,114.6,0,'rgba(0,0,0,0)','#c5c8b6');

  const structure=0x929e99,upper=0xa1aaa3,trim=0x647573,panes=0x43636d;
  const wallSheet=canvas(512,256),wc=wallSheet.getContext('2d');wc.fillStyle='#f1f3f0';wc.fillRect(0,0,512,256);
  for(let i=0;i<1700;i++){wc.fillStyle=i%2?'rgba(163,164,151,.12)':'rgba(255,255,250,.25)';wc.fillRect(random()*512,random()*256,.8+random()*3,.5+random()*2);}
  for(const x of [1,164,332]){wc.fillStyle='rgba(93,110,106,.25)';wc.fillRect(x,0,1.2,256);wc.fillStyle='rgba(255,255,255,.75)';wc.fillRect(x+1.5,0,1,256);}
  wc.fillStyle='rgba(119,129,118,.21)';wc.fillRect(0,145,512,1);const wallSurface=texture(wallSheet,true);
  function chamber(name,x,z,w,d,y0,y1,topW,topD,chamfer,color,mat='steel'){
    const shape=(ww,dd)=>{const hx=ww/2,hz=dd/2,ch=Math.min(chamfer,hx*.55,hz*.55);
      return [[-hx+ch,-hz],[hx-ch,-hz],[hx,-hz+ch],[hx,hz-ch],[hx-ch,hz],[-hx+ch,hz],[-hx,hz-ch],[-hx,-hz+ch]];};
    const bottom=shape(w,d),top=shape(topW,topD),p=[],ix=[],uv=[];
    for(let i=0;i<8;i++){
      const j=(i+1)%8,base=p.length/3;for(const [pt,h] of [[bottom[i],y0],[top[i],y1],[bottom[j],y0],[top[j],y1]])p.push(x+pt[0],h,z+pt[1]);
      const across=Math.hypot(bottom[i][0]-bottom[j][0],bottom[i][1]-bottom[j][1])/8.5,rise=(y1-y0)/4.3;
      uv.push(0,0,0,rise,across,0,across,rise);ix.push(base,base+1,base+2,base+2,base+1,base+3);
    }
    const ti=p.length/3;for(const v of top){p.push(x+v[0],y1,z+v[1]);uv.push(.5+v[0]/topW,.5-v[1]/topD);}
    for(let i=1;i<7;i++)ix.push(ti,ti+i+1,ti+i);
    const material=new THREE.MeshStandardMaterial({color,map:mat==='glass'?null:wallSurface,roughness:mat==='glass'?.24:.72,metalness:mat==='glass'?.42:.16,side:THREE.DoubleSide});
    return meshData(name,p,ix,uv,material,true,mat!=='glass');
  }
  chamber('上层建筑',20.0,2.2,12.1,43.0,.06,4.0,11.1,42.2,1.45,structure);
  solidBox(20,2.0,2.2,11.9,4.0,42.5);
  chamber('舰岛',20.1,-1.75,10.9,31.0,3.92,8.15,9.6,29.3,1.10,upper);
  solidBox(20.1,6.05,-1.75,10.35,4.25,30.25);
  chamber('舰桥舷伸平台',19.9,-8.8,13.30,15.4,8.1,8.62,13.15,15.3,1.80,trim);
  chamber('舰桥下缘',19.9,-8.8,11.1,13.65,8.60,9.48,11.3,13.83,1.5,upper);
  chamber('全景舰桥',19.9,-8.8,11.37,13.85,9.44,11.47,12.23,14.53,1.57,panes,'glass');
  chamber('舰桥顶檐',19.9,-8.8,12.9,15.1,11.45,11.92,12.60,14.88,1.6,upper);
  solidBox(19.9,10.04,-8.8,12.7,3.84,14.9);
  for(let i=0;i<5;i++)for(const s of [-1,1]){
    const xx=19.9+(i-2)*1.94;beam(xx,9.46,-8.8+s*6.96,xx,11.51,-8.8+s*7.31,.108,.118,trim);
    const zz=-8.8+(i-2)*2.29;beam(19.9+s*5.70,9.46,zz,19.9+s*6.12,11.51,zz,.112,.112,trim);
  }
  const plates=canvas(512,128),pc=plates.getContext('2d');
  pc.fillStyle='#536367';pc.fillRect(3,3,122,122);pc.fillStyle='#87938e';pc.fillRect(6,6,116,116);
  pc.strokeStyle='#657572';pc.lineWidth=4;pc.strokeRect(14,11,99,105);pc.fillStyle='#455b61';pc.fillRect(33,24,51,23);pc.fillStyle='#b7b6a0';pc.fillRect(84,71,17,4);
  pc.fillStyle='#687775';pc.fillRect(131,4,122,120);pc.fillStyle='#435254';pc.fillRect(137,8,110,112);
  for(let j=0;j<10;j++){pc.fillStyle='#788984';pc.fillRect(139,13+j*10,106,3);}
  pc.fillStyle='#778b87';pc.fillRect(258,3,125,122);pc.fillStyle='#49656c';pc.fillRect(265,10,111,105);pc.fillStyle='#688089';pc.fillRect(265,10,111,15);pc.fillStyle='#82918a';pc.fillRect(319,10,4,106);
  pc.textAlign='center';pc.textBaseline='middle';pc.fillStyle='#dedcc3';pc.font='bold 84px Arial';pc.fillText('04',448,68);
  const detailP=[],detailUV=[],detailIx=[];
  function facade(level,face,h,c,w,dh,tile){
    const l=level===0?{x:20,z:2.2,w:12.1,d:43.0,e:11.1,f:42.2,y:.06,top:4}:{x:20.1,z:-1.75,w:10.9,d:31,e:9.6,f:29.3,y:3.92,top:8.15};
    const base=detailP.length/3;
    for(const [sx,sy] of [[0,0],[1,0],[0,1],[1,1]]){
      const y=h+(sy-.5)*dh,f=(y-l.y)/(l.top-l.y);const along=c+(sx-.5)*w;
      if(face===2)detailP.push(along,y,l.z+(l.d+(l.f-l.d)*f)*.5+.028);
      else detailP.push(l.x+face*((l.w+(l.e-l.w)*f)*.5+.028),y,along*face);
      detailUV.push((tile+.014+.972*(face===2?sx:1-sx))/4,.018+.964*sy);
    }
    detailIx.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  for(const side of [-1,1]){
    for(const [z,col,w,h] of [[-14.2,1,2.05,1.11],[-9.0,0,.97,1.83],[-4.9,2,1.42,.76],[.20,1,2.3,1.16],[5.18,0,1.04,1.98],[11.0,3,2.50,1.75],[16.1,1,2.29,1.08],[19.5,2,1.2,.72]])facade(0,side,1.83,z*side,w,h,col);
    for(const z of [-13.1,-8.1,-3.1,1.9,6.9,10.2])facade(1,side,6.12,z*side,1.56,.79,2);
  }
  facade(0,2,1.74,17.4,2.03,1.18,1);facade(0,2,1.46,20.11,1.12,2.12,0);facade(0,2,1.80,22.72,1.81,1.03,1);
  facade(1,2,5.8,18.24,1.51,.85,2);facade(1,2,5.6,21.72,1.89,1.10,1);
  meshData('舱门、舷窗和通风百叶',detailP,detailIx,detailUV,new THREE.MeshStandardMaterial({map:texture(plates),transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,roughness:.75}),false,false);
  rails(16.25,22.92,23.72,22.92,4.02,.86);rails(25.16,14.88,25.16,21.40,4.03,.86);
  for(const side of [-1,1]){
    const px=20+side*5.96;const life=new THREE.Mesh(new THREE.TorusGeometry(.36,.093,8,22),new THREE.MeshStandardMaterial({color:0xd88c58,roughness:.79}));
    life.position.set(px,1.50,8.10);life.rotation.y=side*Math.PI/2;world.add(life);
  }
  rails(13.27,-14.0,13.27,-3.65,8.63,.89);rails(15.35,-16.32,24.4,-16.32,8.63,.89);
  for(const z of [7.10,12.70]){
    chamber('通风围井',20.9,z,4.6,4.25,8.0,11.15,3.58,3.75,.41,trim);
    box(20.9,11.18,z,3.54,.12,3.72,0x414d4d,'steel');
    for(let j=0;j<8;j++)box(20.9,11.30,z+(j-3.5)*.39,3.28,.10,.12,0x6f7a75,'steel');
    solidBox(20.9,9.6,z,4.15,3.22,4.03);
  }
  function radome(x,y,z,d){
    cylinder(x,y+.45,z,d*.50,.91,trim);instance('sphere','solid',x,y+1.06+d*.34,z,d,d*.89,d,0xd4d6c8);
    cylinder(x,y+1.27,z,d*.88,.13,0xb7bdb5);solidPost(x,y+.70+d*.28,z,d*.47,1.40+d*.56);
  }
  radome(20.0,11.9,-12.55,3.45);radome(20.55,7.85,18.8,2.93);
  // Meteorological mast and communications antennae give the island its working silhouette.
  const mx=19.88,mz=.80;
  for(const [ax,az] of [[-2.22,-2],[2.22,-2],[2.22,2],[-2.22,2]]){
    beam(mx+ax,8.17,mz+az,mx+ax*.21,21.4,mz+az*.21,.34,.34,trim,'tube');
  }
  for(const h of [12.9,17.1,20.8]){
    const f=1-(h-8.17)/13.23*.79;
    for(const sign of [-1,1]){
      beam(mx-2.18*f,h,mz+sign*2*f,mx+2.18*f,h,mz+sign*2*f,.15,.15,trim,'tube');
      beam(mx+sign*2.18*f,h,mz-2*f,mx+sign*2.18*f,h,mz+2*f,.15,.15,trim,'tube');
    }
  }
  for(const [h1,h2] of [[8.6,12.9],[12.9,17.1],[17.1,20.8]]){
    const f=1-(h1-8.17)/13.23*.79,g=1-(h2-8.17)/13.23*.79;
    beam(mx-2.22*f,h1,mz-2*f,mx+2.22*g,h2,mz-2*g,.11,.11,trim,'tube');
    beam(mx+2.22*f,h1,mz+2*f,mx-2.22*g,h2,mz+2*g,.11,.11,trim,'tube');
  }
  box(mx,17.20,mz,5.44,.26,3.01,trim,'steel');cylinder(mx,22.10,mz,.21,3.1,trim);cylinder(mx,23.67,mz,.18,.16,0xffa673,'lit');
  cylinder(mx-2.24,18.10,mz,.11,1.65,0x84918a);cylinder(mx+2.24,18.29,mz,.11,2.14,0x84918a);
  solidBox(mx,13.5,mz,3.54,10.8,3.38);solidPost(mx,20.4,mz,.72,7.0);
  const weatherRadar=new THREE.Group();weatherRadar.name="气象扫描架";weatherRadar.position.set(mx,21.52,mz);world.add(weatherRadar);
  const bladeMesh=new THREE.Mesh(new THREE.BoxGeometry(5.35,.25,.36),new THREE.MeshStandardMaterial({color:0xc8cbbf,roughness:.55,metalness:.28}));
  weatherRadar.add(bladeMesh);bladeMesh.castShadow=true;
  const radarContact=solidBox(mx,21.52,mz,5.35,.25,.36);
  function workLights(x,y,z){
    for(let i=0;i<3;i++){box(x,y,z+(i-1)*.42,.41,.41,.37,0x546365,'steel');box(x-.215,y,z+(i-1)*.42,.035,.26,.30,0xe0d8bc,'lit');}
  }
  workLights(13.37,8.22,-9.0);workLights(13.95,3.50,22.5);
  // A low tow tractor and compact service carts are parked in the marked starboard bay.
  function tractor(x,z,yaw){
    function pos(ox,oz){return [x+ox*Math.cos(yaw)+oz*Math.sin(yaw),z-ox*Math.sin(yaw)+oz*Math.cos(yaw)];}
    function part(ox,y,oz,w,h,d,color,mat='solid'){const [px,pz]=pos(ox,oz);box(px,y,pz,w,h,d,color,mat,yaw);}
    part(0,.65,0,1.71,.68,3.08,0xb78c4c);part(.26,1.05,.32,1.05,.44,1.23,0x9d8054);part(0,1.10,-.94,1.45,.30,.81,0xc09b65);
    part(-.34,1.25,.41,.55,.49,.40,0x484f4b);part(0,.83,1.54,1.5,.20,.13,0x5a635c);
    for(const xx of [-.88,.88])for(const zz of [-.93,.99]){const [px,pz]=pos(xx,zz);instance('round','solid',px,.34,pz,.64,.23,.64,0x38413f,0,yaw,Math.PI/2);}
    solidBox(x,.79,z,2.05,1.58,3.28,yaw);
  }
  tractor(18.9,54.4,-.13);tractor(21.6,38.8,.21);
  for(const [x,z] of [[23.6,51.3],[17.8,-35.4],[19.5,-32.7]]){
    box(x,.53,z,1.23,.91,2.25,0x87948a,'steel');box(x,1.02,z,1.33,.15,2.31,0x9ca495,'steel');
    for(const o of [-.75,.75])box(x,.20,z+o,1.29,.30,.32,0x454d47);solidBox(x,.54,z,1.35,1.10,2.36);
  }
  createDeckFleet(THREE,world,solidBox);
  const flagY=15.15,flagPoleX=16.7,flagPoleZ=-8.0;
  cylinder(flagPoleX,13.55,flagPoleZ,.105,3.38,trim);cylinder(flagPoleX,15.3,flagPoleZ,.16,.13,0xd4bc8f);
  const flagRoot=new THREE.Group();flagRoot.name="试飞旗";flagRoot.position.set(flagPoleX,flagY,flagPoleZ);world.add(flagRoot);
  const flagCanvas=canvas(128,64),fc=flagCanvas.getContext('2d');fc.fillStyle='#d88e45';fc.fillRect(0,0,128,64);
  fc.fillStyle='#f0e6cc';fc.beginPath();fc.moveTo(17,0);fc.lineTo(36,0);fc.lineTo(88,64);fc.lineTo(68,64);fc.fill();
  fc.fillStyle='#485e68';fc.fillRect(0,0,14,64);
  const flagGeo=new THREE.PlaneGeometry(2.15,1.03,12,4),flagMat=new THREE.MeshStandardMaterial({map:texture(flagCanvas),side:THREE.DoubleSide,roughness:.94});
  flagGeo.translate(1.075,-.515,0);const flag=new THREE.Mesh(flagGeo,flagMat);flagRoot.add(flag);flag.frustumCulled=false;
  const flagBase=new Float32Array(flagGeo.attributes.position.array);
  const sockX=14.75,sockZ=45.3,sockY=5.55;
  cylinder(sockX,.17,sockZ,.94,.34,0x86836b);cylinder(sockX,sockY*.5,sockZ,.125,sockY,0xc5b591);cylinder(sockX,sockY+.02,sockZ,.23,.16,trim);
  solidPost(sockX,2.80,sockZ,.19,5.60);
  const sockRoot=new THREE.Group();sockRoot.name="风向袋";sockRoot.position.set(sockX,sockY,sockZ);world.add(sockRoot);
  const rings=12,sides=14,sa=new Float32Array((rings+1)*(sides+1)*3),sc=[],si=[];
  const orange=new THREE.Color(0xe38a4c),white=new THREE.Color(0xe4dfc7);
  for(let i=0;i<=rings;i++)for(let j=0;j<=sides;j++){
    const shade=(Math.floor(i/2)%2===0?orange:white);sc.push(shade.r,shade.g,shade.b);
    if(i<rings&&j<sides){const k=i*(sides+1)+j;si.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
  }
  const sockGeo=new THREE.BufferGeometry();sockGeo.setAttribute('position',new THREE.BufferAttribute(sa,3));sockGeo.setAttribute('color',new THREE.Float32BufferAttribute(sc,3));sockGeo.setIndex(si);
  const sock=new THREE.Mesh(sockGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,side:THREE.DoubleSide}));sock.frustumCulled=false;sockRoot.add(sock);
  let windYaw=0;
  function updateWind(state){
    const wx=Number.isFinite(state.windX)?state.windX:4,wz=Number.isFinite(state.windZ)?state.windZ:-2;
    const speed=Number.isFinite(state.windSpeed)?state.windSpeed:Math.hypot(wx,wz);
    if(speed>.12){const want=Math.atan2(-wz,wx),step=state.dt?1-Math.exp(-state.dt*3):1;windYaw+=Math.atan2(Math.sin(want-windYaw),Math.cos(want-windYaw))*step;}
    flagRoot.rotation.y=windYaw;sockRoot.rotation.y=windYaw;
    const t=state.time||0,f=Math.min(1,speed/9),fp=flagGeo.attributes.position;
    for(let k=0;k<fp.count;k++){
      const x=flagBase[k*3],y=flagBase[k*3+1],u=x/2.15;
      fp.setXYZ(k,x*(.82+.18*f),y-(1-f)*.29*u+.055*Math.sin(u*8.4-t*(2.8+f*2.0))*u,
        (.14*Math.sin(u*9.5-t*(3.0+f*2.5))+.046*Math.sin(u*16+y*2.1-t*3.8))*u);
    }
    fp.needsUpdate=true;flagGeo.computeVertexNormals();
    let offset=0;
    for(let i=0;i<=rings;i++){
      const u=i/rings,rr=.39-.22*u;
      const yy=-.10-(1-f)*1.04*u*u+.09*Math.sin(t*(2.35+f)+u*6.8)*u;
      const zz=.13*Math.sin(t*(2.5+f)-u*7.4)*u;
      for(let j=0;j<=sides;j++){
        const a=TAU*j/sides;sa[offset++]=u*(2.17+1.1*f);sa[offset++]=yy+Math.cos(a)*rr;sa[offset++]=zz+Math.sin(a)*rr;
      }
    }
    sockGeo.attributes.position.needsUpdate=true;sockGeo.computeVertexNormals();weatherRadar.rotation.y=t*.47;radarContact.yaw=weatherRadar.rotation.y;
  }
  updateWind({time:0,dt:0});
  const width=256,hullBytes=new Uint8Array(width*4);
  for(let i=0;i<width;i++){
    const z=(i+.5)/width*252-126,e=section(Math.max(firstZ,Math.min(lastZ,z)));const waterHalf=z<firstZ?Math.max(0,.45+(z-firstZ)*.14):z>lastZ?Math.max(0,e[2]-(z-lastZ)*6):e[2];
    hullBytes[i*4]=Math.round(255*waterHalf/24);hullBytes[i*4+3]=255;
  }
  const hullProfile=new THREE.DataTexture(hullBytes,width,1);hullProfile.minFilter=THREE.LinearFilter;hullProfile.magFilter=THREE.LinearFilter;hullProfile.needsUpdate=true;
  return {isDeck,obstacleAt,updateWind,hullProfile,seaLevel};
}
