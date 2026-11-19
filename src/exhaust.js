// The near-field plume follows thrust and nozzle pose. Its outer flow refracts the background.
function createExhaust(THREE, nozzleExit) {
  let active = false;
  const heatScene = new THREE.Scene();
  const uniforms = {
    image: {value:null}, capture: {value:new THREE.Vector4()},
    motion: {value:new THREE.DataTexture()}, clock: {value:0}, strength: {value:0},
    lengthM: {value:1}, freeLength: {value:1}, deck: {value:new THREE.Vector4(0,1,0,1000)},
    bend:{value:new THREE.Vector2()}, groundWind:{value:new THREE.Vector2()}, groundPower:{value:0},
    ceramic:{value:new THREE.Vector3()}, boost:{value:0},
    plume:{value:new THREE.Vector3()} // emission strength, free length, ground-clipped length
  };
  const size = 64;
  const pixels = new Uint8Array(size*size*4);
  let noiseSeed = 24197;
  for (let i=0; i<pixels.length; i+=4) {
    for (let c=0;c<3;c++) {
      noiseSeed = (Math.imul(1664525,noiseSeed)+1013904223)>>>0;
      pixels[i+c] = noiseSeed>>>24;
    }
    pixels[i+3]=255;
  }
  const noise = uniforms.motion.value;
  noise.image = {data:pixels,width:size,height:size};
  noise.format=THREE.RGBAFormat;
  noise.wrapS=noise.wrapT=THREE.RepeatWrapping;
  noise.minFilter=noise.magFilter=THREE.LinearFilter;
  noise.needsUpdate=true;

  const hazeMaterial = new THREE.ShaderMaterial({
    uniforms, transparent:true, depthWrite:false, toneMapped:false, side:THREE.DoubleSide,
    vertexShader:`
      uniform float lengthM;
      varying vec3 localPos, eye;
      void main(){
        localPos=vec3(position.xy*1.31,position.z*lengthM);
        vec3 offset=-modelViewMatrix[3].xyz;
        eye=vec3(dot(offset,modelViewMatrix[0].xyz),dot(offset,modelViewMatrix[1].xyz),dot(offset,modelViewMatrix[2].xyz));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(localPos,1.);
      }`,
    fragmentShader:`
      uniform sampler2D image,motion;
      uniform vec4 capture,deck;
      uniform vec2 bend;
      uniform float strength,clock,lengthM,freeLength;
      varying vec3 localPos,eye;
      void main(){
        vec3 lo=vec3(-1.31,-1.31,0.),hi=vec3(1.31,1.31,lengthM);
        bool inside=all(greaterThanEqual(eye,lo))&&all(lessThanEqual(eye,hi));
        if(inside==gl_FrontFacing)discard;
        vec3 dir=normalize(localPos-eye);
        vec3 safeDir=mix(vec3(-1.),vec3(1.),step(vec3(0.),dir))*max(abs(dir),vec3(.00005));
        vec3 a=(lo-eye)/safeDir,b=(hi-eye)/safeDir;
        vec3 nearEdges=min(a,b),farEdges=max(a,b);
        float front=max(0.,max(nearEdges.x,max(nearEdges.y,nearEdges.z)));
        float back=min(farEdges.x,min(farEdges.y,farEdges.z));
        if(back<=front)discard;
        float stride=(back-front)/7.;
        vec3 p=eye+dir*(front+stride*.50);
        vec2 displacement=vec2(0.);
        for(int i=0;i<7;i++){
          float s=clamp(p.z/freeLength,0.,1.);
          vec2 axis=s*s*(bend+.11*vec2(sin(p.z*2.5-clock*2.),cos(p.z*2.1-clock*1.8)));
          vec2 xy=p.xy-axis;
          float r=length(xy)/(.30+.34*s);
          float mask=(1.-smoothstep(.35,1.53,r))*smoothstep(.025,.28,p.z)
                    *(1.-smoothstep(.43,1.,s))*smoothstep(.015,.18,dot(deck,vec4(p,1.)));
          vec2 samplePoint=vec2(p.z*2.1-clock*2.45+dot(xy,vec2(1.24,-1.8)),
                                p.z*.62+clock*.33+dot(xy,vec2(2.1,1.7)));
          vec2 coarse=texture2D(motion, samplePoint/64.).rg*2.-1.;
          vec2 fine=texture2D(motion,(samplePoint*2.05+vec2(clock*.72,-clock*.17)+21.6)/64.).gb*2.-1.;
          displacement+=mask*stride*(coarse*.82+fine*.38);
          p+=dir*stride;
        }
        // The capture already holds display-encoded pixels; leave their colour unchanged.
        vec2 shift=clamp(displacement,-1.35,1.35)*strength;
        if(dot(shift,shift)<.0009)discard;
        vec2 uv=clamp(gl_FragCoord.xy-capture.xy+shift,vec2(.52),capture.zw-vec2(.52))/capture.zw;
        gl_FragColor=vec4(texture2D(image,uv).rgb,1.);
      }`
  });
  hazeMaterial.forceSinglePass=true;
  const box=new THREE.BoxGeometry(2,2,1);
  box.translate(0,0,.5);
  const heat=new THREE.Mesh(box,hazeMaterial);
  heat.name='Daylight heat shimmer';
  heat.renderOrder=2;
  heat.matrixAutoUpdate=false;
  heat.frustumCulled=false;
  heat.layers.enableAll();
  heatScene.add(heat);

  const washMaterial=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`
      varying vec2 q;
      void main(){q=vec2(position.x,position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform sampler2D image,motion;uniform vec4 capture;uniform vec2 groundWind;
      uniform float clock,groundPower,strength;varying vec2 q;
      void main(){
        float radius=length(q);
        vec2 radial=q/max(.01,radius);
        float downstream=dot(radial,groundWind);
        float edge=1.-smoothstep(.34,.79+.13*downstream,radius);
        vec2 flow=radial*.62+groundWind*.38;
        vec2 n=texture2D(motion,(q*10.-flow*clock*2.8+vec2(13.,39.))/64.).rg*2.-1.;
        float wave=.65+.35*sin(radius*22.-clock*5.+n.x*2.3);
        vec2 shift=edge*smoothstep(.055,.25,radius)*groundPower*min(1.63,strength)*wave*(n*.81+flow*.15);
        if(dot(shift,shift)<.0016)discard;
        vec2 uv=clamp(gl_FragCoord.xy-capture.xy+shift,vec2(.52),capture.zw-vec2(.52))/capture.zw;
        gl_FragColor=vec4(texture2D(image,uv).rgb,1.);
      }`
  });
  const washGeometry=new THREE.PlaneGeometry(2,2);
  washGeometry.rotateX(-Math.PI/2);
  const wash=new THREE.Mesh(washGeometry,washMaterial);
  wash.name='Ground-hugging displaced air';wash.visible=false;wash.frustumCulled=false;wash.renderOrder=1;
  heatScene.add(wash);

  const ceramicMaterial=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`varying vec2 q;void main(){q=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 ceramic;varying vec2 q;
      void main(){
        float radius=length(q),rib=.68+.32*cos(18.*atan(q.y,q.x+.00001)+radius*1.8);
        float tile=exp(-24.*(radius-.71)*(radius-.71))*rib;
        float ember=ceramic.x*(.30*exp(-4.*radius*radius)+.67*tile);
        float blue=ceramic.y*exp(-38.*(radius-.86)*(radius-.86))*(.56+.44*rib);
        float pearl=ceramic.z*exp(-4.6*radius*radius);
        vec3 color=ember*vec3(.67,.32,.12)+blue*vec3(.21,.36,.71)+pearl*vec3(.91,.71,.45);
        gl_FragColor=vec4(color,(1.-smoothstep(.93,1.,radius))*.70);
      }`
  });
  const inner=new THREE.Mesh(new THREE.CircleGeometry(.354,48),ceramicMaterial);
  inner.position.z=-.511;
  inner.name='Warm inner ceramic';
  inner.renderOrder=4;
  inner.visible=false;
  nozzleExit.add(inner);

  // Recessed inner tiles also catch the changing colour from oblique views.
  const liningGeometry=new THREE.CylinderGeometry(.445,.383,.49,48,1,true);
  liningGeometry.rotateX(Math.PI/2);
  const liningMaterial=new THREE.ShaderMaterial({
    uniforms,side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`varying vec2 tileUV;void main(){tileUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 ceramic;varying vec2 tileUV;
      void main(){
        float seam=abs(fract(tileUV.x*18.)-.5)*2.;
        float interior=(1.-smoothstep(.45,1.,tileUV.y))*(.55+.45*smoothstep(.06,.88,seam));
        vec3 tint=ceramic.x*vec3(.59,.265,.09)+ceramic.y*vec3(.10,.23,.51)+ceramic.z*vec3(.65,.44,.20);
        gl_FragColor=vec4(tint,interior*.63);
      }`
  });
  const lining=new THREE.Mesh(liningGeometry,liningMaterial);
  lining.name='Recessed nozzle tile temperature';lining.position.z=-.26;lining.renderOrder=4;
  lining.visible=false;nozzleExit.add(lining);

  const flameMaterial=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:`
      uniform vec3 plume;varying vec3 localPos,eye;
      void main(){
        localPos=vec3(position.xy*.54,position.z*plume.z);
        vec3 d=-modelViewMatrix[3].xyz;
        eye=vec3(dot(d,modelViewMatrix[0].xyz),dot(d,modelViewMatrix[1].xyz),dot(d,modelViewMatrix[2].xyz));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(localPos,1.);
      }`,
    fragmentShader:`
      uniform float boost,clock;uniform vec2 bend;uniform vec3 plume;uniform vec4 deck;
      uniform sampler2D motion;varying vec3 localPos,eye;
      void main(){
        vec3 lo=vec3(-.54,-.54,0.),hi=vec3(.54,.54,plume.z);
        bool inside=all(greaterThanEqual(eye,lo))&&all(lessThanEqual(eye,hi));
        if(inside==gl_FrontFacing)discard;
        vec3 ray=normalize(localPos-eye);
        vec3 safe=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.00005));
        vec3 a=(lo-eye)/safe,b=(hi-eye)/safe,l=min(a,b),h=max(a,b);
        float start=max(0.,max(l.x,max(l.y,l.z))),stop=min(h.x,min(h.y,h.z));
        if(stop<=start)discard;
        float stride=(stop-start)/12.;vec3 p=eye+ray*(start+stride*.5);
        float body=0.,warm=0.,ice=0.;
        for(int i=0;i<12;i++){
          float z=clamp(p.z/plume.y,0.,1.);
          vec2 xy=p.xy-.13*bend*z*z;
          vec2 noise=texture2D(motion,vec2(p.z*4.6-clock*3.27+xy.x*4.1,23.+xy.y*4.9+p.z*1.4)/64.).rg-.5;
          float r=length(xy+noise*(.016+.135*z));
          float width=.365*(1.-.66*z);
          float nr=r/width;
          float shear=.5+.5*sin(6.*atan(xy.y,xy.x+.0001)+p.z*2.7-clock*1.9+noise.y*3.);
          float t=1.-smoothstep(.41,.99,z+.17*noise.x+.11*z*(shear-.5));
          float floorFade=smoothstep(.023,.14,dot(deck,vec4(p,1.)));
          float k=stride*t*floorFade*(1.-smoothstep(.63,1.39,nr));
          body+=k*(.54+.32*noise.y);
          warm+=k*exp(-4.8*nr*nr)*(exp(-3.3*z)+.22*exp(-46.*(z-.41)*(z-.41)));
          ice+=k*exp(-8.*(nr-.67)*(nr-.67))*(.33+.56*shear+.20*noise.x);
          p+=ray*stride;
        }
        float density=body+warm*1.12+ice*.71;
        float opacity=(1.-exp(-3.80*density))*(.10+.80*plume.x)*smoothstep(.012,.18,plume.x);
        if(opacity<.003)discard;
        vec3 bodyTint=mix(vec3(.23,.39,.65),vec3(.27,.44,.76),boost);
        vec3 color=(body*bodyTint+warm*1.12*vec3(1.60,.97,.42)+ice*.71*vec3(.27,.51,.84))/max(.001,density);
        float glow=smoothstep(.08,.64,warm/(.018+body));
        color=mix(color,vec3(1.52,.85,.33),glow*.64);
        opacity+=(1.-opacity)*min(.17,warm*.75)*plume.x;
        gl_FragColor=vec4(color,opacity);
        #include <colorspace_fragment>
      }`
  });
  flameMaterial.forceSinglePass=true;
  const flame=new THREE.Mesh(box,flameMaterial);
  flame.name='Short exhaust plume';flame.renderOrder=5;flame.frustumCulled=false;flame.visible=false;nozzleExit.add(flame);

  let power=0,airDistortion=0;
  const viewport=new THREE.Vector4(),scissor=new THREE.Vector4(),clip=new THREE.Vector4();
  const projector=new THREE.Matrix4(),origin=new THREE.Vector2();
  const captures=new WeakMap();
  let checkedRenderer=null,canCopy=false;
  function update(state) {
    const smooth=THREE.MathUtils.smoothstep;
    const engine = Math.max(0,Math.min(1,state.engine ?? (state.onGround?0:1)));
    power=engine*Math.max(0,Math.min(1,state.thrust||0));
    active=engine>.005&&state.phase!=='crashed';
    inner.visible=lining.visible=active;flame.visible=wash.visible=false;uniforms.boost.value=0;
    if(!active){
      uniforms.groundPower.value=0;uniforms.ceramic.value.set(0,0,0);uniforms.plume.value.set(0,0,0);return;
    }
    const nozzle=state.nozzle||0,vertical=smooth(nozzle,.38,1.29);
    const roll=state.phase==='roll',climb=state.phase==='departure'||(!state.onGround&&(state.vy||0)>3);
    const lifting=state.phase==='liftoff'||vertical>.52;
    const idle=!lifting&&(state.phase==='taxi'||(state.onGround&&!roll));
    const boosted=Math.min(1,Math.max(0,state.boost||0))*smooth(power,.44,.83)*(1-smooth(nozzle,.17,.55));
    uniforms.boost.value=boosted;
    const working=.24*power+.76*smooth(power,.15,.84);
    const phaseGain=idle ? .085 : (roll||climb) ? .97 : lifting ? .90 : .62;
    const phaseReach=idle ? .20 : (roll||climb) ? 1.73 : lifting ? 1.54 : 1.00;
    const emission=Math.min(1,working*phaseGain+.49*boosted);
    const plumeReach=Math.min(2.72,.16+working*phaseReach+1.37*boosted);
    const warm=idle ? .105+.34*power : roll||climb ? .23+.28*power : .059+.072*power;
    uniforms.ceramic.value.set(engine*(warm*(1-.37*vertical)+.10*vertical+.55*boosted),
      engine*((roll||climb ? .18 : .035)+.105*vertical+.43*boosted),boosted*.58);
    airDistortion=idle ? .22+.67*power : .36+.52*power+.53*vertical+.18*Number(roll||climb)+.43*boosted;
    uniforms.clock.value=state.time||0;
    nozzleExit.updateWorldMatrix(true,false);
    heat.matrix.copy(nozzleExit.matrixWorld);heat.matrixWorldNeedsUpdate=true;
    const m=heat.matrix.elements,free=.54+3.9*power+.48*boosted;
    const wx=state.windX||0,wz=state.windZ||0;
    const bend=uniforms.bend.value;
    bend.set(wx*m[0]+wz*m[2],wx*m[4]+wz*m[6]).multiplyScalar(.075*(1-.38*vertical));
    bend.clampLength(0,.68);
    const floor=state.position&&Number.isFinite(state.agl)?state.position.y-state.agl-1.6:-10000;
    const height=m[13]-floor;
    uniforms.deck.value.set(m[1],m[5],m[9],height);
    const limit=m[9]<-.055?(height+.72*Math.hypot(m[1],m[5]))/(-m[9]):free;
    uniforms.lengthM.value=Math.max(.015,Math.min(free,limit));
    uniforms.freeLength.value=free;
    const luminousLimit=m[9]<-.055?(height-.023+.49*Math.hypot(m[1],m[5]))/(-m[9]):plumeReach;
    const luminousLength=Math.max(.001,Math.min(luminousLimit,plumeReach));
    uniforms.plume.value.set(emission,plumeReach,luminousLength);
    flame.visible=emission>.014&&luminousLength>.025;
    const down=-m[9],gap=Math.max(0,height);
    uniforms.groundPower.value=power*vertical*(1-smooth(gap,.7,7.4));
    wash.visible=down>.62&&uniforms.groundPower.value>.028&&height>0;
    if(wash.visible){
      const flight=height/down,wind=uniforms.groundWind.value.set(wx,wz).clampLength(0,9).multiplyScalar(1/9);
      const radius=.95+Math.min(2.35,.82*Math.sqrt(gap+.18)+.65*power);
      wash.position.set(m[12]+m[8]*flight+wind.x*radius*.24,floor+.028,m[14]+m[10]*flight+wind.y*radius*.24);
      wash.scale.set(radius,1,radius);wash.updateMatrixWorld(true);
    }
  }

  function render(renderer,camera) {
    if(!active||uniforms.lengthM.value<.035||renderer.getRenderTarget())return;
    if(checkedRenderer!==renderer){
      checkedRenderer=renderer;
      const gl=renderer.getContext();
      // WebGL disallows copying an RGB-only drawing buffer into an RGBA texture.
      canCopy=gl.getContextAttributes()?.alpha===true && gl.getParameter(gl.ALPHA_BITS)>0;
    }
    if(!canCopy)return;
    renderer.getCurrentViewport(viewport);
    let left=viewport.x,bottom=viewport.y,right=left+viewport.z,top=bottom+viewport.w;
    if(renderer.getScissorTest()){
      renderer.getScissor(scissor).multiplyScalar(renderer.getPixelRatio()).floor();
      left=Math.max(left,scissor.x);bottom=Math.max(bottom,scissor.y);
      right=Math.min(right,scissor.x+scissor.z);top=Math.min(top,scissor.y+scissor.w);
    }
    if(right-left<2||top-bottom<2)return;
    let minX=1,minY=1,maxX=-1,maxY=-1,behind=0,points=0;
    function include(xp,yp,zp){
      clip.set(xp,yp,zp,1).applyMatrix4(projector);points++;
      if(clip.w<=camera.near*.8){behind++;return;}
      const x=clip.x/clip.w,y=clip.y/clip.w;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    if(wash.visible&&camera.layers.test(wash.layers)){
      projector.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(wash.matrixWorld);
      for(let i=0;i<4;i++)include((i&1)?1:-1,0,(i&2)?1:-1);
    }
    projector.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(heat.matrix);
    for(let i=0;i<8;i++)include((i&1)?1.31:-1.31,(i&2)?1.31:-1.31,(i&4)?uniforms.lengthM.value:0);
    if(behind===points)return;
    if(behind){minX=minY=-1;maxX=maxY=1;}
    const px=x=>viewport.x+(x*.5+.5)*viewport.z;
    const py=y=>viewport.y+(y*.5+.5)*viewport.w;
    const x0=Math.max(left,Math.floor(px(minX))-5),x1=Math.min(right,Math.ceil(px(maxX))+5);
    const y0=Math.max(bottom,Math.floor(py(minY))-5),y1=Math.min(top,Math.ceil(py(maxY))+5);
    if(x1<=x0||y1<=y0)return;
    const vw=right-left,vh=top-bottom;
    const needW=Math.min(vw,Math.ceil((x1-x0)/32)*32),needH=Math.min(vh,Math.ceil((y1-y0)/32)*32);
    let tile=captures.get(camera);
    if(tile)tile.oversizedFrames=tile.w*tile.h>needW*needH*3.5?tile.oversizedFrames+1:0;
    const shrink=tile&&tile.oversizedFrames>=36;
    if(!tile||shrink||needW>tile.w||needH>tile.h||tile.w>vw||tile.h>vh){
      const w=Math.min(vw,Math.max(shrink?0:tile?.w||0,needW)),h=Math.min(vh,Math.max(shrink?0:tile?.h||0,needH));
      if(tile)tile.image.dispose();
      const image=new THREE.FramebufferTexture(w,h);
      image.minFilter=image.magFilter=THREE.LinearFilter;
      tile={w,h,image,oversizedFrames:0};captures.set(camera,tile);
    }
    origin.set(Math.max(left,Math.min(right-tile.w,Math.floor((x0+x1-tile.w)/2))),
               Math.max(bottom,Math.min(top-tile.h,Math.floor((y0+y1-tile.h)/2))));
    renderer.copyFramebufferToTexture(origin,tile.image);
    uniforms.image.value=tile.image;
    uniforms.capture.value.set(origin.x,origin.y,tile.w,tile.h);
    clip.set(0,0,0,1).applyMatrix4(projector);
    const outletPixels=viewport.w*camera.projectionMatrix.elements[5]*.39/Math.max(camera.near,clip.w);
    uniforms.strength.value=Math.min(2.8*renderer.getPixelRatio(),outletPixels*.10)*airDistortion;
    const clear=renderer.autoClear;
    const shadowDirty=renderer.shadowMap.needsUpdate;
    renderer.autoClear=false;renderer.shadowMap.needsUpdate=false;
    try{renderer.render(heatScene,camera);}
    finally{renderer.autoClear=clear;renderer.shadowMap.needsUpdate=shadowDirty;}
  }
  return {update,render};
}
