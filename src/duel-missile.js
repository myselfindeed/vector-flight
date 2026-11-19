// The duel supplies the flight path. Only the round and its exhaust are animated here.
function createDuelMissile(T,root,enemy,roundMesh){
  const body=new T.Group(),nose=new T.Vector3(0,0,-1),heading=new T.Vector3();
  body.name=enemy?'敌机飞行弹体':'我机飞行弹体';
  roundMesh.traverse(part=>{part.castShadow=false;});
  body.add(roundMesh);root.add(body);

  // Both shells use the same warm exhaust. Its brightest part sits inside the nozzle.
  function flame(color,opacity,radius,length){
    const geo=new T.ConeGeometry(radius,length,12,1,true);
    geo.rotateX(Math.PI/2);geo.translate(0,0,length*.5);
    const mat=new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,side:T.DoubleSide});
    mat.forceSinglePass=true;
    return new T.Mesh(geo,mat);
  }
  const jet=new T.Group();
  jet.position.z=1.235;
  const sheath=flame(0xff9947,.43,.14,2.45),core=flame(0xffefd0,.95,.095,1.10);
  sheath.renderOrder=7;core.renderOrder=8;jet.add(sheath,core);body.add(jet);
  const glowGeo=new T.BufferGeometry();glowGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,.12],3));
  const viewport=new T.Vector4(),glowMat=new T.ShaderMaterial({
    uniforms:{height:{value:720},power:{value:0}},transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`
      uniform float height;
      void main(){
        vec4 eye=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(.54*height*projectionMatrix[1][1]/max(.08,-eye.z),3.,52.);
      }`,
    fragmentShader:`
      uniform float power;
      void main(){
        float r=length(gl_PointCoord*2.-1.),hot=exp(-24.*r*r),halo=1.-smoothstep(0.,1.,r);
        gl_FragColor=vec4(mix(vec3(1.,.36,.06),vec3(1.,.96,.73),hot),(hot+.55*(1.-hot)*halo*halo)*power);
        #include <colorspace_fragment>
      }`
  });
  const glow=new T.Points(glowGeo,glowMat);glow.renderOrder=8;
  glow.onBeforeRender=r=>{glowMat.uniforms.height.value=r.getCurrentViewport(viewport).w;};
  jet.add(glow);

  // Sample the visible nozzle in the scene, so old smoke stays behind during turns.
  const smokeLife=1.22,interval=1/58,capacity=Math.ceil(smokeLife/interval)+3,rows=capacity+1;
  const samples=new Float32Array(capacity*3),births=new Float32Array(capacity);
  const points=new Float32Array(rows*6),directions=new Float32Array(rows*6),stamps=new Float32Array(rows*4);
  const geo=new T.BufferGeometry(),index=[];
  function dynamic(name,array,components){
    geo.setAttribute(name,new T.BufferAttribute(array,components).setUsage(T.DynamicDrawUsage));
  }
  dynamic('position',points,3);dynamic('pathTangent',directions,3);dynamic('stamp',stamps,2);
  for(let i=0;i<rows-1;i++){const v=i*2;index.push(v,v+1,v+2,v+1,v+3,v+2);}
  geo.setIndex(index);geo.setDrawRange(0,0);
  const smokeMat=new T.ShaderMaterial({
    uniforms:{clock:{value:0},height:{value:720},endAt:{value:100}},transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,
    vertexShader:`
      attribute vec3 pathTangent;
      attribute vec2 stamp;
      uniform float clock,height;
      varying float edge,age,along;
      void main(){
        edge=stamp.x;along=stamp.y;age=max(0.,clock-along);
        float swell=1.-exp(-3.*age),wave=sin(along*35.+.55*sin(along*67.));
        vec3 p=position+vec3(.5+.42*wave,.78+.32*cos(along*38.),.13*wave)*age;
        vec4 eye=modelViewMatrix*vec4(p,1.);
        vec3 d=mat3(modelViewMatrix)*pathTangent;
        vec2 tangent=d.xy-d.z*eye.xy/min(-.08,eye.z);
        vec2 normal=vec2(-tangent.y,tangent.x)*inversesqrt(max(.000001,dot(tangent,tangent)));
        float width=(.14+1.00*swell)*(.90+.16*wave*swell);
        eye.xy+=normal*edge*max(width,1.9*max(.08,-eye.z)/(height*projectionMatrix[1][1]));
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`
      uniform float endAt;
      varying float edge,age,along;
      void main(){
        float center=abs(edge+.09*sin(along*45.+edge*3.));
        float opacity=(1.-smoothstep(.06,1.,center))*(1.-smoothstep(.19,${smokeLife},age));
        opacity*=smoothstep(.045,.072,along)*(.60+.10*sin(along*51.+edge*2.));
        opacity*=1.-smoothstep(endAt-.045,endAt,along)*smoothstep(.08,.3,age);
        float light=clamp(.68-.17*edge+.10*cos(along*42.)+.12*age,0.,1.);
        vec3 smoke=mix(vec3(.34,.34,.32),vec3(.88,.86,.81),light);
        gl_FragColor=vec4(smoke,opacity);
        #include <colorspace_fragment>
      }`
  });
  smokeMat.forceSinglePass=true;
  const smoke=new T.Mesh(geo,smokeMat);smoke.name='发动机烟迹';smoke.frustumCulled=false;smoke.renderOrder=5;
  smoke.onBeforeRender=r=>{smokeMat.uniforms.height.value=r.getCurrentViewport(viewport).w;};
  root.add(smoke);
  const prev=new T.Vector3(),tip=new T.Vector3(),sample=new T.Vector3();
  let start=0,count=0,nextSample=0,flightTime=0;
  function pose(position,direction){
    body.position.copy(position);
    if(direction.lengthSq()>1e-8)body.quaternion.setFromUnitVectors(nose,heading.copy(direction).normalize());
  }
  function nozzle(){
    return tip.set(0,0,jet.position.z).applyQuaternion(body.quaternion).add(body.position);
  }
  function append(p,t){
    const slot=(start+count)%capacity;p.toArray(samples,3*slot);births[slot]=t;
    if(count===capacity)start=(start+1)%capacity;else count++;
  }
  function ribbon(){
    if(count===0)return;
    // The final row follows the nozzle between regularly spaced samples.
    for(let i=0;i<=count;i++){
      const slot=(start+i)%capacity,k=i*6,t=i===count?flightTime:births[slot];
      if(i===count)tip.toArray(points,k);else for(let j=0;j<3;j++)points[k+j]=samples[3*slot+j];
      points.copyWithin(k+3,k,k+3);
      const n=i*4;stamps[n]=-1;stamps[n+1]=t;stamps[n+2]=1;stamps[n+3]=t;
    }
    for(let i=0;i<=count;i++){
      const a=Math.max(0,i-1)*6,b=Math.min(count,i+1)*6,k=i*6;
      for(let j=0;j<3;j++)directions[k+j]=directions[k+3+j]=points[b+j]-points[a+j];
    }
    geo.attributes.position.needsUpdate=geo.attributes.pathTangent.needsUpdate=geo.attributes.stamp.needsUpdate=true;
    geo.setDrawRange(0,count*6);smoke.visible=true;
  }
  function reset(){
    body.visible=jet.visible=smoke.visible=false;geo.setDrawRange(0,0);
    start=count=flightTime=0;smokeMat.uniforms.clock.value=0;smokeMat.uniforms.endAt.value=100;
  }
  function launch(position,direction){
    reset();pose(position,direction);prev.copy(nozzle());body.visible=true;nextSample=.045;
  }
  function update(position,direction,dt){
    if(!body.visible)return;
    const before=flightTime;flightTime+=Math.max(0,dt);
    pose(position,direction);nozzle();
    const power=T.MathUtils.smoothstep(flightTime,.035,.095),flicker=.94+.06*Math.sin(flightTime*79.);
    jet.visible=power>.001;jet.scale.z=power*flicker;glowMat.uniforms.power.value=power;
    while(nextSample<flightTime){
      sample.lerpVectors(prev,tip,(nextSample-before)/(flightTime-before));
      append(sample,nextSample);nextSample+=interval;
    }
    ribbon();prev.copy(tip);
  }
  function end(){body.visible=false;smokeMat.uniforms.endAt.value=flightTime;}
  function step(dt){
    if(!body.visible&&!smoke.visible)return;
    smokeMat.uniforms.clock.value+=dt;
    if(!body.visible&&smokeMat.uniforms.clock.value-flightTime>=smokeLife){smoke.visible=false;geo.setDrawRange(0,0);}
  }
  reset();
  return {launch,update,end,step,reset,get visible(){return body.visible||smoke.visible;}};
}
