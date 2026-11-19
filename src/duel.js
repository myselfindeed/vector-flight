// A one-on-one arcade match. Each pulse can remove one of three shield cells.
function createFlightDuel(T,scene,coast,onEvent,jet){
  const root=new T.Group(),rival=jet.flightCopy;
  root.name='空中对战';rival.name='敌机 02';root.add(rival);scene.add(root);
  const maxHP=3,maxTime=90,range=300,aimCos=Math.cos(17*Math.PI/180);
  const period=12,windup=1.65,inboundFlight=.78,fireDelay=2.2;
  const up=new T.Vector3(0,1,0),zAxis=new T.Vector3(0,0,1);
  const nose=new T.Vector3(),forward=new T.Vector3(),right=new T.Vector3(),offset=new T.Vector3();
  const playerVelocity=new T.Vector3(),rivalVelocity=new T.Vector3(),desired=new T.Vector3(),waypoint=new T.Vector3();
  const gaze=new T.Vector3(),poseMatrix=new T.Matrix4(),pose=new T.Quaternion(),bankQ=new T.Quaternion();
  const forecast=new T.Vector3(),muzzle=new T.Vector3(),pulseEnd=new T.Vector3();
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

  const hoop=new T.TorusGeometry(1,.075,6,32),boltCore=new T.SphereGeometry(1,8,6);
  function pulse(color){
    const mat=new T.MeshBasicMaterial({color,toneMapped:false,transparent:true,opacity:.94,depthWrite:false});
    const group=new T.Group(),core=new T.Mesh(boltCore,mat),wave=new T.Mesh(hoop,mat);
    core.scale.set(.70,.70,2.4);wave.scale.setScalar(1.95);group.add(core,wave);root.add(group);
    return {group,start:new T.Vector3(),end:new T.Vector3(),age:0,duration:0,hit:false};
  }
  const outgoing=pulse(0x74f8f0),incoming=pulse(0xff5e46);
  const flares=createDuelFlares(T,root),flareDelay=8,divertTime=.32;
  const impact=new T.Mesh(new T.SphereGeometry(1,14,8),new T.MeshBasicMaterial({
    color:0xffffff,wireframe:true,transparent:true,depthWrite:false,toneMapped:false
  }));
  root.add(impact);
  let status,stage,elapsed,cool,playerHP,rivalHP,message,result,outcome;
  let aligned,inRange,chargeAt,chargeEnds,evadeUntil,impactAge,impactRival;
  let playerFlareAt,rivalFlareAt;
  function emit(kind,text){message=text;if(onEvent)onEvent(kind,text);}
  function clearPulses(){outgoing.group.visible=incoming.group.visible=false;chargeEnds=0;}
  function reset(){
    root.visible=rival.visible=impact.visible=false;clearPulses();flares.reset();
    playerFlareAt=rivalFlareAt=0;
    status='idle';stage='chase';playerHP=rivalHP=maxHP;elapsed=cool=evadeUntil=impactAge=0;
    aligned=inRange=false;chargeAt=6;message=result=outcome='';
  }
  function stop(){const active=status==='active';reset();if(active)emit('end','已退出本局对战。');}
  function airborne(s){return s&&s.position&&!s.onGround&&['free','departure','liftoff'].includes(s.phase);}
  function finish(reason){
    if(status!=='active')return;
    status='finished';stage='finished';aligned=inRange=false;clearPulses();flares.reset();rival.visible=false;root.visible=impact.visible;
    outcome=reason?'retired':playerHP>rivalHP?'win':playerHP<rivalHP?'loss':'tie';
    result=reason||(outcome==='win'?'你获胜':outcome==='loss'?'敌机 02 获胜':'平局');
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
    if(status==='active'||!airborne(s))return false;
    reset();status='active';root.visible=rival.visible=true;axes(s);fly(s,0,true);aim(s);
    emit('start','敌机 02 已入场，靠近并对准敌机，按 J 发射脉冲。');return true;
  }
  function launch(shot,startPoint,endPoint,duration,hit){
    shot.age=0;shot.duration=duration;shot.hit=hit;shot.diverted=false;shot.start.copy(startPoint);shot.end.copy(endPoint);
    shot.group.position.copy(startPoint);shot.group.scale.setScalar(1);shot.group.visible=true;
    offset.subVectors(endPoint,startPoint).normalize();
    if(offset.lengthSq()>.5)shot.group.quaternion.setFromUnitVectors(zAxis,offset);
  }
  function divert(shot,enemy,s){
    const position=enemy?rival.position:s.position,rotation=enemy?rival.quaternion:s.attitudeQuaternion;
    flares.burst(enemy,position,rotation,pulseEnd,divertTime);
    launch(shot,shot.group.position,pulseEnd,divertTime,false);
    shot.diverted=true;
    if(enemy)rivalFlareAt=elapsed+flareDelay;
    else {playerFlareAt=elapsed+flareDelay;stage='chase';}
    emit('evade',enemy?'敌机释放干扰弹，引开了你的脉冲。':'干扰弹已引开来袭脉冲。');
  }
  function canFlare(){
    return status==='active'&&incoming.group.visible&&!incoming.diverted&&elapsed>=playerFlareAt;
  }
  function deployFlare(s){
    if(!canFlare()||!airborne(s))return false;
    divert(incoming,false,s);return true;
  }
  function fire(s){
    if(status!=='active'||!airborne(s)||cool>0)return false;
    axes(s);aim(s);cool=fireDelay;
    const hit=aligned&&inRange;
    muzzle.copy(s.position).addScaledVector(nose,8);
    if(hit)pulseEnd.copy(rival.position);
    else pulseEnd.copy(muzzle).addScaledVector(nose,range);
    launch(outgoing,muzzle,pulseEnd,.36,hit);
    emit('launch',hit?'脉冲已发射。':inRange?'脉冲偏离，转向敌机再试。':'敌机超出脉冲射程。');
    return true;
  }
  function damage(enemy,s){
    if(enemy){rivalHP--;evadeUntil=elapsed+1.9;}else playerHP--;
    impactRival=enemy;impactAge=0;impact.visible=true;impact.scale.setScalar(4);
    impact.material.color.setHex(enemy?0x6cfff2:0xff6b50);impact.material.opacity=.86;
    impact.position.copy(enemy?rival.position:s.position);
    emit('score',enemy?'命中敌机，敌方护盾剩余 '+rivalHP+' 格。':'我机中弹，护盾剩余 '+playerHP+' 格。');
    if(playerHP===0||rivalHP===0)finish('');
  }
  function stepPulse(shot,s,dt){
    if(!shot.group.visible)return;
    shot.age+=dt;const t=Math.min(1,shot.age/shot.duration);
    if(shot===outgoing&&shot.hit)shot.end.copy(rival.position);
    shot.group.position.lerpVectors(shot.start,shot.end,t);
    shot.group.scale.setScalar(1+.6*t);
    if(shot===outgoing&&shot.hit&&t>=.65&&elapsed>=rivalFlareAt){
      divert(shot,true,s);return;
    }
    if(t<1)return;
    shot.group.visible=false;
    if(shot.diverted)return;
    if(shot===outgoing){if(shot.hit)damage(true,s);}
    else{
      stage='chase';
      if(s.position.distanceToSquared(shot.end)<=11*11)damage(false,s);
      else emit('evade','成功避开来袭脉冲。');
    }
  }
  function stepImpact(s,dt){
    if(!impact.visible)return;
    impactAge+=dt;
    if(impactAge>.55){impact.visible=false;if(status==='finished')root.visible=false;return;}
    if(status==='active')impact.position.copy(impactRival?rival.position:s.position);
    impact.scale.setScalar(4+impactAge*20);impact.material.opacity=.86*(1-impactAge/.55);
  }
  function advance(s,dt){
    elapsed=Math.min(maxTime,elapsed+dt);cool=Math.max(0,cool-dt);
    axes(s);fly(s,dt,false);aim(s);stepImpact(s,dt);flares.step(dt);
    if(elapsed>=chargeAt){
      chargeAt+=period;
      if(inRange){
        stage='attack';chargeEnds=elapsed+windup;
        // The warning freezes one spot in the game's moving airspace. The player
        // can leave it before the red pulse arrives, including while hovering.
        forecast.copy(s.position).addScaledVector(playerVelocity,windup+inboundFlight);
        emit('cue','敌机正在蓄能。准备按 U 释放干扰弹，也可转弯躲避。');
      }
    }
    if(chargeEnds&&elapsed>=chargeEnds){
      chargeEnds=0;launch(incoming,rival.position,forecast,inboundFlight,false);
      emit('incoming','敌方脉冲来袭。');
    }
    stepPulse(outgoing,s,dt);
    if(status==='active')stepPulse(incoming,s,dt);
    if(status==='active'&&elapsed>=maxTime)finish('');
  }
  function step(s,dt){
    if(!Number.isFinite(dt)||dt<=0||status==='idle')return;
    if(status==='finished'){stepImpact(s,dt);return;}
    if(!airborne(s)){
      impact.visible=false;finish(s&&s.phase==='return'?'已返航，对战结束':'飞行中断，对战结束');return;
    }
    // Preserve the warning and pulse windows when frames are skipped.
    for(let remaining=dt;remaining>1e-7&&status==='active';){
      const slice=Math.min(remaining,.05);advance(s,slice);remaining-=slice;
    }
  }
  reset();
  return {reset,start,stop,step,fire,deployFlare,rival,maxHP,maxTime,get status(){return status;},get stage(){return stage;},
    get canFlare(){return canFlare();},get flareCooldown(){return Math.max(0,playerFlareAt-elapsed);},
    get playerHP(){return playerHP;},get rivalHP(){return rivalHP;},get aligned(){return aligned;},get inRange(){return inRange;},
    get timeLeft(){return Math.max(0,maxTime-elapsed);},get cooldown(){return cool;},get readyToFire(){return status==='active'&&cool<=0;},
    get message(){return message;},get result(){return result;},get outcome(){return outcome;}};
}
