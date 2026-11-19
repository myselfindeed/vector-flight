// Six sparks fan out behind the aircraft. Each point samples a short stretch of its trail.
function createDuelFlares(T,root){
  const duration=1.15,geometry=new T.BufferGeometry();
  const origins=[],velocities=[],lags=[];
  let lureHead=0;
  for(const side of [-1,1]){
    for(let fan=0;fan<3;fan++){
      if(side===1&&fan===1)lureHead=lags.length;
      for(let tail=0;tail<8;tail++){
        origins.push(side*2.8,-.35,2.1);
        velocities.push(side*(8+5*fan),1.5+fan*3,19-3*fan);
        lags.push(tail*.024);
      }
    }
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(origins,3));
  geometry.setAttribute('velocity',new T.Float32BufferAttribute(velocities,3));
  geometry.setAttribute('lag',new T.Float32BufferAttribute(lags,1));
  const lureOrigin=new T.Vector3().fromBufferAttribute(geometry.attributes.position,lureHead);
  const lureVelocity=new T.Vector3().fromBufferAttribute(geometry.attributes.velocity,lureHead);
  const viewport=new T.Vector4();
  function cloud(name){
    const material=new T.ShaderMaterial({
      uniforms:{age:{value:0},fade:{value:1},viewportHeight:{value:720}},
      depthWrite:false,transparent:true,toneMapped:false,
      vertexShader:`
        attribute vec3 velocity;
        attribute float lag;
        uniform float age,viewportHeight;
        varying float heat;
        void main(){
          float t=max(0.0,age-lag);
          heat=1.0-lag/0.21;
          vec4 world=modelMatrix*vec4(position+velocity*t,1.0);
          world.y-=5.0*t*t;
          vec4 eye=viewMatrix*world;
          gl_Position=projectionMatrix*eye;
          float scale=viewportHeight*projectionMatrix[1][1]/max(0.1,-eye.z);
          gl_PointSize=clamp((0.5+1.0*heat)*scale,2.0,72.0);
          if(lag>age)gl_Position=vec4(2.,2.,2.,1.);
        }`,
      fragmentShader:`
        varying float heat;
        uniform float fade;
        void main(){
          float radius=length(gl_PointCoord*2.0-1.0);
          float alpha=(1.0-smoothstep(0.12,1.0,radius))*(0.2+0.8*heat)*fade;
          if(alpha<0.01)discard;
          float core=(1.0-smoothstep(0.12,0.64,radius))*heat;
          gl_FragColor=vec4(mix(vec3(1.,0.31,0.025),vec3(1.,0.94,0.65),core),alpha);
          #include <colorspace_fragment>
        }`
    });
    const sparks=new T.Points(geometry,material);
    sparks.name=name;sparks.visible=false;sparks.frustumCulled=false;sparks.renderOrder=8;
    sparks.onBeforeRender=renderer=>{material.uniforms.viewportHeight.value=renderer.getCurrentViewport(viewport).w;};
    root.add(sparks);
    return sparks;
  }
  const clouds=[cloud('我机干扰弹'),cloud('敌机干扰弹')];
  function burst(enemy,position,quaternion,target,travelTime=0){
    const sparks=clouds[enemy?1:0],uniforms=sparks.material.uniforms;
    sparks.position.copy(position);
    if(quaternion)sparks.quaternion.copy(quaternion);else sparks.quaternion.identity();
    uniforms.age.value=0;uniforms.fade.value=1;sparks.visible=true;
    if(target){
      // The shader adds its downward arc after transforming the spark into world space.
      sparks.updateWorldMatrix(true,false);
      target.copy(lureOrigin).addScaledVector(lureVelocity,travelTime).applyMatrix4(sparks.matrixWorld);
      target.y-=5*travelTime*travelTime;
    }
  }
  function step(dt){
    for(const sparks of clouds){
      if(!sparks.visible)continue;
      const uniforms=sparks.material.uniforms;
      uniforms.age.value+=dt;
      uniforms.fade.value=Math.min(1,Math.max(0,(duration-uniforms.age.value)/.55));
      sparks.visible=uniforms.age.value<duration;
    }
  }
  function reset(){for(const sparks of clouds)sparks.visible=false;}
  return {burst,step,reset};
}
