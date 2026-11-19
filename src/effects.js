// One instanced draw per burst. Billows cool from the inside out while thin
// streaks carry the initial outward motion past the edge of the cloud.
function createFlightBursts(T,group) {
  const quad=new T.PlaneGeometry(2,2),geometry=new T.InstancedBufferGeometry();
  geometry.setIndex(quad.index);geometry.setAttribute('position',quad.attributes.position);
  const seeds=[],kinds=[];
  function layer(count,kind){
    for(let i=0;i<count;i++){
      const az=i*2.39996+kind*1.7,y=2*(i+.5)/count-1,r=Math.sqrt(1-y*y);
      seeds.push(Math.cos(az)*r,y,Math.sin(az)*r,(.29+i*.61803)%1);kinds.push(kind);
    }
  }
  layer(12,0);layer(20,1);layer(1,2);
  geometry.setAttribute('birth',new T.InstancedBufferAttribute(new Float32Array(seeds),4));
  geometry.setAttribute('kind',new T.InstancedBufferAttribute(new Float32Array(kinds),1));
  geometry.instanceCount=kinds.length;
  const pixels=new Uint8Array(32*32*4);
  let seed=1823;
  for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24;}
  const noise=new T.DataTexture(pixels,32,32);
  noise.wrapS=noise.wrapT=T.RepeatWrapping;noise.minFilter=noise.magFilter=T.LinearFilter;noise.needsUpdate=true;
  const vertexShader=`
    uniform float age,turn,air,wet;
    uniform vec3 carry,wind;
    attribute vec4 birth;attribute float kind;
    varying vec2 q;varying float mode,t,s,fade;
    void main(){
      q=position.xy;mode=kind;s=birth.w;t=age;
      vec3 d=birth.xyz;
      d.xz=mat2(cos(turn),sin(turn),-sin(turn),cos(turn))*d.xz;
      d.y=mix(.16+.86*abs(d.y),d.y,air);
      vec3 drift=carry*(1.-exp(-2.8*age))+.48*wind*age*(1.-exp(-age));
      vec3 p=drift;
      float radius=1.;vec2 aspect=vec2(1.);
      if(kind<.5){
        t=age-s*.10;
        float a=max(t,0.),spread=1.-exp(-3.4*a);
        p+=d*spread*mix(3.7+s*2.8,2.4+s*2.6,wet);
        p.y+=a*(1.75+s*.65);
        radius=(1.2+4.2*spread+a*.8)*(.66+.45*s)*mix(1.,.76,wet);
        fade=smoothstep(-.03,.10,t)*(1.-smoothstep(.67+s*.42,2.35+s*.57,t));
        if(wet>.5){
          float jet=smoothstep(.19,.72,s);
          p.xz+=d.xz*spread*(3.2-1.5*jet);
          p.y=.24+jet*max(0.,(9.+4.6*s)*a-6.7*a*a);
          aspect=mix(vec2(1.38,.35),vec2(.51,1.58),jet);
          fade*=1.-smoothstep(.85+s*.23,1.95+s*.24,t);
        }
      }else if(kind<1.5){
        float speed=14.+s*24.;
        vec3 launch=d*speed;
        launch.y+=wet*(4.+s*6.);
        float trail=max(0.,age-.045-.045*s);
        p+=launch*(1.-exp(-1.7*age))*.7;
        p.y-=5.*age*age;
        vec3 tail=drift+launch*(1.-exp(-1.7*trail))*.7;
        tail.y-=5.*trail*trail;
        vec4 headEye=modelViewMatrix*vec4(p,1.),tailEye=modelViewMatrix*vec4(tail,1.);
        vec2 delta=tailEye.xy*headEye.z-headEye.xy*tailEye.z;
        vec2 normal=vec2(-delta.y,delta.x)/max(.001,length(delta));
        vec4 eye=mix(tailEye,headEye,.5+.5*q.x);
        eye.xy+=normal*q.y*(.055+.085*s)*(.52+.48*(.5+.5*q.x))*mix(1.,1.9,wet);
        fade=(1.-smoothstep(.29+s*.35,.68+s*.43,age))*smoothstep(.40,3.,-eye.z);
        gl_Position=projectionMatrix*eye;return;
      }else{
        radius=3.+11.*(1.-exp(-10.*age));
        fade=(1.-smoothstep(.025,.26,age))*(1.-wet);
      }
      vec4 eye=modelViewMatrix*vec4(p,1.);
      fade*=smoothstep(.7,5.5,-eye.z);
      eye.xy+=q*radius*aspect;
      gl_Position=projectionMatrix*eye;
    }`;
  const fragmentShader=`
    uniform sampler2D noiseMap;uniform float wet;
    varying vec2 q;varying float mode,t,s,fade;
    void main(){
      if(fade<.003)discard;
      float opacity;vec3 color;
      if(mode<.5){
        float radius=length(q);if(radius>1.)discard;
        vec2 uv=q*2.15+vec2(19.*s+.32*t,11.*s-.76*t);
        float coarse=texture2D(noiseMap,uv/32.).r;
        float fine=texture2D(noiseMap,(uv*2.38+vec2(t*.28,6.))/32.).g;
        float grain=texture2D(noiseMap,(uv*5.1+vec2(3.,t*.25))/32.).b;
        float n=.57*coarse+.29*fine+.14*grain;
        float depth=1.-radius+(n-.5)*.67;
        float body=smoothstep(.10,.33,depth);
        float heat=(1.-smoothstep(.15+s*.13,.77+s*.32,t))*(.15+.71*n+.46*depth);
        vec3 soot=mix(vec3(.043,.047,.054),vec3(.30,.32,.33),clamp(.17+.57*n+.22*q.y,0.,1.));
        vec3 flame=mix(vec3(.62,.085,.009),vec3(1.,.49,.048),smoothstep(.26,.70,heat));
        flame=mix(flame,vec3(1.,.92,.59),smoothstep(.60,.99,heat));
        color=mix(soot,flame,smoothstep(.10,.42,heat));
        vec3 foam=mix(vec3(.29,.43,.48),vec3(.91,.98,.98),clamp(.26+.82*n+.16*q.y,0.,1.));
        color=mix(color,foam,wet);
        opacity=body*fade*mix(.72,.51,wet);
      }else if(mode<1.5){
        opacity=(1.-smoothstep(.4,1.,abs(q.y)))*smoothstep(-1.,-.32,q.x)*fade;
        color=mix(mix(vec3(1.,.19,.014),vec3(1.,.80,.34),smoothstep(-.3,.92,q.x)),vec3(.82,.97,1.),wet);
      }else{
        float r=length(q);opacity=(.30*exp(-4.*r*r)+.70*exp(-32.*r*r))*fade*(1.-smoothstep(.85,1.,r));
        color=mix(vec3(1.,.37,.045),vec3(1.,.97,.80),exp(-7.*r*r));
      }
      if(opacity<.008)discard;
      gl_FragColor=vec4(color,opacity);
      #include <colorspace_fragment>
    }`;
  const pool=Array.from({length:3},()=>{
    const uniforms={age:{value:0},turn:{value:0},air:{value:0},wet:{value:0},
      carry:{value:new T.Vector3()},wind:{value:new T.Vector3()},noiseMap:{value:noise}};
    const material=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthWrite:false,toneMapped:false});
    const mesh=new T.Mesh(geometry,material);mesh.name='Fireball and spray';mesh.renderOrder=7;
    mesh.frustumCulled=false;mesh.visible=false;group.add(mesh);return mesh;
  });
  let next=0;
  function burst(pos,air,wet,windX,windZ,velocity){
    const mesh=pool[next++%pool.length],u=mesh.material.uniforms;
    mesh.position.copy(pos);mesh.visible=true;u.age.value=0;u.turn.value=Math.random()*2*Math.PI;
    u.air.value=Number(air);u.wet.value=Number(wet);u.wind.value.set(windX,0,windZ);
    if(velocity)u.carry.value.copy(velocity).multiplyScalar(.10).clampLength(0,9);
    else u.carry.value.set(0,0,0);
  }
  function update(dt){
    let active=0;
    for(const mesh of pool){
      if(!mesh.visible)continue;
      const age=mesh.material.uniforms.age;age.value+=dt;
      mesh.visible=age.value<2.93;if(mesh.visible)active++;
    }
    return active;
  }
  function reset(){for(const mesh of pool)mesh.visible=false;next=0;}
  return {burst,update,reset};
}

// Short-lived visual feedback for the game world's water, breakable markers and airframe.
function createRangeEffects(THREE, scene) {
  const group=new THREE.Group();
  group.name='Range event effects';group.visible=false;scene.add(group);
  const clouds=createFlightBursts(THREE,group);
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
        vec3 color=tint;
        if(info.z>.5&&info.z<1.5)shape=1.-smoothstep(.16,1.,length(q*vec2(1.02,1.45)));
        if(info.z>1.5&&info.z<2.5)shape=1.-smoothstep(.03,.98,length(q*vec2(1.15,.82)));
        if(info.z>2.5){
          float folds=.5+.5*sin(q.x*7.4+info.w+sin(q.y*8.4-info.w));
          shape=1.-smoothstep(.28,.90,radius+.13*(folds-.5));
          float heat=smoothstep(.48,.84,info.y)*smoothstep(.03,.85,shape+.19*folds);
          color=mix(tint*(.69+.55*folds),mix(vec3(.91,.15,.012),vec3(1.,.65,.10),folds),heat);
        }
        float opacity=shape*info.y;
        if(opacity<.006)discard;
        gl_FragColor=vec4(color,opacity);
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
  function trail(pos,windX=0,windZ=0,burning=true){
    if(!pos)return;
    group.visible=true;
    if(burning){
      emit(pos,3,windX,windZ,.78,1.1,2.7,5.4,2.05,0x53575b,-Infinity);
      emit(pos,1,windX,windZ,.79,3.7,3.,.42,.63,0xffc05e,-Infinity);
    }else{
      emit(pos,0,windX,windZ,.38,.43,1.2,2.5,1.15,0x727579,-Infinity);
    }
    atPos.needsUpdate=atInfo.needsUpdate=atColor.needsUpdate=true;
  }
  function burst(pos,type,windX=0,windZ=0,velocity=null){
    if(!pos)return;
    const water=type==='water'||type==='splash',hit=type==='hit'||type==='target',air=type==='knockout';
    if(!water&&!hit&&!air&&type!=='crash')return;
    group.visible=true;
    if(!hit)clouds.burst(pos,air,water,windX,windZ,velocity);
    if(water){
      const ring=rings[nextRing++%rings.length];ring.age=0;ring.active=true;ring.size=14;
      ring.mesh.position.set(pos.x,pos.y+.08,pos.z);ring.mesh.scale.setScalar(1.1);ring.mesh.visible=true;ring.mesh.material.uniforms.fade.value=.80;
      for(let i=0;i<35;i++)emit(pos,2,windX,windZ,.95,9.2,13,.49,1.65,i%3?0xc7dbd9:0xe5efeb,pos.y);
      for(let i=0;i<14;i++)emit(pos,0,windX,windZ,.74,2.8,2.4,.9,1.24,i%2?0xb8cccb:0xcdd5ce,pos.y);
    }else{
      const floor=air?-Infinity:pos.y-(hit?3.4:0);
      if(hit)for(let i=0;i<8;i++)emit(pos,0,windX,windZ,.40,1.4,1.7,.8,1.25,i%3?0x686967:0x9c9485,floor);
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
    let alive=clouds.update(dt);
    for(let i=0;i<count;i++){
      const p=particle[i],k=i*4,j=i*3;
      if(p.life<=0)continue;
      p.life=Math.max(0,p.life-dt);const u=1-p.life/p.duration,hot=p.kind===3,puff=p.kind===0||hot,wet=p.kind===2;
      const drag=Math.min(1,(puff?1.26:.37)*dt);
      motion[j]+=(windX*(puff?.82:.13)-motion[j])*drag;
      motion[j+2]+=(windZ*(puff?.82:.13)-motion[j+2])*drag;
      motion[j+1]+=(puff?.43-(motion[j+1]*.36):wet?-12.8:-10.3)*dt;
      positions[j]+=motion[j]*dt;positions[j+1]+=motion[j+1]*dt;positions[j+2]+=motion[j+2]*dt;
      if(!puff&&positions[j+1]<p.floor)p.life=0;
      stats[k]=p.size*(puff?1+u*2.15:1-u*.43);
      stats[k+1]=p.life>0?(puff?(hot?.89:.53)*(1-u)*(1-u):(.88*(1-u))):0;
      if(p.life>0)alive++;
    }
    let drawn=0;
    for(const p of parts){
      if(p.life<=0)continue;p.life=Math.max(0,p.life-dt);if(!p.life)continue;
      p.v.y-=10.1*dt;p.p.addScaledVector(p.v,dt);if(p.p.y<p.floor+.027){p.p.y=p.floor+.027;p.v.y=Math.abs(p.v.y)*.16;p.v.x*=.82;p.v.z*=.82;}
      p.angle.x+=dt*p.spin.x;p.angle.y+=dt*p.spin.y;p.angle.z+=dt*p.spin.z;
      dummy.position.copy(p.p);dummy.rotation.copy(p.angle);
      dummy.scale.copy(p.scale).multiplyScalar(Math.min(1,p.life/.23,(p.duration-p.life)/.12));
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
    group.visible=false;clouds.reset();next=nextPart=nextRing=0;fragments.count=0;
    particle.forEach((p,i)=>{p.life=0;stats[i*4+1]=0;});parts.forEach(p=>{p.life=0;});
    rings.forEach(r=>{r.mesh.visible=r.active=false;});atInfo.needsUpdate=true;
  }
  return {burst,trail,update,reset};
}
