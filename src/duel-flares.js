// Each flare paints a short incandescent ribbon, leaving drifting smoke as it cools.
function createDuelFlares(T,root){
  const burnTime=1.25,smokeLife=.78,duration=burnTime+smokeLife+.14;
  const pointOrigins=[],pointVelocities=[],emissions=[];
  const trailOrigins=[],trailVelocities=[],trailUV=[],indices=[];
  const lureOrigin=new T.Vector3(),lureVelocity=new T.Vector3(),viewport=new T.Vector4();
  for(const side of [-1,1]){
    for(let fan=0;fan<3;fan++){
      const origin=[side*2.8,-.35,2.1],velocity=[side*(8+5*fan),1.5+fan*3,19-3*fan];
      if(side===1&&fan===1){lureOrigin.fromArray(origin);lureVelocity.fromArray(velocity);}
      // The middle starboard flare releases first and remains the visible interception point.
      const delay=[.055,0,.105][fan]+(side<0?.018:0),seed=fan*2.13+side*1.37;
      // A negative emission time marks the glowing head. Other points detach along its path.
      pointOrigins.push(...origin);pointVelocities.push(...velocity);emissions.push(-1,seed,delay);
      for(let sample=0;sample<26;sample++){
        pointOrigins.push(...origin);pointVelocities.push(...velocity);
        emissions.push(sample*.048,seed+sample*2.4,delay);
      }
      const base=trailOrigins.length/3,segments=10;
      for(let row=0;row<=segments;row++){
        for(const edge of [-1,1]){
          trailOrigins.push(...origin);trailVelocities.push(...velocity);trailUV.push(row/segments,edge,delay);
        }
        if(row<segments){
          const v=base+row*2;indices.push(v,v+1,v+2,v+1,v+3,v+2);
        }
      }
    }
  }
  function geometry(origins,velocities,attr,data){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(origins,3));
    g.setAttribute('velocity',new T.Float32BufferAttribute(velocities,3));
    g.setAttribute(attr,new T.Float32BufferAttribute(data,3));
    return g;
  }
  const particles=geometry(pointOrigins,pointVelocities,'emission',emissions);
  const ribbons=geometry(trailOrigins,trailVelocities,'ribbonData',trailUV);
  ribbons.setIndex(indices);

  const pathShader=`
    attribute vec3 velocity;
    uniform float age,viewportHeight;
    vec3 path(float t){
      vec3 p=(modelMatrix*vec4(position+velocity*t,1.)).xyz;
      p.y-=5.*t*t;
      return p;
    }
    float pixelsPerUnit(vec4 eye){
      return .5*viewportHeight*projectionMatrix[1][1]/max(.05,-eye.z);
    }
  `;
  function cloud(name){
    const uniforms={age:{value:0},viewportHeight:{value:720}};
    const settings={uniforms,transparent:true,depthWrite:false,toneMapped:false};
    const ribbonMat=new T.ShaderMaterial({...settings,side:T.DoubleSide,
      vertexShader:pathShader+`
        attribute vec3 ribbonData;
        varying vec2 stroke;
        varying float fade;
        void main(){
          stroke=ribbonData.xy;
          float elapsed=age-ribbonData.z;
          float head=clamp(elapsed,0.,${burnTime}),t=head-min(head,.43)*stroke.x;
          fade=1.-smoothstep(.74,${burnTime},elapsed);
          vec3 p=path(t);
          vec4 eye=viewMatrix*vec4(p,1.);
          vec3 tangent=mat3(viewMatrix)*(path(t+.01)-p);
          vec2 dir=tangent.xy-tangent.z*eye.xy/min(-.05,eye.z);
          vec2 normal=vec2(-dir.y,dir.x)*inversesqrt(max(.0000001,dot(dir,dir)));
          float width=max(.8/pixelsPerUnit(eye),mix(.26,.055,stroke.x));
          eye.xy+=normal*stroke.y*width;
          gl_Position=projectionMatrix*eye;
        }`,
      fragmentShader:`
        varying vec2 stroke;
        varying float fade;
        void main(){
          float edge=abs(stroke.y),tail=1.-stroke.x;
          float alpha=(1.-smoothstep(.20,1.,edge))*pow(tail,.64)*fade;
          vec3 color=mix(vec3(.85,.12,.012),vec3(1.,.78,.37),tail*tail*(1.-edge));
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`
    });
    ribbonMat.forceSinglePass=true;
    const pointMat=new T.ShaderMaterial({...settings,
      vertexShader:pathShader+`
        attribute vec3 emission;
        varying float smokeAge,intensity,seed;
        void main(){
          bool head=emission.x<0.;
          float elapsed=age-emission.z;
          smokeAge=head?-1.:elapsed-emission.x;seed=emission.y;
          float t=head?clamp(elapsed,0.,${burnTime}):emission.x;
          vec3 p=path(t);
          float diameter;
          if(head){
            intensity=(1.-smoothstep(.74,${burnTime},elapsed))*(.94+.06*sin(31.*elapsed+seed));
            diameter=mix(1.,3.5,intensity);
          }else{
            float a=max(0.,smokeAge);
            p+=vec3(.65+sin(seed)*.42,.7+.26*cos(seed),.3*sin(seed+1.))*a;
            intensity=smoothstep(0.,.09,a)*(1.-smoothstep(.22,${smokeLife},a))*
                      (1.-smoothstep(.9,${burnTime},t));
            diameter=(1.05+2.9*a)*(.95+.10*sin(seed));
          }
          vec4 eye=viewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*eye;
          gl_PointSize=clamp(diameter*pixelsPerUnit(eye),head?5.:1.,96.);
          if(elapsed<0.||intensity<.002||(!head&&smokeAge<0.))gl_Position=vec4(2.,2.,2.,1.);
        }`,
      fragmentShader:`
        varying float smokeAge,intensity,seed;
        void main(){
          vec2 uv=gl_PointCoord*2.-1.;
          float r=length(uv);
          vec3 color;float alpha;
          if(smokeAge<0.){
            float hot=exp(-20.*r*r);
            float glow=1.-smoothstep(.16,1.,r);
            color=mix(vec3(1.,.29,.024),vec3(1.,.98,.78),exp(-10.*r*r));
            alpha=(hot+.78*(1.-hot)*glow*glow)*intensity;
          }else{
            float cloud=r+.085*sin(6.*uv.x+seed)*sin(5.*uv.y-seed);
            alpha=.31*intensity*(1.-smoothstep(.14,1.,cloud));
            color=mix(vec3(.28,.25,.24),vec3(.66,.63,.58),clamp(.55-.38*uv.y+.1*sin(seed),0.,1.));
          }
          if(alpha<.005)discard;
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`
    });
    const trail=new T.Mesh(ribbons,ribbonMat),points=new T.Points(particles,pointMat),group=new T.Group();
    trail.renderOrder=7;points.renderOrder=8;
    for(const layer of [trail,points]){
      layer.frustumCulled=false;
      layer.onBeforeRender=renderer=>{uniforms.viewportHeight.value=renderer.getCurrentViewport(viewport).w;};
      group.add(layer);
    }
    group.name=name;group.visible=false;root.add(group);
    return {group,age:uniforms.age};
  }
  const clouds=[cloud('我机干扰弹'),cloud('敌机干扰弹')];
  function burst(enemy,position,quaternion,target,travelTime=0){
    const {group,age}=clouds[enemy?1:0];
    group.position.copy(position);
    if(quaternion)group.quaternion.copy(quaternion);else group.quaternion.identity();
    age.value=0;group.visible=true;
    if(target){
      group.updateWorldMatrix(true,false);
      target.copy(lureOrigin).addScaledVector(lureVelocity,travelTime).applyMatrix4(group.matrixWorld);
      target.y-=5*travelTime*travelTime;
    }
  }
  function step(dt){
    for(const {group,age} of clouds){
      if(!group.visible)continue;
      age.value+=dt;group.visible=age.value<duration;
    }
  }
  function reset(){for(const {group} of clouds)group.visible=false;}
  return {burst,step,reset};
}
