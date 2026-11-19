// Short-lived visual feedback for the game world's water, breakable markers and airframe.
function createRangeEffects(THREE, scene) {
  const group=new THREE.Group();
  group.name='Range event effects';group.visible=false;scene.add(group);
  const count=192;
  const positions=new Float32Array(count*3),motion=new Float32Array(count*3);
  const stats=new Float32Array(count*4),colors=new Float32Array(count*3);
  const particle=Array.from({length:count},()=>({life:0,duration:0,size:0,kind:0}));
  const geo=new THREE.BufferGeometry();
  function attribute(name,array,size) {
    const attr=new THREE.BufferAttribute(array,size);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name,attr);
    return attr;
  }
  const atPos=attribute('position',positions,3),atInfo=attribute('eventInfo',stats,4),atColor=attribute('eventColor',colors,3);
  const pixelScale={value:500},viewport=new THREE.Vector4();
  const sprites=new THREE.Points(geo,new THREE.ShaderMaterial({
    uniforms:{pixelScale},transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`
      attribute vec4 eventInfo;
      attribute vec3 eventColor;
      uniform float pixelScale;
      varying vec4 info;
      varying vec3 tint;
      void main(){
        info=eventInfo;tint=eventColor;
        if(info.y<=0.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
        vec4 eye=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(info.x*pixelScale*projectionMatrix[1][1]/max(.1,-eye.z),1.,104.);
      }`,
    fragmentShader:`
      varying vec4 info;varying vec3 tint;
      void main(){
        vec2 q=gl_PointCoord*2.-1.;
        float a=atan(q.y,q.x+.00001);
        float radius=length(q);
        float contour=.82+.074*sin(4.*a+info.w)+.044*cos(7.*a-info.w);
        float shape=1.-smoothstep(.13,contour,radius);
        if(info.z>.5&&info.z<1.5)shape=1.-smoothstep(.16,1.,length(q*vec2(1.02,1.45)));
        if(info.z>1.5)shape=1.-smoothstep(.03,.98,length(q*vec2(1.15,.82)));
        float opacity=shape*info.y;
        if(opacity<.006)discard;
        gl_FragColor=vec4(tint,opacity);
        #include <colorspace_fragment>
      }`
  }));
  sprites.frustumCulled=false;sprites.renderOrder=8;
  sprites.onBeforeRender=renderer=>{renderer.getCurrentViewport(viewport);pixelScale.value=.5*viewport.w;};
  group.add(sprites);

  const parts=Array.from({length:26},()=>({life:0,duration:0,p:new THREE.Vector3(),v:new THREE.Vector3(),spin:new THREE.Vector3(),angle:new THREE.Euler(),scale:new THREE.Vector3()}));
  const fragments=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1,0),new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.76,metalness:.18,flatShading:true
  }),parts.length);
  fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fragments.frustumCulled=false;fragments.count=0;group.add(fragments);
  const dummy=new THREE.Object3D(),shade=new THREE.Color();
  const rings=Array.from({length:5},()=>{
    const material=new THREE.ShaderMaterial({
      uniforms:{fade:{value:1}},side:THREE.DoubleSide,transparent:true,depthWrite:false,toneMapped:false,
      vertexShader:`varying vec2 q;void main(){q=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float fade;varying vec2 q;
        void main(){
          float angle=atan(q.y,q.x+.00001);
          float r=length(q)+.012*sin(angle*8.)+.006*sin(angle*15.+1.);
          float ring=1.-smoothstep(.012,.076,abs(r-.85));
          float inner=(1.-smoothstep(.016,.100,abs(r-.57)))*.29;
          float alpha=(ring+inner)*fade*(.77+.19*sin(angle*5.+r*19.));
          if(alpha<.006)discard;
          gl_FragColor=vec4(.54,.70,.72,alpha);
          #include <colorspace_fragment>
        }`
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
    mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.renderOrder=7;group.add(mesh);
    return {mesh,age:0,active:false,size:0};
  });

  let next=0,nextPart=0,nextRing=0;
  function emit(pos,kind,wx,wz,spread,speed,up,size,life,color,floor) {
    const i=next++%count,j=i*3,k=i*4,p=particle[i],angle=Math.random()*Math.PI*2;
    const radius=spread*Math.sqrt(Math.random()),side=speed*(.32+.68*Math.random());
    positions[j]=pos.x+Math.cos(angle)*radius;positions[j+1]=pos.y+.08+Math.random()*spread*.22;
    positions[j+2]=pos.z+Math.sin(angle)*radius;
    motion[j]=Math.cos(angle)*side+wx*.16;motion[j+1]=up*(.48+Math.random()*.62);motion[j+2]=Math.sin(angle)*side+wz*.16;
    p.life=p.duration=life*(.72+.54*Math.random());p.size=size*(.66+.58*Math.random());p.kind=kind;p.floor=floor;
    stats[k]=p.size;stats[k+1]=kind===0?.44:.95;stats[k+2]=kind;stats[k+3]=Math.random()*9;
    shade.setHex(color);colors[j]=shade.r;colors[j+1]=shade.g;colors[j+2]=shade.b;
  }
  function burst(pos,type,windX=0,windZ=0){
    if(!pos)return;
    const water=type==='water'||type==='splash',hit=type==='hit'||type==='target';
    if(!water&&!hit&&type!=='crash')return;
    group.visible=true;
    if(water){
      const ring=rings[nextRing++%rings.length];ring.age=0;ring.active=true;ring.size=6.4;
      ring.mesh.position.set(pos.x,pos.y+.08,pos.z);ring.mesh.scale.setScalar(1.1);ring.mesh.visible=true;ring.mesh.material.uniforms.fade.value=.80;
      for(let i=0;i<35;i++)emit(pos,2,windX,windZ,.57,4.8,7,.29,1.18,i%3?0xc7dbd9:0xe5efeb,pos.y);
      for(let i=0;i<14;i++)emit(pos,0,windX,windZ,.74,2.8,2.4,.9,1.24,i%2?0xb8cccb:0xcdd5ce,pos.y);
    }else{
      const n=hit?8:15, floor=pos.y-(hit?3.4:0);
      for(let i=0;i<n;i++)emit(pos,0,windX,windZ,hit?.40:.90,hit?1.4:3.1,hit?1.7:3.3,hit?.8:1.52,hit?1.25:3.35,i%3?0x686967:0x9c9485,floor);
      for(let i=0;i<(hit?13:25);i++)emit(pos,1,windX,windZ,hit?.18:.55,hit?5.6:8.5,hit?3.0:4.3,hit?.13:.18,hit?.48:.76,i%3?0xe5ae64:0xf4cd84,floor);
      for(let i=0;i<(hit?4:11);i++){
        const p=parts[nextPart++%parts.length],a=Math.random()*Math.PI*2,side=(hit?3.1:6.1)*(.3+Math.random());
        p.life=p.duration=(hit?.85:1.65)*(.65+.61*Math.random());
        p.p.set(pos.x,pos.y+.13,pos.z);p.v.set(Math.cos(a)*side,2.5+Math.random()*(hit?2.5:4.3),Math.sin(a)*side);
        p.angle.set(Math.random()*4,a,Math.random()*2);p.spin.set(Math.random()*7-3.5,Math.random()*8-4,Math.random()*7-3.5);
        const width=(hit?.20:.43)*(.55+Math.random());
        p.scale.set(width,.28*width,(.72+Math.random())*width);p.floor=floor;p.color=i%4===0?0x958579:0x626a6c;
      }
    }
    atPos.needsUpdate=atInfo.needsUpdate=atColor.needsUpdate=true;
  }
  function update(dt,windX=0,windZ=0){
    if(!group.visible)return;
    dt=Math.max(0,Math.min(.12,dt||0));
    let alive=0;
    for(let i=0;i<count;i++){
      const p=particle[i],k=i*4,j=i*3;
      if(p.life<=0)continue;
      p.life=Math.max(0,p.life-dt);const u=1-p.life/p.duration,puff=p.kind===0,wet=p.kind===2;
      const drag=Math.min(1,(puff?1.26:.37)*dt);
      motion[j]+=(windX*(puff?.82:.13)-motion[j])*drag;
      motion[j+2]+=(windZ*(puff?.82:.13)-motion[j+2])*drag;
      motion[j+1]+=(puff?.43-(motion[j+1]*.36):wet?-12.8:-10.3)*dt;
      positions[j]+=motion[j]*dt;positions[j+1]+=motion[j+1]*dt;positions[j+2]+=motion[j+2]*dt;
      if(!puff&&positions[j+1]<p.floor)p.life=0;
      stats[k]=p.size*(puff?1+u*2.15:1-u*.43);
      stats[k+1]=p.life>0?(puff?.53*(1-u)*(1-u):(.88*(1-u))):0;
      if(p.life>0)alive++;
    }
    let drawn=0;
    for(const p of parts){
      if(p.life<=0)continue;p.life=Math.max(0,p.life-dt);if(!p.life)continue;
      p.v.y-=10.1*dt;p.p.addScaledVector(p.v,dt);if(p.p.y<p.floor+.027){p.p.y=p.floor+.027;p.v.y=Math.abs(p.v.y)*.16;p.v.x*=.82;p.v.z*=.82;}
      p.angle.x+=dt*p.spin.x;p.angle.y+=dt*p.spin.y;p.angle.z+=dt*p.spin.z;
      dummy.position.copy(p.p);dummy.rotation.copy(p.angle);dummy.scale.copy(p.scale).multiplyScalar(Math.min(1,p.life/.23));
      dummy.updateMatrix();fragments.setMatrixAt(drawn,dummy.matrix);fragments.setColorAt(drawn,shade.setHex(p.color));drawn++;
    }
    fragments.count=drawn;
    if(drawn){fragments.instanceMatrix.needsUpdate=true;fragments.instanceColor.needsUpdate=true;}
    alive+=drawn;
    for(const ring of rings){
      if(!ring.active)continue;
      ring.age+=dt;const u=Math.min(1,ring.age/2.35);
      ring.mesh.scale.setScalar(1.12+ring.size*(1-(1-u)*(1-u)));
      ring.mesh.material.uniforms.fade.value=.75*(1-u)*(1-u);
      ring.active=u<1;ring.mesh.visible=ring.active;if(ring.active)alive++;
    }
    atInfo.needsUpdate=atPos.needsUpdate=true;
    group.visible=alive>0;
  }
  function reset(){
    group.visible=false;next=nextPart=nextRing=0;fragments.count=0;
    particle.forEach((p,i)=>{p.life=0;stats[i*4+1]=0;});parts.forEach(p=>{p.life=0;});
    rings.forEach(r=>{r.mesh.visible=r.active=false;});atInfo.needsUpdate=true;
  }
  return {burst,update,reset};
}
