function createWingTrails(THREE, scene) {
  const capacity=48, interval=1/36;
  const group=new THREE.Group();
  group.name='Wingtip condensation';group.visible=false;scene.add(group);
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:`
      attribute vec3 trackDirection;
      attribute vec4 trace; // signed side, width, optical density, age
      varying float edge,density,age;
      void main(){
        vec4 eye=modelViewMatrix*vec4(position,1.);
        vec3 dir=mat3(modelViewMatrix)*trackDirection;
        vec2 screenDir=dir.xy-dir.z*eye.xy/min(-.01,eye.z);
        vec2 normal=vec2(-screenDir.y,screenDir.x);
        normal*=inversesqrt(max(.000001,dot(normal,normal)));
        eye.xy+=normal*trace.x*trace.y;
        edge=trace.x;density=trace.z;age=trace.w;
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`
      varying float edge,density,age;
      void main(){
        float x=abs(edge);
        float core=exp(-9.5*x*x), fringe=1.-smoothstep(.02,1.,x);
        float alpha=density*(.46*core+.54*fringe);
        if(alpha<.003)discard;
        vec3 vapor=mix(vec3(.70,.77,.79),vec3(.93,.94,.92),core*(1.-age*.45));
        gl_FragColor=vec4(vapor,alpha);
        #include <colorspace_fragment>
      }`
  });
  material.forceSinglePass=true;
  const rows=capacity+1;
  function makeStrip(side) {
    const points=new Float32Array(rows*3),vertices=new Float32Array(rows*6);
    const directions=new Float32Array(rows*6),info=new Float32Array(rows*8);
    const indices=new Uint16Array((rows-1)*6);
    for(let i=0;i<rows-1;i++){
      const v=i*2;indices.set([v,v+1,v+2,v+1,v+3,v+2],i*6);
    }
    const geometry=new THREE.BufferGeometry();
    const dynamic=(array,components)=>new THREE.BufferAttribute(array,components).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',dynamic(vertices,3));
    geometry.setAttribute('trackDirection',dynamic(directions,3));
    geometry.setAttribute('trace',dynamic(info,4));
    geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.setDrawRange(0,0);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=side<0?'Port wingtip vortex':'Starboard wingtip vortex';
    mesh.frustumCulled=false;mesh.renderOrder=3;group.add(mesh);
    return {mesh,geometry,points,vertices,directions,info,side,
      history:new Float32Array(capacity*3),tip:new THREE.Vector3(),prior:new THREE.Vector3()};
  }
  const tracks=[makeStrip(-1),makeStrip(1)];
  const birth=new Float64Array(capacity),life=new Float32Array(capacity),level=new Float32Array(capacity);
  const breezeX=new Float32Array(capacity),breezeZ=new Float32Array(capacity);
  const lastCenter=new THREE.Vector3(),center=new THREE.Vector3();
  let clock=0,remainder=0,head=-1,used=0,previousRoll=0,strength=0,tracking=false,lastStateTime=-1;
  function reset(){
    for(const t of tracks)t.geometry.setDrawRange(0,0);
    group.visible=false;tracking=false;used=0;head=-1;remainder=0;strength=0;clock=0;lastStateTime=-1;
  }
  function number(value,fallback=0){return Number.isFinite(value)?value:fallback;}
  function save(fraction,when,duration,windX,windZ){
    head=(head+1)%capacity;used=Math.min(capacity,used+1);
    birth[head]=when;life[head]=duration;level[head]=strength;breezeX[head]=windX;breezeZ[head]=windZ;
    for(const t of tracks){
      const i=head*3, a=t.prior,b=t.tip;
      t.history[i]=a.x+(b.x-a.x)*fraction;t.history[i+1]=a.y+(b.y-a.y)*fraction;t.history[i+2]=a.z+(b.z-a.z)*fraction;
    }
  }
  function strip(t){
    const p=t.points,v=t.vertices,d=t.directions,f=t.info;
    p[0]=t.tip.x;p[1]=t.tip.y;p[2]=t.tip.z;
    let n=1;
    function appearance(row,u,amp,elapsed){
      const width=(.077+.133*amp)+(.17+.18*amp)*u;
      const fade=Math.pow(Math.max(0,1-u),1.45);
      // An attached white thread opens into a broader translucent wisp downstream.
      const wisps=1.-.17*u*(.5+.5*Math.sin((clock-elapsed)*14.+t.side));
      const alpha=amp*fade*wisps*(.83+.17*Math.min(1,elapsed/.09));
      for(let j=0;j<2;j++){
        const k=row*8+j*4;f[k]=j===0?-1:1;f[k+1]=width;f[k+2]=alpha;f[k+3]=u;
      }
    }
    appearance(0,0,strength,0);
    for(let k=0;k<used;k++){
      const idx=(head-k+capacity)%capacity,age=clock-birth[idx],u=Math.min(1,age/life[idx]);
      if(age>.93)break;
      if(age<.0015)continue;
      const j=idx*3,b=n*3,wake=age*(.23+.39*u);
      const swirl=.105*u*u*Math.sin(age*13+birth[idx]*4.8+t.side);
      p[b]=t.history[j]+breezeX[idx]*wake+t.side*swirl;
      p[b+1]=t.history[j+1]-.78*age*age+.059*u*Math.sin(age*10+birth[idx]*2.5);
      p[b+2]=t.history[j+2]+breezeZ[idx]*wake;
      appearance(n,u,level[idx],age);n++;
    }
    let maxAlpha=0;
    for(let i=0;i<n;i++){
      const j=i*3,a=Math.max(0,i-1)*3,b=Math.min(n-1,i+1)*3;
      for(let lane=0;lane<2;lane++){
        const k=i*6+lane*3;
        v[k]=p[j];v[k+1]=p[j+1];v[k+2]=p[j+2];
        d[k]=p[b]-p[a];d[k+1]=p[b+1]-p[a+1];d[k+2]=p[b+2]-p[a+2];
      }
      maxAlpha=Math.max(maxAlpha,f[i*8+2]);
    }
    // Fade the last sampled pair independently of frame timing.
    if(n>2){f[(n-1)*8+2]=0;f[(n-1)*8+6]=0;}
    const seen=n>=2&&maxAlpha>.004;
    t.geometry.setDrawRange(0,seen?(n-1)*6:0);
    if(seen){
      const attrs=t.geometry.attributes;
      attrs.position.needsUpdate=attrs.trackDirection.needsUpdate=attrs.trace.needsUpdate=true;
    }
    return seen;
  }
  function update(s,jetRoot,dt){
    const speed=Math.max(0,number(s.airspeed,number(s.speed)));
    const hover=s.mode==='hover'&&number(s.nozzle)>.48;
    if(s.onGround||s.phase==='parked'||s.phase==='crashed'||s.phase==='liftoff'||hover||speed<11){
      if(tracking)reset();return;
    }
    center.setFromMatrixPosition(jetRoot.matrixWorld);
    const elapsed=Math.max(0,number(dt)),stamp=number(s.time,lastStateTime);
    if(tracking&&(elapsed>.27||stamp<lastStateTime-.01||
       center.distanceToSquared(lastCenter)>Math.pow(Math.max(13,speed*elapsed*2.8+5),2)))reset();
    lastStateTime=stamp;clock+=Math.min(.17,elapsed);
    const roll=number(s.roll);
    for(const t of tracks)t.tip.set(t.side*5.30,.13,2.22).applyMatrix4(jetRoot.matrixWorld);
    if(!tracking){for(const t of tracks)t.prior.copy(t.tip);previousRoll=roll;tracking=true;}
    const rate=elapsed>.001?Math.abs(Math.atan2(Math.sin(roll-previousRoll),Math.cos(roll-previousRoll)))/elapsed:0;
    const humidity=number(s.humidity,.78),wet=THREE.MathUtils.smoothstep(humidity>1?humidity/100:humidity,.28,.94);
    const speedGain=THREE.MathUtils.smoothstep(speed,24,76);
    const load=Math.max(0,Math.abs(number(s.loadFactor,1))-1);
    const pull=Math.min(1,.49*load+.22*Math.min(2.3,rate)+.15*Math.abs(Math.sin(roll))+(s.maneuver ? 0.23 : 0));
    const target=speedGain*wet*(.013+.67*pull);
    strength+=(target-strength)*(1-Math.exp(-Math.min(.17,elapsed)*(target>strength?10:5.3)));
    const duration=THREE.MathUtils.clamp((7+39*Math.min(1,pull)) / Math.max(14,speed),.13,.92);
    if(elapsed>0){
      const span=Math.min(.17,elapsed);
      remainder+=span;
      while(remainder>=interval){
        remainder-=interval;
        save(THREE.MathUtils.clamp(1-remainder/span,0,1),clock-remainder,duration,number(s.windX),number(s.windZ));
      }
    }
    let seen=false;for(const t of tracks){seen=strip(t)||seen;t.prior.copy(t.tip);}
    group.visible=seen;previousRoll=roll;lastCenter.copy(center);
  }
  return {update,reset};
}
