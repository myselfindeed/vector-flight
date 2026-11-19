/* Colour-marked foam props and an animated capsule game for the offshore range. */
function createTrainingRange(T,scene,coast,jet,fx,announce){
  const root=new T.Group();root.name='Offshore practice range';scene.add(root);
  const orange=0xee792f, cream=0xf5e7c6, navy=0x344f5b, grey=0x647676;
  const sq=(x)=>x*x, mix=(a,b,t)=>a+(b-a)*t, tau=2*Math.PI;
  const skin=new T.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.06,side:T.DoubleSide,envMapIntensity:.63});
  const matrix=new T.Object3D(),color=new T.Color();
  // Paint adjacent strips directly into a mesh, avoiding overlaid rings or subpixel markings.
  function paint(){
    const pos=[],norm=[],tint=[];
    function add(g,hex,p=[0,0,0],r=[0,0,0],s=[1,1,1]){
      if(g.index){const previous=g;g=previous.toNonIndexed();previous.dispose();}
      if(!g.attributes.normal)g.computeVertexNormals();
      matrix.position.set(...p);matrix.rotation.set(...r);matrix.scale.set(...s);matrix.updateMatrix();g.applyMatrix4(matrix.matrix);
      const v=g.attributes.position,n=g.attributes.normal;color.setHex(hex);
      for(let j=0;j<v.count;j++){pos.push(v.getX(j),v.getY(j),v.getZ(j));norm.push(n.getX(j),n.getY(j),n.getZ(j));tint.push(color.r,color.g,color.b);}
      g.dispose();
    }
    function finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.setAttribute('color',new T.Float32BufferAttribute(tint,3));
      g.computeBoundingSphere();const m=new T.Mesh(g,skin);m.castShadow=false;return m;}
    return {add,finish};
  }
  function boardModel(){
    const a=paint(), stand=paint(), radii=[0,1.23,2.30,3.42,4.52,5.50,5.72], shades=[orange,cream,orange,cream,orange,navy];
    for(let i=1;i<radii.length;i++){
      for(const face of [-1,1])a.add(new T.RingGeometry(radii[i-1],radii[i],48),shades[i-1],[0,0,face*.21],[0,face<0?Math.PI:0,0]);
    }
    a.add(new T.CylinderGeometry(5.72,5.72,.42,48,1,true),navy,[0,0,0],[Math.PI/2,0,0]);
    for(const s of [-1,1]){
      stand.add(new T.BoxGeometry(.36,6.41,.48),grey,[s*2.35,-4.82,-.50]);
      stand.add(new T.BoxGeometry(.32,4.06,.38),grey,[s*1.17,-5.33,-.52],[0,0,-s*.62]);
      stand.add(new T.BoxGeometry(1.0,.36,1.34),navy,[s*2.35,-7.91,-.50]);
    }
    stand.add(new T.BoxGeometry(5.05,.31,.47),cream,[0,-5.40,-.52]);
    return {face:a.finish(),stand:stand.finish()};
  }
  const board=boardModel();
  const definitions=[['岛上靶 01',-88,-495,.18],['岛上靶 02',92,-805,-.10]];
  const targets=definitions.map(([name,x,z,heading])=>{
    const group=new T.Group(),model=board.face.clone();
    group.name=name;group.add(model,board.stand.clone());root.add(group);
    group.rotation.y=heading;group.position.set(x,coast.groundHeight(x,z)+8.04,z);
    return {name,position:group.position,model,intact:true,reserved:false};
  });

  const traceGeo=new T.ConeGeometry(1,1,9,1,true);traceGeo.rotateX(Math.PI/2);traceGeo.translate(0,0,.5);
  const traceMat=new T.MeshBasicMaterial({color:0xffcb72,transparent:true,opacity:.80,depthWrite:false,side:T.DoubleSide,toneMapped:false});
  const eventRingGeometry=new T.RingGeometry(.85,1,38);
  const chunkGeometry=new T.TetrahedronGeometry(1,0);
  const chunkColors=[orange,cream,navy].map(c=>new T.MeshStandardMaterial({color:c,roughness:.84,metalness:.04}));
  const bursts=targets.map(()=>{
    const g=new T.Group();g.visible=false;root.add(g);
    const mat=new T.MeshBasicMaterial({color:0xffdc91,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    const ring=new T.Mesh(eventRingGeometry,mat);ring.onBeforeRender=(_r,_s,camera)=>ring.quaternion.copy(camera.quaternion);g.add(ring);
    const pieces=Array.from({length:7},(_,j)=>{const m=new T.Mesh(chunkGeometry,chunkColors[j%3]);g.add(m);return m;});
    return {g,ring,pieces,timer:0,active:false};
  });
  const shots=[], nose=new T.Vector3(0,0,-1), pose=new T.Quaternion(), direction=new T.Vector3(), lastPoint=new T.Vector3();
  let index=0,hitCount=0;
  const say=(text,cue)=>{if(announce)announce(text,cue);};
  const available=t=>t&&t.intact&&!t.reserved;
  function selectAfter(after){
    for(let offset=1;offset<=targets.length;offset++){
      const i=(after+offset+targets.length)%targets.length;
      if(available(targets[i])){index=i;return targets[i];}
    }
    index=-1;return null;
  }
  function next(){return selectAfter(index);}
  function rearm(){for(const slot of jet.mounts)slot.store.visible=true;return jet.mounts.length;}
  function reset(){
    for(const shot of shots)root.remove(shot.group);shots.length=0;
    for(const b of bursts){b.active=b.g.visible=false;b.timer=0;}
    for(const t of targets){t.intact=t.model.visible=true;t.reserved=false;}
    if(fx&&fx.reset)fx.reset();hitCount=0;index=0;rearm();
  }
  function fire(state){
    if(!state||state.onGround||state.phase==='crashed')return false;
    const target=available(targets[index])?targets[index]:selectAfter(index);
    const slot=jet.mounts.find(m=>m.store.visible);
    if(!target){say(hitCount===targets.length?'本轮岛靶已全部命中。':'训练弹飞行中。');return false;}
    if(!slot){say('训练弹已用完，着舰后补充。');return false;}
    slot.socket.updateWorldMatrix(true,false);
    const start=slot.socket.getWorldPosition(new T.Vector3());slot.socket.getWorldQuaternion(pose);
    const forward=nose.clone().applyQuaternion(pose),distance=start.distanceTo(target.position);
    const group=new T.Group();group.name='投放中的练习标记';group.position.copy(start);group.quaternion.copy(pose);
    group.add(jet.createTrainingRound());
    const trace=new T.Mesh(traceGeo,traceMat);trace.position.z=1.18;trace.visible=false;group.add(trace);root.add(group);
    const bend=start.clone().addScaledVector(forward,Math.min(110,16+.18*distance));bend.y-=2.1;
    shots.push({group,trace,target,start,bend,age:0,duration:Math.min(2.55,.76+distance*.0017),height:Math.min(34,7+distance*.028)});
    slot.store.visible=false;target.reserved=true;next();say('训练弹已发射 · '+target.name,'launch');return true;
  }
  function burst(target,state){
    const n=targets.indexOf(target),b=bursts[n];b.active=b.g.visible=true;b.timer=0;b.g.position.copy(target.position);
    const wx=state.windX||0,wz=state.windZ||0;
    if(fx&&fx.burst)fx.burst(target.position,'hit',wx,wz);
    for(let j=0;j<b.pieces.length;j++){
      const a=tau*(j+.39*n)/b.pieces.length,p=b.pieces[j];p.position.set(Math.cos(a)*.65,Math.sin(a*2)*.44,Math.sin(a)*.65);
      p.rotation.set(j*.57,a,n*.74);p.visible=true;
    }
    b.ring.visible=true;b.ring.scale.setScalar(1.5);b.ring.material.opacity=.88;
  }
  function animateBursts(state,dt){for(const b of bursts){
    if(!b.active)continue;b.timer+=dt;const t=b.timer/1.32;
    if(t>=1){b.active=b.g.visible=false;continue;}
    b.ring.scale.setScalar(mix(1.5,10,1-sq(1-t)));b.ring.material.opacity=.86*sq(1-t);
    for(let j=0;j<b.pieces.length;j++){
      const p=b.pieces[j],a=j*tau/b.pieces.length+.41,t0=b.timer;
      p.position.x+=dt*(Math.cos(a)*(3.5+j%3)+(state.windX||0)*.28);
      p.position.z+=dt*(Math.sin(a)*(3.5+j%3)+(state.windZ||0)*.28);
      p.position.y+=dt*(3.6+(j%3)-8.2*t0);p.rotation.x+=dt*(1+j*.31);p.rotation.z+=dt*(2.1-j*.43);
      const w=(1.35+.25*(j%3))*Math.min(1,(1-t)*3.2);p.scale.set(1.30*w,.44*w,.74*w);
    }
  }}
  function step(state,dt){
    if(!state||!Number.isFinite(dt)||dt<0)return;
    for(let j=shots.length-1;j>=0;j--){
      const s=shots[j];s.age+=dt;const t=Math.min(1,s.age/s.duration),u=1-t,end=s.target.position;
      if(t>=1){
        root.remove(s.group);shots.splice(j,1);s.target.reserved=false;s.target.intact=s.target.model.visible=false;
        hitCount++;burst(s.target,state);
        if(hitCount===targets.length)say('岛靶全部命中，本轮练习完成。','hit');else say(s.target.name+' 命中 · '+hitCount+' / '+targets.length,'hit');
        continue;
      }
      // A display curve joins the departing capsule to the selected board. The
      // marker's tangent only orients its drawing along this choreographed path.
      const arch=lastPoint.lerpVectors(s.start,end,.65);arch.y+=s.height;
      const p=s.group.position;p.copy(s.start).multiplyScalar(u*u*u).addScaledVector(s.bend,3*u*u*t).addScaledVector(arch,3*u*t*t).addScaledVector(end,t*t*t);
      direction.copy(s.start).multiplyScalar(-u*u).addScaledVector(s.bend,u*u-2*u*t).addScaledVector(arch,2*u*t-t*t).addScaledVector(end,t*t).normalize();
      if(direction.lengthSq()>.1)s.group.quaternion.setFromUnitVectors(nose,direction);
      s.trace.visible=t>.035;s.trace.scale.set(.22,.22,2+10*Math.sin(t*Math.PI));
    }
    animateBursts(state,dt);
  }
  reset();
  return {reset,rearm,next,fire,step,get total(){return targets.length;},get selected(){return available(targets[index])?targets[index]:null;},
    get ammo(){return jet.mounts.reduce((n,slot)=>n+Number(slot.store.visible),0);},get hits(){return hitCount;},get inFlight(){return shots.length;}};
}
