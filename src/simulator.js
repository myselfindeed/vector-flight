// Arcade flight dynamics in metres, seconds and radians. Wind is a world-space velocity.
function createFlightSimulator(T, coast, event) {
  const home={x:-5,z:72}, wheel=1.6, vertical=Math.PI/2;
  const clamp=T.MathUtils.clamp, smooth=T.MathUtils.smoothstep;
  const damp=(a,b,k,dt)=>b+(a-b)*Math.exp(-k*dt);
  const move=(a,b,step)=>a+clamp(b-a,-step,step);
  const turnTo=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const p=new T.Vector3(), old=new T.Vector3();
  const probePoint=new T.Vector3(), probeRotation=new T.Quaternion(), probeAngles=new T.Euler(0,0,0,"YXZ");
  const airframe=[[0,0,-6.35,.77],[0,.05,-3.25,1.10],[0,0,0,1.15],[0,0,2.75,1.12],[0,-.08,5.78,.82]];
  for(const side of [-1,1])airframe.push([side*2.20,.14,.20,.75],[side*3.55,.15,1.08,.68],[side*4.86,.12,1.67,.50],
    [side*2.55,.02,5.62,.60],[side*1.70,1.13,4.81,.56]);
  const attitude=new T.Quaternion(), increment=new T.Quaternion(), poseAngles=new T.Euler(0,0,0,"YXZ");
  const rates=new T.Vector3(), rotationStep=new T.Vector3(), nose=new T.Vector3(), rightWing=new T.Vector3();
  const s={position:p,attitudeQuaternion:attitude,renderer:null,time:0,phase:"parked",mode:"cruise"};
  const controls={turn:0,forward:0,lift:0,pitch:0,yaw:0,brake:false};
  const wreck=createWreckMotion(T,coast);
  const takeover={turn:0,pitch:0,yaw:0},attitudeInputs=["turn","pitch","yaw"],rotationAxes=["x","y","z"];
  const lastVelocity=new T.Vector3(), acceleration=new T.Vector3(), liftAxis=new T.Vector3();
  const fullTurn=2*Math.PI, maneuverNames={roll:"横滚",loop:"筋斗"};
  const returnLookahead=[10,32,75,145,250,410];
  let routine=null, rollSide=-1;
  let travel=0, taxiLever=0, forward=0, cruise=55, liftGoal=22, flapChoice=-1, gearChoice=-1, bench=false, braking=false;
  function reset() {
    p.set(home.x,wheel,home.z);
    Object.assign(s,{phase:"parked",mode:"cruise",time:0,dt:0,heading:0,pitch:0,roll:0,turn:0,nozzle:0,gear:1,flap:0,
      engine:0,thrust:0,agl:0,msl:-coast.seaLevel,airspeed:0,speed:0,vx:0,vy:0,vz:0,onGround:true,
      windX:4,windZ:-2,windSpeed:4.47,humidity:.80,fuel:100,flapAuto:true,gearAuto:true,crashReason:"",landings:0,
      loadFactor:1,maneuver:"",maneuverQueued:"",maneuverProgress:0,boost:0,boostCommand:false,
      assistEnabled:false,manualActive:false,pitchInput:0,yawInput:0,shotDown:false,
      displayPitch:0,displayRoll:0,displayHeading:0});
    attitude.identity();rates.set(0,0,0);
    Object.assign(controls,{turn:0,forward:0,lift:0,pitch:0,yaw:0,brake:false});
    routine=null;rollSide=-1;
    travel=taxiLever=forward=0;cruise=55;flapChoice=gearChoice=-1;bench=braking=false;
  }
  function startEngine() {
    if(s.phase==="taxi" && forward<.6){park(false);return;}
    if(s.phase!=="parked")return;
    s.phase="taxi";taxiLever=0;bench=braking=false;
    event("mode","发动机启动。W 加油门滑行，B 刹车。","startup");
  }
  function launch(kind) {
    if(!["parked","taxi","roll"].includes(s.phase))return;
    if(kind==="vertical" && forward>8){event("info","当前正在滑跑，先刹停才能垂直起飞。");return;}
    bench=braking=false;
    if(kind==="vertical"){
      s.phase="liftoff";s.mode="hover";liftGoal=coast.groundHeight(p.x,p.z)+wheel+22;
      forward=0;s.vx=s.vy=s.vz=0;event("takeoff","垂直起飞。喷口正在转向，离舰后切换主飞行显示。","vertical");
    } else {
      if(s.phase==="roll")return;
      s.phase="roll";s.mode="cruise";taxiLever=1;travel=0;
      event("takeoff","开始甲板滑跑。A / D 修正方向，B 可中止。");
    }
  }
  function releaseDeck(){
    s.phase="departure";s.mode="cruise";s.onGround=false;s.pitch=Math.max(.07,s.pitch);s.vy=Math.max(2,s.vy);
    cruise=Math.max(56,forward+8);event("airborne","已离舰。沿舰艏方向可见试飞航标和练习靶区。");
  }
  function park(landed){
    clearManeuver();s.boost=0;s.boostCommand=false;s.loadFactor=1;s.manualActive=false;rates.set(0,0,0);
    s.phase="parked";s.mode="cruise";s.onGround=true;s.engine=s.thrust=s.speed=s.airspeed=0;
    s.vx=s.vy=s.vz=s.pitch=s.roll=s.turn=0;s.agl=0;s.gear=1;poseFromAngles();
    p.y=coast.groundHeight(p.x,p.z)+wheel;
    s.msl=p.y-wheel-coast.seaLevel;
    travel=forward=taxiLever=0;flapChoice=gearChoice=-1;s.flapAuto=s.gearAuto=true;bench=braking=false;
    if(landed){s.landings++;event("land","已回到海岬号甲板，训练挂架已补充。");}
    else event("info","发动机已关闭，驻车制动已接合。","shutdown");
  }
  function crash(reason,kind="crash"){
    if(s.phase==="crashed")return;
    clearManeuver();s.boost=0;s.boostCommand=false;s.manualActive=false;rates.set(0,0,0);poseFromAngles();
    s.phase="crashed";s.crashReason=reason;s.onGround=false;s.engine=s.thrust=s.airspeed=s.speed=0;
    s.agl=Math.max(0,p.y-coast.groundHeight(p.x,p.z)-wheel);s.msl=p.y-wheel-coast.seaLevel;
    s.vx=s.vy=s.vz=0;forward=0;event(kind,reason);
  }
  function shootDown(){
    if(s.onGround||!['liftoff','departure','free'].includes(s.phase))return;
    clearManeuver();s.boostCommand=false;s.boost=0;s.manualActive=false;
    s.shotDown=true;s.phase='falling';s.engine=s.thrust=0;
    wreck.start(attitude,lastVelocity.set(s.vx,s.vy,s.vz));
  }
  function changeMode(){
    if(s.phase==="parked"||s.phase==="taxi"){launch("vertical");return;}
    if(s.phase==="return"){s.phase="free";s.mode="hover";event("mode","已恢复手动悬停。","cancel");return;}
    if(s.phase==="liftoff"&&s.agl<3)return;
    if(!["free","departure","liftoff"].includes(s.phase))return;
    clearManeuver();s.boostCommand=false;
    s.phase="free";s.mode=s.mode==="cruise"?"hover":"cruise";
    if(s.mode==="cruise")cruise=Math.max(56,Math.abs(forward));
    updateControlOwner();
    event("mode",s.mode==="cruise"?"转入平飞。W / S 调节推力，上下方向键控制俯仰。":"转入悬停。可用 W / S 前后移动，空格 / Shift 升降。",s.mode);
  }
  function returnHome(){
    if(s.onGround||s.phase==="crashed"||s.phase==="falling")return;
    if(s.phase==="return"){changeMode();return;}
    clearManeuver();s.boostCommand=false;
    s.phase="return";s.mode="hover";flapChoice=gearChoice=-1;s.flapAuto=s.gearAuto=true;
    updateControlOwner();
    event("mode","收到返舰请求，正在返回海岬号。","recovery");
  }
  function flap(){if(s.phase==="crashed")return;flapChoice=(flapChoice+2)%4-1;s.flapAuto=flapChoice<0;event("info",s.flapAuto?"襟翼已交给自动控制。":"襟翼指令 "+[0,50,100][flapChoice]+"%。");}
  function gear(){if(s.phase==="crashed"||s.onGround)return;gearChoice=(gearChoice+2)%3-1;s.gearAuto=gearChoice<0;event("info",gearChoice<0?"起落架自动。":gearChoice?"起落架放下。":"起落架收起。");}
  function testNozzle(){if(s.phase!=="parked"||s.speed>.05)return;bench=!bench;event("info",bench?"地面喷口检查，发动机保持关闭。":"喷口正在归位。");}
  function brake(){
    if(s.phase==="roll"){s.phase="taxi";taxiLever=0;event("info","滑跑已中止，正在制动。","abort");}
    if(s.phase==="taxi"){taxiLever=0;braking=true;}
  }
  function clearManeuver(){
    // Wrap equivalent orientations so manual controls recover by the shorter arc.
    if(routine){s.pitch=turnTo(0,s.pitch);s.roll=turnTo(0,s.roll);}
    routine=null;s.maneuver=s.maneuverQueued="";s.maneuverProgress=0;
  }
  function poseFromAngles(){attitude.setFromEuler(poseAngles.set(s.pitch,-s.heading,s.roll));}
  function readPose(continuous){
    nose.set(0,0,-1).applyQuaternion(attitude);
    rightWing.set(1,0,0).applyQuaternion(attitude);
    const horizontal=Math.hypot(nose.x,nose.z),pitch=Math.atan2(nose.y,horizontal);
    // At a vertical nose there is no unique azimuth. Retain the prior meridian and solve bank on it.
    const heading=horizontal>.00001?Math.atan2(nose.x,-nose.z):s.heading;
    const ch=Math.cos(heading),sh=Math.sin(heading);
    const cosine=rightWing.x*ch+rightWing.z*sh;
    const sine=(-rightWing.x*sh+rightWing.z*ch)*nose.y+rightWing.y*horizontal;
    const bank=Math.atan2(sine,cosine);
    if(!continuous){s.pitch=pitch;s.heading+=turnTo(s.heading,heading);s.roll=bank;return;}
    // Both triples represent the same orientation. Continue on the closest branch during a loop or roll.
    const ph=turnTo(s.heading,heading),pp=turnTo(s.pitch,pitch),pb=turnTo(s.roll,bank);
    const ah=turnTo(s.heading,heading+Math.PI),ap=turnTo(s.pitch,Math.PI-pitch),ab=turnTo(s.roll,bank+Math.PI);
    const alternate=ah*ah+ap*ap+ab*ab<ph*ph+pp*pp+pb*pb;
    s.heading+=alternate?ah:ph;s.pitch+=alternate?ap:pp;s.roll+=alternate?ab:pb;
  }
  function updateControlOwner(){
    const direct=!s.assistEnabled&&s.phase==="free"&&s.mode==="cruise"&&!s.onGround&&!s.maneuver&&!s.maneuverQueued;
    if(direct!==s.manualActive){
      if(direct)poseFromAngles();else readPose(false);
      rates.set(0,0,0);s.manualActive=direct;
    }
  }
  function toggleAssist(){
    if(s.phase==="crashed")return s.assistEnabled;
    const programmed=!!(s.maneuver||s.maneuverQueued);
    clearManeuver();s.assistEnabled=!s.assistEnabled;
    if(programmed&&s.assistEnabled){poseFromAngles();readPose(false);}
    updateControlOwner();
    event("mode",s.assistEnabled?"飞行辅助已开启。松杆后恢复平飞。":"飞行辅助已关闭。自由巡航时直接控制姿态。");
    return s.assistEnabled;
  }
  function checkTakeover(u){
    if(s.assistEnabled||(!s.maneuverQueued&&!routine))return;
    for(const key of attitudeInputs){
      const v=u[key];
      if(Math.abs(v)<.20)takeover[key]=0;
      else if(Math.abs(v)>.48 && Math.sign(v)!==takeover[key]){
        clearManeuver();event("mode","已接管机动，恢复直接操纵。");return;
      }
    }
  }
  function advanceRates(dt,u){
    const authority=.84+.16*smooth(Math.abs(forward),24,74);
    rotationStep.set(u.pitch*1.13*authority,-u.yaw*.71*authority,-u.turn*2.58*authority);
    // Integrate the smoothed rate across the entire slice, including the short coast after releasing a key.
    for(const a of rotationAxes){
      const target=rotationStep[a],oldRate=rates[a],response=target===0?13:6.6;
      const remaining=Math.exp(-response*dt);
      rotationStep[a]=target*dt+(oldRate-target)*(1-remaining)/response;
      rates[a]=target+(oldRate-target)*remaining;
    }
    const angle=rotationStep.length();
    if(angle>1e-9){
      increment.setFromAxisAngle(rotationStep.multiplyScalar(1/angle),angle);
      attitude.multiply(increment).normalize();
    }
    readPose(true);
  }
  function toggleBoost(){
    if(s.onGround||s.mode!=="cruise"||!["free","departure"].includes(s.phase))return false;
    s.boostCommand=!s.boostCommand;
    event("mode",s.boostCommand?"加力接通，推力正在上升。":"已退出加力，恢复巡航推力。");
    return true;
  }
  function maneuver(kind){
    if((kind!=="roll"&&kind!=="loop")||!["free","departure"].includes(s.phase)||s.onGround||s.maneuver||s.maneuverQueued)return false;
    if(kind==="loop" && p.y>704){event("info","接近试飞空域高度上限，下降后可做筋斗。");return false;}
    if(s.mode==="hover")changeMode();
    rollSide=controls.turn<-.15?1:-1;
    s.maneuverQueued=kind;
    for(const key of attitudeInputs)takeover[key]=Math.abs(controls[key])>.20?Math.sign(controls[key]):0;
    updateControlOwner();
    if(s.nozzle>.36||forward<30||s.phase==="departure")event("info","待平飞稳定后进入"+maneuverNames[kind]+"。");
    return true;
  }
  function advanceManeuver(dt){
    if(s.maneuverQueued && s.phase==="free" && s.nozzle<=.36 && forward>=30){
      const kind=s.maneuverQueued,speed=Math.max(32,forward);
      const radius=Math.min(speed*1.05,(824-p.y)/2);
      if(kind==="loop" && radius<25){clearManeuver();event("info","接近空域上限，已取消筋斗。");return false;}
      routine={kind,speed,heading:s.heading,pitch:s.pitch,bank:s.roll,time:0,
        radius,duration:kind==="roll"?2.8:fullTurn*radius/speed};
      s.maneuver=kind;s.maneuverQueued="";event("info","进入"+maneuverNames[kind]+"。");
    }
    if(!routine)return false;
    const r=routine,previous=r.time/r.duration;
    r.time=Math.min(r.duration,r.time+dt);
    const t=r.time/r.duration,ease=t*t*(3-2*t);
    let along;
    if(r.kind==="roll"){
      s.roll=r.bank*(1-ease)+rollSide*fullTurn*ease;
      s.pitch=r.pitch*(1-ease)+.042*Math.sin(Math.PI*t);
      s.turn=-rollSide*Math.sin(Math.PI*t);
      along=r.speed*Math.cos(s.pitch);s.vy=r.speed*Math.sin(s.pitch);
    }else{
      const a=r.pitch+fullTurn*previous,b=r.pitch+fullTurn*t;
      // Integrating the circular path over this slice keeps the visible attitude and velocity together.
      along=r.radius*(Math.sin(b)-Math.sin(a))/dt;
      s.vy=r.radius*(Math.cos(a)-Math.cos(b))/dt;
      s.pitch=b;s.roll=r.bank*(1-ease);s.turn=0;
    }
    s.vx=Math.sin(r.heading)*along+s.windX*.78;s.vz=-Math.cos(r.heading)*along+s.windZ*.78;
    s.heading=r.heading;forward=r.speed;s.maneuverProgress=t;
    if(r.time>=r.duration){
      s.roll=0;s.pitch=r.kind==="loop"?r.pitch:0;clearManeuver();
      event("info",maneuverNames[r.kind]+(s.assistEnabled?"完成，已恢复辅助飞行。":"完成，已恢复手动飞行。"));
    }
    return true;
  }
  function updateFlightReadings(dt){
    if(!s.manualActive)poseFromAngles();
    // The world horizon folds at the poles while the body can pitch through a full loop.
    const inverted=Math.cos(s.pitch)<0;
    s.displayPitch=Math.asin(clamp(Math.sin(s.pitch),-1,1));
    s.displayRoll=turnTo(0,s.roll+(inverted?Math.PI:0));
    s.displayHeading=s.heading+(inverted?Math.PI:0);
    if(s.onGround||s.phase==="crashed"){s.loadFactor=s.onGround?1:0;return;}
    liftAxis.set(0,1,0).applyQuaternion(attitude);
    acceleration.set(s.vx-lastVelocity.x,s.vy-lastVelocity.y,s.vz-lastVelocity.z).divideScalar(dt);
    acceleration.y+=9.81;
    s.loadFactor=damp(s.loadFactor,clamp(acceleration.dot(liftAxis)/9.81,-2.5,8.5),5.5,dt);
  }
  function wind(){
    s.windX=4.1+1.2*Math.sin(s.time*.12)+.55*Math.sin(s.time*.43+.7);
    s.windZ=-2.3+.70*Math.sin(s.time*.14+.2)+.42*Math.sin(s.time*.31);
    s.windSpeed=Math.hypot(s.windX,s.windZ);
    s.humidity=.80+.06*Math.sin(s.time*.027+s.position.z*.00045);
  }
  function checkSolid(){
    const dx=p.x-old.x,dy=p.y-old.y,dz=p.z-old.z,distance=Math.hypot(dx,dy,dz);
    if(!coast.obstacleAt(old.x+dx*.5,old.y+dy*.5,old.z+dz*.5,8.2+distance*.5))return false;
    probeRotation.setFromEuler(probeAngles.set(s.pitch,-s.heading,s.roll));
    const steps=Math.max(1,Math.ceil(distance/.95));
    for(const [x,y,z,radius] of airframe){
      probePoint.set(x,y,z).applyQuaternion(probeRotation);
      for(let i=1;i<=steps;i++){
        const f=i/steps;
        if(coast.obstacleAt(old.x+dx*f+probePoint.x,old.y+dy*f+probePoint.y,old.z+dz*f+probePoint.z,radius))return true;
      }
    }
    return false;
  }
  function groundStep(dt,u){
    const rolling=s.phase==="roll";
    if(u.brake||u.forward<-.3)brake();
    else if(!rolling){
      if(u.forward>.01)braking=false;
      if(!braking)taxiLever=clamp(taxiLever+u.forward*.52*dt,0,1);
    }
    const lever=s.phase==="roll"?1:taxiLever;
    s.thrust=damp(s.thrust,(.10+.83*lever)*s.engine,2.8,dt);
    const accel=lever>.02?lever*(s.phase==="roll"?9.2:7.8)*s.engine-.016*forward:-2.3;
    forward=clamp(forward+(braking?-17:accel)*dt,0,60);
    s.heading+=u.turn*clamp(forward*.07,0,.80)/(1+.020*forward)*dt;
    s.vx=Math.sin(s.heading)*forward;s.vz=-Math.cos(s.heading)*forward;s.vy=0;
    p.x+=s.vx*dt;p.z+=s.vz*dt;p.y=wheel;travel+=forward*dt;
    s.pitch=damp(s.pitch,s.phase==="roll"?.065*smooth(travel,118,158):0,3,dt);s.roll=0;
    s.nozzle=move(s.nozzle,s.phase==="roll"?.20*smooth(forward,15,40):0,dt*.7);
    if(checkSolid()){crash("甲板碰撞，机体损毁");return;}
    const onDeck=coast.isDeck(p.x,p.z);
    const rotation=s.phase==="roll" && (travel>153||!onDeck);
    const manualLift=!braking && (u.lift>.1||u.pitch>.2) && travel>70;
    if(forward>32 && (rotation||manualLift))releaseDeck();
    else if(!onDeck){s.phase="falling";s.onGround=false;event("info","飞机已滑出甲板。");}
  }
  function airborneStep(dt,u){
    const phase=s.phase, cruiseMode=s.mode==="cruise", ground=coast.groundHeight(p.x,p.z);
    let vx=0,vz=0,vy=0,bank=0,pitch=0,nozzle=0,power=.63;
    checkTakeover(u);
    updateControlOwner();
    const performing=advanceManeuver(dt);
    const direct=s.manualActive&&!performing;
    if(performing){
      power=.79;
    }else if(phase==="return"){
      const dx=home.x-p.x,dz=home.z-p.z,dist=Math.hypot(dx,dz),far=dist>150;
      nozzle=far?0:vertical;
      let speed=Math.min(99,dist*.72),highest=ground;
      if(dist>7){
        for(const ahead of returnLookahead){
          const d=Math.min(ahead,dist),f=d/dist;
          const terrain=coast.groundHeight(p.x+dx*f,p.z+dz*f);
          highest=Math.max(highest,terrain);
          const climbNeeded=terrain+wheel+14-p.y;
          if(climbNeeded>0)speed=Math.min(speed,d*13/climbNeeded);
          if(d===dist)break;
        }
      }
      if(dist>.05){vx=dx/dist*speed;vz=dz/dist*speed;}
      const turn=turnTo(s.heading,dist>14?Math.atan2(dx,-dz):0);s.heading+=clamp(turn,-dt,dt);
      const destination=dist>7?Math.max(highest+wheel+40,wheel+clamp(dist*.30,31,82)):wheel;
      vy=clamp((destination-p.y)*.72,-11,21);if(dist<1.4&&p.y-wheel<1.1)vy=-1;
      bank=far?clamp(-turn*.42,-.38,.38):0;pitch=clamp(vy*.007,-.11,.13);forward=speed;power=far?.72:dist<7?.43:.62;
    } else if(phase==="liftoff"){
      nozzle=vertical;power=.75;
      if(s.nozzle>1.20 && s.engine>.75)vy=clamp((liftGoal-p.y)*1.16,0,9.5);
      if(s.onGround && vy>.1){s.onGround=false;event("airborne","垂直离舰，已切换主飞行显示。");}
      if(p.y>=liftGoal-.38){s.phase="free";event("info","悬停已建立。V 转平飞，L 返舰。","hover");}
    } else if(phase==="departure"){
      forward=damp(forward,cruise,1.0,dt);s.heading+=u.turn*.52*dt;
      vx=Math.sin(s.heading)*forward+s.windX*.40;vz=-Math.cos(s.heading)*forward+s.windZ*.4;
      const trimForDirect=!s.assistEnabled&&!s.maneuverQueued;
      const climbTrim=trimForDirect?1-smooth(p.y,17,26):1;
      vy=3.3+6.7*climbTrim;pitch=.17*climbTrim;bank=-u.turn*.32;power=.85;
      if(p.y>27&&(!trimForDirect||Math.abs(s.pitch)<.0035)){
        if(trimForDirect)s.pitch=0;
        s.phase="free";event("info",s.assistEnabled?"爬升完成，辅助操控已接通。":"爬升完成，已交还手动飞行。","cruise");
      }
    } else if(phase==="falling"){
      vx=s.vx;vz=s.vz;vy=s.vy-10*dt;pitch=-.14;s.vy=vy;power=.22;
    } else if(direct){
      advanceRates(dt,u);
      cruise=clamp(cruise+u.forward*28*dt,24,143);
      const conversion=.22+.78*(1-s.nozzle/vertical);
      const turnDrag=Math.abs(rates.x)*1.3+Math.abs(rates.y)*1.1+Math.abs(rates.z)*.34;
      const targetSpeed=(cruise+s.boost*38)*conversion-nose.y*13-turnDrag-u.lift*2;
      forward=damp(forward,Math.max(5,targetSpeed),.95,dt);
      vx=nose.x*forward+s.windX*.88;vz=nose.z*forward+s.windZ*.88;
      const heightControl=clamp(forward*.49,17,52)*(1-.55*Math.abs(nose.y));
      vy=nose.y*forward+u.lift*heightControl;
      power=clamp(.46+(cruise-24)*.0028+u.forward*.10+u.lift*.07+nose.y*.08,.22,.96);
    } else {
      nozzle=cruiseMode?0:vertical;
      const yawRate=cruiseMode?-Math.sin(s.roll)*clamp(36/Math.max(35,forward),.34,.9)+u.yaw*.40:clamp(u.turn+u.yaw,-1,1);
      s.heading+=yawRate*dt;
      if(cruiseMode)cruise=clamp(cruise+u.forward*28*dt,24,143);
      if(s.maneuverQueued)cruise=Math.max(48,cruise);
      const blend=1-s.nozzle/vertical;
      forward=damp(forward,cruiseMode?(cruise+s.boost*38)*(.22+.78*blend):u.forward*20,cruiseMode?.95:1.7,dt);
      const influence=cruiseMode?.88:.17;
      vx=Math.sin(s.heading)*forward+s.windX*influence;vz=-Math.cos(s.heading)*forward+s.windZ*influence;
      const lift=clamp(u.lift+u.pitch,-1,1);
      vy=lift*(cruiseMode?Math.min(54,Math.max(17,forward*.48)):13);
      pitch=cruiseMode?Math.atan2(vy,Math.max(20,forward))+.014:-u.forward*.10+lift*.045;
      bank=-u.turn*(cruiseMode?1.03:.12)+Math.sin(s.time*.60)*.007;
      power=cruiseMode?clamp(.46+(cruise-24)*.0028+u.forward*.10+lift*.09,.22,.96):clamp(.56+u.lift*.18+Math.abs(u.forward)*.09,.28,.83);
    }
    s.nozzle=move(s.nozzle,nozzle,.82*dt);
    s.thrust=damp(s.thrust,(power+(1-power)*s.boost)*s.engine,2.5,dt);
    if(!performing){
      if(!direct){
        s.roll+=turnTo(s.roll,bank)*(1-Math.exp(-2.7*dt));s.pitch=damp(s.pitch,pitch,2.55,dt);
      }
      const horizontalResponse=direct?8.0:phase==="return"?2.2:2.75;
      s.vx=damp(s.vx,vx,horizontalResponse,dt);s.vz=damp(s.vz,vz,horizontalResponse,dt);
      s.vy=damp(s.vy,vy,direct?8.0:phase==="return"?3.1:2.5,dt);
    }
    p.x+=s.vx*dt;p.z+=s.vz*dt;p.y+=s.vy*dt;
    if(p.y>830){p.y=830;s.vy=Math.min(0,s.vy);}
    const floor=coast.groundHeight(p.x,p.z), deck=coast.isDeck(p.x,p.z);
    if(!s.onGround && checkSolid()){crash("撞击舰岛或甲板设备，机体损毁");return;}
    const contact=deck?wheel:.62;
    if(!s.onGround && p.y<=floor+contact && (s.vy<-.02 || floor>old.y-contact)){
      const fromAbove=old.y>=floor+contact-.035 && s.vy<=.01;
      const upright=Math.cos(s.pitch)*Math.cos(s.roll)>.965;
      const safe=deck && fromAbove && s.gear>.83 && s.vy> -5.8 && upright && s.speed<61 && phase!=="falling";
      if(safe){
        if(s.speed<8 || phase==="return"){park(true);}
        else{
          s.phase="taxi";s.onGround=true;s.manualActive=false;rates.set(0,0,0);p.y=wheel;forward=s.speed*.84;taxiLever=0;travel=0;braking=false;s.vy=0;s.pitch=s.roll=0;s.landings++;
          event("land","机轮已接地，B 制动。");
        }
      } else{
        const water=!deck && floor<=coast.seaLevel+.15;
        if(deck&&!fromAbove)p.copy(old);else p.y=Math.max(p.y,floor+.2);
        const reason=water?"飞机触水，试飞结束":deck?(fromAbove?"重着舰，机体损毁":"撞击舰体，机体损毁"):"撞击地形，机体损毁";
        crash(reason,water?"water":"crash");
      }
    }
    if(s.phase==="free"&&Math.hypot(p.x-home.x,p.z-home.z)>2780)returnHome();
  }
  function axis(value){const n=Number(value);return Number.isFinite(n)?clamp(n,-1,1):0;}
  function step(dt,input){
    s.dt=Number.isFinite(dt)&&dt>0?dt:0;
    if(!s.dt)return;
    const u=controls;
    u.turn=axis(input?.turn);u.forward=axis(input?.forward);u.lift=axis(input?.lift);u.pitch=axis(input?.pitch);u.yaw=axis(input?.yaw);u.brake=!!input?.brake;
    s.pitchInput=u.pitch;s.yawInput=u.yaw;
    s.time+=dt;wind();old.copy(p);lastVelocity.set(s.vx,s.vy,s.vz);
    if(s.phase==="crashed")return;
    if(s.shotDown){
      const contact=wreck.step(p,attitude,dt);
      readPose(false);
      s.vx=wreck.velocity.x;s.vy=wreck.velocity.y;s.vz=wreck.velocity.z;
      updateFlightReadings(dt);
      s.agl=Math.max(0,p.y-coast.groundHeight(p.x,p.z)-wheel);s.msl=p.y-wheel-coast.seaLevel;
      s.speed=Math.hypot(s.vx,s.vz);s.airspeed=Math.hypot(s.vx-s.windX,s.vy,s.vz-s.windZ);
      if(contact)crash(contact==='water'?'我机被击落，已坠海':'我机被击落，机体坠毁',contact);
      return;
    }
    if(s.phase==="parked"){
      s.onGround=true;s.nozzle=move(s.nozzle,bench?vertical:0,dt*.8);s.thrust=s.engine=s.speed=s.airspeed=0;
      s.turn=0;s.flap=move(s.flap,flapChoice<0?0:flapChoice*.5,dt*.60);return;
    }
    s.engine=move(s.engine,1,dt*.88);s.turn=damp(s.turn,u.turn,6,dt);
    s.boost=move(s.boost,s.boostCommand?1:0,dt*(s.boostCommand?1.05:1.6));
    if(s.phase==="taxi"||s.phase==="roll")groundStep(dt,u);else airborneStep(dt,u);
    updateFlightReadings(dt);
    updateControlOwner();
    if(s.phase==="crashed"||s.phase==="parked")return;
    s.speed=Math.hypot(s.vx,s.vz);
    s.airspeed=s.onGround?(s.speed>.5?Math.hypot(s.vx-s.windX,s.vz-s.windZ):0):Math.hypot(s.vx-s.windX,s.vz-s.windZ,s.vy);
    s.agl=Math.max(0,p.y-coast.groundHeight(p.x,p.z)-wheel);s.msl=p.y-wheel-coast.seaLevel;
    s.fuel=Math.max(0,s.fuel-s.thrust*dt*(.004+.008*s.boost));
    const deployment=s.phase==="return"||s.onGround||s.phase==="liftoff"||(s.mode==="hover"&&s.agl<39);
    const autoFlap=s.phase==="roll"||s.phase==="departure"?.65:s.phase==="taxi"?.23:deployment?.80:0;
    s.gear=move(s.gear,s.onGround?1:gearChoice<0?Number(deployment):gearChoice,dt*.61);
    s.flap=move(s.flap,flapChoice<0?autoFlap:flapChoice*.5,dt*.54);
    s.flapAuto=flapChoice<0;s.gearAuto=gearChoice<0;
  }
  reset();
  return {state:s,home,reset,step,startEngine,launch,changeMode,returnHome,brake,flap,gear,testNozzle,crash,shootDown,maneuver,toggleBoost,toggleAssist};
}
