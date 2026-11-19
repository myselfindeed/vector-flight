// A second perspective camera, cached between captures so the small monitor can
// stay on during flight without paying for a second full scene every frame.
function createFlightObserver(T, coast){
  const eye=new T.PerspectiveCamera(36,1,.55,60000);
  const target=new T.WebGLRenderTarget(240,135,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});
  target.texture.generateMipmaps=false;
  const screen=new T.Scene(), flat=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:target.texture,depthTest:false,depthWrite:false}));
  quad.frustumCulled=false;screen.add(quad);
  const pos=new T.Vector3(),aim=new T.Vector3(),forward=new T.Vector3(),right=new T.Vector3(),worldUp=new T.Vector3(0,1,0);
  const oldViewport=new T.Vector4(),oldScissor=new T.Vector4();
  const wreckOffsets=[[-23,16,21],[23,16,21],[-23,19,-21],[23,19,-21],[1,42,8]];
  const sightline=new T.Vector3();
  let lastMode="",lastTime=-Infinity,wreckView=0;
  function reset(){lastMode="";lastTime=-Infinity;wreckView=0;}
  function frameWreck(){
    aim.y+=1.5;
    // Keep the same side of the action until terrain or the carrier blocks the view.
    for(let attempt=0;attempt<wreckOffsets.length;attempt++){
      pos.fromArray(wreckOffsets[wreckView]).add(aim);
      pos.y=Math.max(pos.y,coast.groundHeight(pos.x,pos.z)+3);
      let clear=true;
      for(let i=1;i<=10;i++){
        sightline.lerpVectors(aim,pos,i/10);
        const {x,y,z}=sightline;
        if(y<coast.groundHeight(x,z)+.8||coast.obstacleAt(x,y,z,1.4)){clear=false;break;}
      }
      if(clear||attempt===wreckOffsets.length-1)break;
      wreckView=(wreckView+1)%wreckOffsets.length;
    }
    eye.fov=48;
  }
  function render(renderer,scene,jet,s,rival,mode,rect,crashing=false){
    if(rect.w<2||rect.h<2)return;
    const aspect=rect.w/rect.h;
    const w=Math.min(352,Math.max(144,Math.round(rect.w/16)*16)),h=Math.max(70,Math.round(w/aspect));
    const resize=w!==target.width||h!==target.height;
    if(resize)target.setSize(w,h);
    const oldTarget=renderer.getRenderTarget(),oldTest=renderer.getScissorTest(),auto=renderer.autoClear;
    const visible=jet.root.visible,shadow=renderer.shadowMap.needsUpdate;
    renderer.getViewport(oldViewport);renderer.getScissor(oldScissor);
    try{
      if(resize||mode!==lastMode||s.time<lastTime||s.time-lastTime>=1/16){
        const subject=mode==="rival"&&rival?rival:jet.root;
        aim.copy(subject.position);
        if(mode==="tower"){
          pos.set(12.8,12.5,-13.4);
          const distance=pos.distanceTo(aim);
          eye.fov=T.MathUtils.clamp(T.MathUtils.radToDeg(2*Math.atan2(15,Math.max(8,distance))),.45,58);
        }else if(crashing){
          // A level camera holds the tumbling airframe and its impact in the inset.
          frameWreck();
        }else{
          forward.set(0,0,-1).applyQuaternion(subject.quaternion);
          right.crossVectors(forward,worldUp);
          if(right.lengthSq()<.05)right.set(1,0,0).applyQuaternion(subject.quaternion);
          right.normalize();
          const scale=mode==="rival"?.88:1;
          pos.copy(aim).addScaledVector(forward,-18*scale).addScaledVector(right,10*scale);
          pos.y=Math.max(aim.y+3.7*scale,pos.y+3.2,coast.groundHeight(pos.x,pos.z)+1);
          aim.addScaledVector(forward,1.1);eye.fov=39;
        }
        eye.position.copy(pos);eye.up.copy(worldUp);eye.lookAt(aim);eye.aspect=aspect;eye.updateProjectionMatrix();
        jet.root.visible=s.phase!=="crashed";renderer.shadowMap.needsUpdate=false;
        renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.autoClear=true;
        renderer.render(scene,eye);lastMode=mode;lastTime=s.time;
      }
      renderer.setRenderTarget(oldTarget);
      renderer.setScissorTest(true);renderer.setScissor(rect.x,rect.y,rect.w,rect.h);renderer.setViewport(rect.x,rect.y,rect.w,rect.h);
      renderer.autoClear=false;renderer.shadowMap.needsUpdate=false;renderer.render(screen,flat);
    }finally{
      jet.root.visible=visible;renderer.autoClear=auto;renderer.shadowMap.needsUpdate=shadow;
      renderer.setRenderTarget(oldTarget);renderer.setViewport(oldViewport);renderer.setScissor(oldScissor);renderer.setScissorTest(oldTest);
    }
  }
  return {render,reset};
}
