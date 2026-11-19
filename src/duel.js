// One-on-one arcade match, with staged airframe damage and a visible descent after a knockout.
function createFlightDuel(T,scene,coast,onEvent,jet,fx){
  const root=new T.Group(),rival=jet.flightCopy;
  root.name='空中对战';rival.name='敌机 02';root.add(rival);scene.add(root);
  const maxHP=3,maxTime=90,range=300,aimCos=Math.cos(17*Math.PI/180);
  const period=12,windup=1.65,inboundFlight=.78,fireDelay=2.2;
  const up=new T.Vector3(0,1,0),zAxis=new T.Vector3(0,0,1);
  const nose=new T.Vector3(),forward=new T.Vector3(),right=new T.Vector3(),offset=new T.Vector3();
  const playerVelocity=new T.Vector3(),rivalVelocity=new T.Vector3(),desired=new T.Vector3(),waypoint=new T.Vector3();
  const gaze=new T.Vector3(),poseMatrix=new T.Matrix4(),pose=new T.Quaternion(),bankQ=new T.Quaternion();
  const forecast=new T.Vector3(),muzzle=new T.Vector3(),destination=new T.Vector3();
  const clamp=T.MathUtils.clamp, tau=2*Math.PI;

  // Small red wing panels and position lights identify the opposing copy of the airframe.
  const accents=new T.BufferGeometry(),wingTips=[];
  for(const side of [-1,1]){
    const a=[4.55*side,.23,.77],b=[5.28*side,.19,1.47],c=[5.28*side,.19,2.40],d=[4.55*side,.23,2.62];
    wingTips.push(...a,...b,...c,...a,...c,...d);
  }
  accents.setAttribute('position',new T.Float32BufferAttribute(wingTips,3));
  const red=new T.MeshBasicMaterial({color:0xff5846,side:T.DoubleSide,toneMapped:false});
  rival.add(new T.Mesh(accents,red));
  const bulb=new T.SphereGeometry(.22,8,6);
  for(const side of [-1,1]){
    const lamp=new T.Mesh(bulb,red);lamp.scale.set(1.6,.65,1.2);lamp.position.set(side*5.28,.15,1.85);rival.add(lamp);
  }

  function missile(enemy){
    return {enemy,visual:createDuelMissile(T,root,enemy,jet.createTrainingRound()),active:false,
      start:new T.Vector3(),end:new T.Vector3(),position:new T.Vector3(),direction:new T.Vector3(),
      launchAxis:new T.Vector3(),releaseVelocity:new T.Vector3(),releaseUp:new T.Vector3(),
      age:0,duration:0,hit:false,diverted:false,rack:0};
  }
  const outgoing=missile(false),incoming=missile(true);
  const flares=createDuelFlares(T,root),impact=createDuelImpact(T,root);
  const wreck=createWreckMotion(T,coast),flareDelay=8,divertTime=.32;
  const exhaustPoint=new T.Vector3(),previousPoint=new T.Vector3();
  let status,stage,elapsed,cool,playerHP,rivalHP,message,result,outcome;
  let aligned,inRange,chargeAt,chargeEnds,evadeUntil,playerFlareAt,rivalFlareAt;
  let rivalDown=false,impactHold=0,smokeAt=0;
  function emit(kind,text){message=text;if(onEvent)onEvent(kind,text);}
  function stopShots(){
    for(const shot of [outgoing,incoming]){shot.active=false;shot.visual.end();}
    chargeEnds=0;
  }
  function loadout(active){
    for(const slot of jet.mounts){
      slot.rangeRack.visible=!active;slot.combatStore.visible=active;slot.rivalStore.visible=true;
    }
  }
  function reset(){
    root.visible=rival.visible=false;stopShots();flares.reset();impact.reset();
    for(const shot of [outgoing,incoming]){shot.visual.reset();shot.rack=0;}
    loadout(false);playerFlareAt=rivalFlareAt=smokeAt=impactHold=0;rivalDown=false;
    status='idle';stage='chase';playerHP=rivalHP=maxHP;elapsed=cool=evadeUntil=0;
    aligned=inRange=false;chargeAt=6;message=result=outcome='';
  }
  function stop(){
    const inMatch=status==='active'||status==='crashing';reset();
    if(inMatch)emit('end','已退出本局对战。');
  }
  function airborne(s){return s&&s.position&&!s.onGround&&['free','departure','liftoff'].includes(s.phase);}
  function finish(reason){
    const afterCrash=status==='crashing';
    status='finished';stage='finished';aligned=inRange=false;stopShots();flares.reset();
    rival.visible=false;loadout(false);
    root.visible=impact.visible||outgoing.visual.visible||incoming.visual.visible;
    if(!afterCrash){
      outcome=reason?'retired':playerHP>rivalHP?'win':playerHP<rivalHP?'loss':'tie';
      result=reason||(outcome==='win'?'你获胜':outcome==='loss'?'敌机 02 获胜':'平局');
    }
    emit('end',result);
  }
  function axes(s){
    const heading=s.displayHeading??s.heading??0;
    forward.set(Math.sin(heading),0,-Math.cos(heading));
    right.set(-forward.z,0,forward.x);
    if(s.attitudeQuaternion)nose.set(0,0,-1).applyQuaternion(s.attitudeQuaternion);
    else nose.copy(forward);
    playerVelocity.set(s.vx||0,s.vy||0,s.vz||0);
  }
  function aim(s){
    offset.subVectors(rival.position,s.position);const distance=offset.length();
    inRange=distance<=range;aligned=distance>0&&offset.dot(nose)>=distance*aimCos;
  }
  function fly(s,dt,snap){
    // Move through broad, alternating fly-bys. The velocity settles towards the next
    // waypoint, so an abrupt player turn changes the chase without moving the enemy instantly.
    const lap=Math.floor(elapsed/period),t=elapsed-lap*period,side=lap%2?-1:1;
    const phase=clamp((t-3.2)/8.4,0,1),angle=tau*phase*phase*(3-2*phase);
    const dodge=clamp((evadeUntil-elapsed)/1.9,0,1);
    const lateral=side*(9+84*Math.sin(angle)+5*Math.sin(elapsed*.68)+32*Math.sin(dodge*Math.PI));
    const lead=95*Math.cos(angle),lift=7+7*(1-Math.cos(angle))+3*Math.sin(elapsed*.77)+7*dodge;
    waypoint.copy(s.position).addScaledVector(forward,lead).addScaledVector(right,lateral);
    waypoint.y+=lift+clamp(nose.y*lead,-32,45);
    waypoint.y=Math.max(waypoint.y,coast.groundHeight(waypoint.x,waypoint.z)+12);
    if(snap){
      rival.position.copy(waypoint);rivalVelocity.copy(playerVelocity).addScaledVector(forward,12);
    }else{
      desired.subVectors(waypoint,rival.position).multiplyScalar(2.4).add(playerVelocity).clampLength(0,265);
      rivalVelocity.lerp(desired,1-Math.exp(-3*dt));rival.position.addScaledVector(rivalVelocity,dt);
      rival.position.y=Math.max(rival.position.y,coast.groundHeight(rival.position.x,rival.position.z)+8);
    }
    gaze.copy(rival.position).add(rivalVelocity.lengthSq()>4?rivalVelocity:forward);
    poseMatrix.lookAt(rival.position,gaze,up);pose.setFromRotationMatrix(poseMatrix);
    const bank=-side*(.46*Math.sin(angle)+.42*Math.sin(dodge*Math.PI));
    pose.multiply(bankQ.setFromAxisAngle(zAxis,bank));
    if(snap)rival.quaternion.copy(pose);else rival.quaternion.slerp(pose,1-Math.exp(-4*dt));
  }
  function start(s){
    if(status==='active'||status==='crashing'||!airborne(s))return false;
    reset();status='active';root.visible=rival.visible=true;loadout(true);axes(s);fly(s,0,true);aim(s);
    emit('start','敌机 02 已入场，对准后按 J 发射导弹。');return true;
  }
  function launch(shot,s,endPoint,duration,hit){
    const rotation=shot.enemy?rival.quaternion:s.attitudeQuaternion;
    const position=shot.enemy?rival.position:s.position;
    const slot=jet.mounts[shot.rack%jet.mounts.length];
    shot.rack++;
    // Only the currently departing store leaves its rail. The range has its own loadout.
    for(const mount of jet.mounts)(shot.enemy?mount.rivalStore:mount.combatStore).visible=mount!==slot;
    muzzle.copy(slot.socket.position);
    shot.launchAxis.set(0,0,-1);shot.releaseUp.set(0,1,0);
    if(rotation){
      muzzle.applyQuaternion(rotation);shot.launchAxis.applyQuaternion(rotation);shot.releaseUp.applyQuaternion(rotation);
    }
    muzzle.add(position);
    shot.active=true;shot.hit=hit;shot.diverted=false;shot.age=0;shot.duration=duration;
    shot.start.copy(muzzle);shot.position.copy(muzzle);shot.direction.copy(shot.launchAxis);shot.end.copy(endPoint);
    shot.releaseVelocity.copy(shot.enemy?rivalVelocity:playerVelocity);
    shot.visual.launch(muzzle,shot.direction);
  }
  function divert(shot,enemy,s){
    const position=enemy?rival.position:s.position,rotation=enemy?rival.quaternion:s.attitudeQuaternion;
    flares.burst(enemy,position,rotation,shot.end,divertTime);
    shot.start.copy(shot.position);shot.launchAxis.copy(shot.direction);
    shot.age=0;shot.duration=divertTime;shot.hit=false;shot.diverted=true;
    if(enemy)rivalFlareAt=elapsed+flareDelay;
    else {playerFlareAt=elapsed+flareDelay;stage='chase';}
    emit('flare',enemy?'敌机释放干扰弹，导弹偏离了目标。':'干扰弹已引开来袭导弹。');
  }
  function canFlare(){
    return status==='active'&&incoming.active&&!incoming.diverted&&elapsed>=playerFlareAt;
  }
  function deployFlare(s){
    if(!canFlare()||!airborne(s))return false;
    divert(incoming,false,s);return true;
  }
  function fire(s){
    if(status!=='active'||!airborne(s)||cool>0)return false;
    axes(s);aim(s);cool=fireDelay;
    const hit=aligned&&inRange;
    if(hit)destination.copy(rival.position);
    else destination.copy(s.position).addScaledVector(nose,range);
    launch(outgoing,s,destination,.62,hit);
    emit('launch',hit?'导弹已离架。':inRange?'导弹已离架，偏离目标。':'导弹已离架，敌机超出射程。');
    return true;
  }
  function damage(enemy,s,shot){
    if(enemy){rivalHP--;evadeUntil=elapsed+1.9;}else playerHP--;
    const hp=enemy?rivalHP:playerHP,position=enemy?rival.position:s.position;
    const rotation=enemy?rival.quaternion:s.attitudeQuaternion,velocity=enemy?rivalVelocity:playerVelocity;
    impact.burst(enemy,position,rotation,shot.start,velocity);
    smokeAt=0;
    if(hp>0){
      emit('score',(enemy?'命中敌机，':'我机中弹，')+(hp===1?'机体重损，开始冒浓烟。':'机身受损。'));
      return;
    }
    status='crashing';stage='falling';rivalDown=enemy;aligned=inRange=false;
    stopShots();outcome=enemy?'win':'loss';result=enemy?'敌机已被击落，你获胜':'我机被击落，敌机 02 获胜';
    if(enemy)wreck.start(rotation,velocity);
    else{
      // The surviving aircraft continues its flyby while the player falls.
      rivalVelocity.set(0,0,-1).applyQuaternion(rival.quaternion).multiplyScalar(Math.max(36,rivalVelocity.length()));
      rivalVelocity.y=Math.max(3,rivalVelocity.y);
    }
    fx.burst(position,'knockout',s.windX,s.windZ,velocity);
    emit(enemy?'rivalDown':'playerDown',enemy?'敌机起火失控，正在坠落。':'我机起火失控，正在坠落。');
  }
  function stepMissile(shot,s,dt){
    if(!shot.active)return;
    shot.age+=dt;const t=Math.min(1,shot.age/shot.duration);
    if(shot===outgoing&&shot.hit)shot.end.copy(rival.position);
    previousPoint.copy(shot.position);
    if(shot.diverted){
      // Ease out along the old trail before the smoke bends towards the flare.
      offset.copy(shot.start).addScaledVector(shot.launchAxis,Math.min(15,.35*shot.start.distanceTo(shot.end)));
      shot.position.copy(shot.start).lerp(offset,t);
      offset.lerp(shot.end,t);shot.position.lerp(offset,t);
    }else{
      // A short release beat keeps the departing store in view beneath the wing before ignition.
      const release=.085;
      const drop=Math.min(shot.age,release);
      shot.position.copy(shot.start).addScaledVector(shot.releaseVelocity,drop)
        .addScaledVector(shot.releaseUp,-.75*drop/release).addScaledVector(shot.launchAxis,.5*drop/release);
      if(shot.age>release){
        const travel=Math.min(1,(shot.age-release)/(shot.duration-release));
        shot.position.lerp(shot.end,travel*(.38+.62*travel));
      }
    }
    if(shot.diverted||shot.age>.085){
      offset.subVectors(shot.position,previousPoint);
      if(offset.lengthSq()>1e-6)shot.direction.copy(offset).normalize();
    }
    shot.visual.update(shot.position,shot.direction,dt);
    if(shot===outgoing&&shot.hit&&t>=.65&&elapsed>=rivalFlareAt){divert(shot,true,s);return;}
    if(t<1)return;
    shot.active=false;shot.visual.end();
    if(shot.diverted)return;
    if(shot===outgoing){if(shot.hit)damage(true,s,shot);}
    else{
      stage='chase';
      if(s.position.distanceToSquared(shot.end)<=11*11)damage(false,s,shot);
      else emit('evade','已避开来袭导弹。');
    }
  }
  function smoke(position,rotation,burning,s){
    exhaustPoint.set(1.25,.30,3.1);
    if(rotation)exhaustPoint.applyQuaternion(rotation);
    fx.trail(exhaustPoint.add(position),s.windX,s.windZ,burning);
  }
  function stepVisuals(s,dt){
    outgoing.visual.step(dt);incoming.visual.step(dt);flares.step(dt);
    impact.step(dt,s.position,rival.position);
    smokeAt-=dt;
    if(smokeAt<=0){
      smokeAt=.065;
      if(rival.visible&&rivalHP<maxHP&&stage!=='impact')smoke(rival.position,rival.quaternion,rivalHP<=1,s);
      if(playerHP>0&&playerHP<maxHP&&airborne(s)&&status==='active')smoke(s.position,s.attitudeQuaternion,playerHP<=1,s);
    }
  }
  function stepWreck(s,dt){
    if(stage==='impact'){
      impactHold-=dt;if(impactHold<=0)finish('');
      return;
    }
    let contact='';
    if(rivalDown){
      contact=wreck.step(rival.position,rival.quaternion,dt);
      if(contact){
        rival.visible=false;
        fx.burst(rival.position,contact,s.windX,s.windZ);
        emit(contact==='water'?'splash':'groundImpact',contact==='water'?'敌机已坠海。':'敌机撞地爆炸。');
      }
    }else{
      rival.position.addScaledVector(rivalVelocity,dt);
      rival.position.y=Math.max(rival.position.y,coast.groundHeight(rival.position.x,rival.position.z)+8);
      if(s.phase==='crashed')contact='crash';
    }
    if(contact){stage='impact';impactHold=.95;}
  }
  function advance(s,dt){
    elapsed=Math.min(maxTime,elapsed+dt);cool=Math.max(0,cool-dt);
    axes(s);fly(s,dt,false);aim(s);
    if(elapsed>=chargeAt){
      chargeAt+=period;
      if(inRange){
        stage='attack';chargeEnds=elapsed+windup;
        forecast.copy(s.position).addScaledVector(playerVelocity,windup+inboundFlight);
        emit('cue','敌机准备发射导弹。');
      }
    }
    if(chargeEnds&&elapsed>=chargeEnds){
      chargeEnds=0;launch(incoming,s,forecast,inboundFlight,false);
      emit('incoming','来袭导弹！可按 U 释放干扰弹。');
    }
    stepMissile(outgoing,s,dt);
    if(status==='active')stepMissile(incoming,s,dt);
    if(status==='active'&&elapsed>=maxTime)finish('');
  }
  function step(s,dt){
    if(!Number.isFinite(dt)||dt<=0||status==='idle')return;
    if(status==='active'&&!airborne(s)){
      impact.reset();finish(s&&s.phase==='return'?'已返航，对战结束':'飞行中断，对战结束');return;
    }
    for(let remaining=dt;s&&remaining>1e-7;){
      const slice=Math.min(remaining,.05);remaining-=slice;
      stepVisuals(s,slice);
      if(status==='active')advance(s,slice);
      else if(status==='crashing')stepWreck(s,slice);
      else{
        root.visible=impact.visible||outgoing.visual.visible||incoming.visual.visible;
        if(!root.visible)break;
      }
    }
  }
  reset();
  return {reset,start,stop,step,fire,deployFlare,rival,maxHP,maxTime,get status(){return status;},get stage(){return stage;},
    get canFlare(){return canFlare();},get flareCooldown(){return Math.max(0,playerFlareAt-elapsed);},
    get playerHP(){return playerHP;},get rivalHP(){return rivalHP;},get aligned(){return aligned;},get inRange(){return inRange;},
    get timeLeft(){return Math.max(0,maxTime-elapsed);},get cooldown(){return cool;},get readyToFire(){return status==='active'&&cool<=0;},
    get message(){return message;},get result(){return result;},get outcome(){return outcome;}};
}
