(() => {
  "use strict";
  const T = window.THREE, $ = id => document.getElementById(id);
  const app = $("app"), stage = $("stage"), canvas = $("world"), monitor = $("monitor");
  const secondary = $("secondary"), primary = $("primary"), modal = $("modal");
  const hud = createInstruments();
  const audio = createFlightAudio();
  let soundOnFlight=true;
  try{soundOnFlight=localStorage.getItem("vector-flight-sound")!=="muted";}catch{}
  const HALF_PI = Math.PI / 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const damp = (a,b,rate,dt) => b + (a-b)*Math.exp(-rate*dt);
  const pressed = new Set(), touch = {turn:0, forward:0, up:false, down:false, left:false, right:false};
  let renderer, scene, coast, jet, cam, monitorCam, route, exhaust, groundLight;
  let sim, state, effects, range, pfd, cockpit, visor, wingTrails;
  let comms,duel,radar,observer,mission="duel",duelQueued=false;
  let observerMode="",beforeDuelView="",restoreDuelView=false,observerRect={x:0,y:0,w:0,h:0};
  const observerLabels={tower:"舰桥机位",wing:"伴飞机位",rival:"对手机位"};
  let headYaw=0,headPitch=-.06,rangeNote="",rangeFeedback="",noteExpires=0;
  const headRotation=new T.Quaternion(),headAngles=new T.Euler(0,0,0,"YXZ");
  const worldUp=new T.Vector3(0,1,0),viewForward=new T.Vector3(),viewRight=new T.Vector3(),viewUp=new T.Vector3();
  const previousForward=new T.Vector3(),previousCenter=new T.Vector3(),levelRight=new T.Vector3(),cameraDelta=new T.Vector3();
  const transport=new T.Quaternion();
  let followingNose=false;
  let gateIndex=0, tripStarted=false, cameraIndex=0, previousWideView=0;
  let orbitYaw=0, orbitElevation=0, zoom=1, cameraReady=false;
  let modalKind="", focusReturn=null, backgrounded=document.hidden;
  let cameraPointer=null, stickPointer=null, cameraDrag=null, stickOrigin=null;
  let viewW=1, viewH=1, frameRequest=0, lastFrame=0, hudTimer=0, lastShadowPose=NaN;
  let clearSky, insetSky, cameraPos, cameraAim, desiredPos, desiredAim, anchor, insetPos, insetAim;
  let monitorRect={x:0,y:0,w:1,h:1}, routeProjection, jetOffset, outletPosition, outletAxis, flameCenter;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gates=[
    {x:0,y:25,z:-205,r:19}, {x:52,y:39,z:-515,r:23}, {x:20,y:48,z:-845,r:24}
  ];
  function surface(x,z) { return coast.groundHeight(x,z); }
  function notify(text, cue) {
    hud.radio(text);if(cue)audio.cue(cue);
    if(cue==="launch"||cue==="hit"){
      rangeNote=text;rangeFeedback=cue;noteExpires=state.time+(cue==="hit"?3.8:2.6);
    }
  }
  function resetInput() {
    pressed.clear();touch.forward=touch.turn=0;touch.up=touch.down=touch.left=touch.right=false;
    cameraPointer=stickPointer=null; cameraDrag=stickOrigin=null;
    canvas.classList.remove("grabbed"); $("touchStick").firstElementChild.style.transform="";
  }
  function buildRoute() {
    const group=new T.Group();
    const colored=new T.MeshBasicMaterial({color:0xffc776,transparent:true,opacity:.92,toneMapped:false});
    const edge=new T.MeshBasicMaterial({color:0xffd396,transparent:true,opacity:.28,depthWrite:false,toneMapped:false});
    const segments=48, points=[];
    for(let i=0;i<segments;i++) {
      const a=i/segments*Math.PI*2, tick=i%4===0?1.08:1.035;
      points.push(new T.Vector3(Math.sin(a),Math.cos(a),0),new T.Vector3(Math.sin(a)*tick,Math.cos(a)*tick,0));
    }
    const ticks=new T.LineSegments(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xffda96,toneMapped:false}));
    group.add(new T.Mesh(new T.TorusGeometry(1,.012,5,96),colored));
    group.add(new T.Mesh(new T.TorusGeometry(1.045,.003,4,96),edge),ticks);
    group.visible=false; scene.add(group);
    return group;
  }
  function positionGate() {
    const g=gates[gateIndex]; if(!g){route.visible=false;return;}
    route.position.set(g.x,g.y,g.z); route.scale.setScalar(g.r);
    const prev=gateIndex===0?{x:0,z:0}:gates[gateIndex-1];
    route.rotation.y=-Math.atan2(g.x-prev.x,prev.z-g.z);
  }
  function flightEvent(kind,message,radioEvent=kind){
    if(radioEvent==="abort"||kind==="crash"||kind==="water")duelQueued=false;
    if(soundOnFlight&&!audio.enabled&&(radioEvent==="startup"||kind==="takeoff"))toggleSound();
    notify(message,kind);
    comms.event(radioEvent);
    if(kind==="takeoff"){
      tripStarted=true;gateIndex=0;positionGate();
      if(state.phase==="roll"&&cameraIndex!==3)selectCamera(1);else if(cameraIndex===2)selectCamera(0);
    }
    if(kind==="airborne"&&cameraIndex===2)selectCamera(0);
    if(kind==="land"){range.rearm();if(cameraIndex!==3)selectCamera(0);}
    if(kind==="crash"||kind==="water"){
      effects.burst(state.position,kind,state.windX,state.windZ);
      jet.root.visible=false;wingTrails.reset();selectCamera(0);resetInput();
    }
    refreshHUD();
  }
  function reset(){
    resetInput();sim.reset();effects.reset();range.reset();wingTrails.reset();cockpit.reset();jet.root.visible=true;
    mission="duel";duelQueued=false;duel.reset();beforeDuelView="";restoreDuelView=false;setObserver("");comms.reset();
    rangeNote=rangeFeedback="";noteExpires=0;
    tripStarted=false;gateIndex=0;positionGate();selectCamera(0);cameraReady=false;lastShadowPose=NaN;
    hud.radio("驻车制动已接合，发动机关闭。可启动滑行，或直接选择起飞方式。");refreshHUD();
  }
  function manualLayout(){
    return !state.assistEnabled && state.mode==="cruise" && (state.phase==="free"||state.phase==="departure");
  }
  function pilotInputs(){
    const held=(...keys)=>keys.some(k=>pressed.has(k));
    const direct=manualLayout(),rudder=Number(held("ArrowRight"))-Number(held("ArrowLeft"));
    const touchButtons=Number(touch.up)-Number(touch.down);
    return {
      turn:clamp(Number(held("KeyD"))-Number(held("KeyA"))+touch.turn+(direct?0:rudder),-1,1),
      yaw:direct?clamp(rudder+Number(touch.right)-Number(touch.left),-1,1):0,
      forward:clamp(Number(held("KeyW"))-Number(held("KeyS"))+(direct?touchButtons:touch.forward),-1,1),
      pitch:clamp(Number(held("ArrowUp"))-Number(held("ArrowDown"))+(direct?touch.forward:0),-1,1),
      lift:clamp(Number(held("Space"))-Number(held("ShiftLeft","ShiftRight"))+(direct?0:touchButtons),-1,1),
      brake:held("KeyB")
    };
  }
  function checkGate(x,y,z){
    if(!route.visible || gateIndex>=gates.length)return;
    const g=gates[gateIndex],p=state.position,dz=p.z-z;
    if(Math.abs(dz)<.00001 || (z-g.z)*(p.z-g.z)>0)return;
    const t=clamp((g.z-z)/dz,0,1);
    if(Math.hypot(x+(p.x-x)*t-g.x,y+(p.y-y)*t-g.y)<g.r){
      gateIndex++;positionGate();
      notify(gateIndex===gates.length?"三道航标全部通过。可继续飞行，或按 L 返舰。":"已通过航标 "+gateIndex+"。","gate");
    }
  }
  function primaryAction(){
    if(state.phase==="crashed"){reset();return;}
    if(state.phase==="roll"){sim.brake();return;}
    if(state.onGround){sim.launch("roll");return;}
    sim.changeMode();
  }
  function secondaryAction(){
    if(state.onGround)sim.launch("vertical");else requestReturn();
  }
  function requestReturn(){
    sim.returnHome();
  }
  function engineAction(){
    if(state.phase==="roll" || (state.phase==="taxi"&&state.speed>.5))sim.brake();
    else sim.startEngine();
  }
  function pickTarget(){
    if(state.phase==="crashed")return;
    if(state.onGround&&range.hits===range.total)range.reset();else range.next();
    rangeNote=rangeFeedback="";noteExpires=0;refreshHUD();
  }
  function fire(){
    if(state.phase==="crashed")return;
    if(mission==="duel"){
      if(duelQueued||state.phase==="return"||state.phase==="falling")return;
      if(duel.status==="active")duel.fire(state);
      else if(state.onGround){
        duelQueued=true;
        if(["parked","taxi"].includes(state.phase))sim.launch("roll");
      }
      else duel.start(state);
    }else if(!state.onGround)range.fire(state);
    refreshHUD();
  }
  function switchMission(value){
    if(mission===value)return;
    if(value==="range"){duelQueued=false;duel.stop();}
    mission=value;refreshHUD();
  }
  function deployFlare(){
    if(mission==="duel"&&duel.deployFlare(state))refreshHUD();
  }
  function duelEvent(kind,msg){
    if(kind==="start"){
      beforeDuelView=observerMode;restoreDuelView=true;duelQueued=false;setObserver("rival");
    }else if(kind==="end"&&restoreDuelView){
      restoreDuelView=false;setObserver(beforeDuelView);
    }else if(kind==="end"&&observerMode==="rival"){
      setObserver("wing");
    }
    hud.radio(msg);
    if(kind==="score")audio.cue("hit");
    else if(kind==="launch")audio.cue("launch");
    else if(kind==="evade"||kind==="cue")audio.cue("gate");
    else if(kind==="start"||kind==="end")audio.cue("mode");
  }
  function selectMissionAction(){
    if(mission==="range"){pickTarget();return;}
    if(duel.status==="active")duel.stop();else if(duelQueued)duelQueued=false;else switchMission("range");
    refreshHUD();
  }
  function setObserver(value){
    observerMode=value;observer.reset();
    $("observerToggle").setAttribute("aria-pressed",String(Boolean(value)));
    if(value){
      $("observerName").textContent=observerLabels[value];$("observerSubject").textContent=value==="rival"?"F-35B · 敌机 02":"VECTOR 21";
    }
    updatePanels();
  }
  function toggleObserver(){
    if(state.phase==="crashed")return;
    restoreDuelView=false;setObserver(observerMode?"":duel.status==="active"?"rival":"tower");
  }
  function nextObserver(){
    restoreDuelView=false;const modes=duel.status==="active"?["tower","wing","rival"]:["tower","wing"];
    setObserver(modes[(modes.indexOf(observerMode)+1)%modes.length]);
  }
  function flyManeuver(kind){sim.maneuver(kind);refreshHUD();}
  function toggleAssist(){sim.toggleAssist();refreshHUD();}
  function boost(){sim.toggleBoost();refreshHUD();}
  function cycleCamera(){
    if(state.phase==="crashed")return;
    const cameras=state.onGround?[0,1,3,2]:[0,1,3];
    selectCamera(cameras[(cameras.indexOf(cameraIndex)+1)%cameras.length]);
  }

  const cameraLabels=["外部环视","尾随视角","喷口特写","座舱视角"];
  function toggleCockpit(){if(state.phase!=="crashed")selectCamera(cameraIndex===3?previousWideView:3);}
  function selectCamera(index) {
    cameraIndex=index;
    if(index<2)previousWideView=index;
    orbitYaw=orbitElevation=headYaw=0;headPitch=-.06;zoom=1;cameraReady=followingNose=false;
    $("cameraLabel").textContent=cameraLabels[index];
    const inside=index===3;
    app.classList.toggle("view-cockpit",inside);
    $("visor").hidden=!inside;
    $("cockpitToggle").setAttribute("aria-pressed",String(inside));
    $("cockpitLabel").textContent=inside?"退出座舱":"进入座舱";
    $("cockpitToggle").title=inside?"返回外部视角（1）":"进入座舱（1）";
    const close=index===2;
    monitor.setAttribute("aria-pressed",String(close));
    monitor.setAttribute("aria-label",close?"返回整机视角":"放大喷口特写");
    monitor.title=monitor.getAttribute("aria-label");
    hud.buttonIcon(monitor,close?"shrink":"expand");
    updatePanels();
  }
  function toggleMonitor(){if(state.onGround)selectCamera(cameraIndex===2?previousWideView:2);}
  function flightCameraAxes(dt){
    viewForward.set(0,0,-1).applyQuaternion(jet.root.quaternion);
    levelRight.crossVectors(viewForward,worldUp);
    const horizontal=levelRight.length();
    if(horizontal>.001)levelRight.divideScalar(horizontal);
    if(!followingNose){
      if(horizontal>.12)viewRight.copy(levelRight);
      else viewRight.set(1,0,0).applyQuaternion(jet.root.quaternion);
    }else{
      // Transport the camera's lateral axis through vertical flight, where compass heading flips.
      transport.setFromUnitVectors(previousForward,viewForward);
      viewRight.applyQuaternion(transport);
      if(horizontal>.45&&state.maneuver!=="loop"&&Math.abs(state.pitchInput||0)<.12){
        const error=Math.atan2(cameraDelta.crossVectors(viewRight,levelRight).dot(viewForward),viewRight.dot(levelRight));
        viewRight.applyAxisAngle(viewForward,clamp(error,-dt*1.35,dt*1.35));
      }
      if(cameraReady){
        cameraDelta.subVectors(state.position,previousCenter);
        cameraPos.add(cameraDelta);cameraAim.add(cameraDelta);
      }
    }
    viewUp.crossVectors(viewRight,viewForward).normalize();
    viewRight.crossVectors(viewForward,viewUp).normalize();
    previousForward.copy(viewForward);previousCenter.copy(state.position);followingNose=true;
  }
  function updateCameras(dt){
    const p=state.position;
    const aspect=viewW/viewH;
    if(cameraIndex===3){
      cam.position.set(0,1.29,-3.54).applyMatrix4(jet.root.matrixWorld);
      headAngles.set(headPitch,headYaw,0,"YXZ");
      cam.quaternion.copy(jet.root.quaternion).multiply(headRotation.setFromEuler(headAngles));
      // Keep the whole instrument panel in the narrower viewport using the same lens as the outside view.
      const halfFov=T.MathUtils.degToRad(clamp(67*zoom,51,85))*.5;
      cam.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(halfFov)*Math.max(1,1.10/aspect)));
      cam.aspect=aspect;cam.updateProjectionMatrix();cam.updateMatrixWorld();
      return;
    }
    const isClose=cameraIndex===2;
    const chase=cameraIndex===1;
    const flying=state.mode==="cruise"&&!state.onGround&&(state.phase==="free"||state.phase==="departure");
    if(flying)flightCameraAxes(dt);else followingNose=false;
    const power=T.MathUtils.smoothstep(state.thrust,.25,.90);
    const verticalFlow=Math.sin(state.nozzle)*power*T.MathUtils.smoothstep(state.agl,.4,7);
    jet.nozzleExit.getWorldPosition(outletPosition);
    outletAxis.set(0,0,1).transformDirection(jet.nozzleExit.matrixWorld);
    flameCenter.copy(outletPosition).addScaledVector(outletAxis,.14+1.25*power);
    let fov, distance, yaw, elevation;
    if(isClose) {
      fov=39;distance=5.8+power*2.4;yaw=1.09;elevation=.13;
      anchor.set(0,-.13,5.77).applyMatrix4(jet.root.matrixWorld).lerp(flameCenter,.46);
    } else {
      fov=chase?52:43;
      distance=chase?23.5:20.0;
      yaw=chase?.17:-.62-.09*verticalFlow;
      elevation=chase?.23:.224+T.MathUtils.smoothstep(state.agl,1,18)*.03;
      anchor.copy(p);
      if(flying)anchor.addScaledVector(viewUp,chase?.9:1.20).addScaledVector(viewForward,chase?3.5:0);
      else{
        anchor.y+=chase?.9:1.20-1.65*verticalFlow;
        if(chase){anchor.x+=Math.sin(state.heading)*4.0;anchor.z-=Math.cos(state.heading)*4.0;}
      }
      const frameWidth=chase?1.22:1.36+.34*T.MathUtils.smoothstep(aspect,.72,1.35);
      distance*=clamp(frameWidth/aspect,.79,3.8);
      if(!chase)distance*=1+.12*verticalFlow;
    }
    const cameraYaw=yaw+orbitYaw-(flying?0:state.heading);
    const cameraElev=clamp(elevation+orbitElevation,-.09,1.19);
    distance*=zoom;
    desiredAim.copy(anchor);
    const sideways=Math.sin(cameraYaw)*Math.cos(cameraElev)*distance;
    const above=Math.sin(cameraElev)*distance,behind=Math.cos(cameraYaw)*Math.cos(cameraElev)*distance;
    if(flying)desiredPos.copy(anchor).addScaledVector(viewRight,sideways).addScaledVector(viewUp,above).addScaledVector(viewForward,-behind);
    else desiredPos.set(sideways,above,behind).add(anchor);
    desiredPos.y=Math.max(desiredPos.y,surface(desiredPos.x,desiredPos.z)+.85);
    if(!cameraReady) {
      cameraPos.copy(desiredPos);cameraAim.copy(desiredAim);cam.fov=fov;cameraReady=true;
    } else {
      const t=reducedMotion?1:1-Math.exp(-(isClose?8:5.6)*dt);
      cameraPos.lerp(desiredPos,t);cameraAim.lerp(desiredAim,t);
      cam.fov=damp(cam.fov,fov,6,dt);
    }
    cam.position.copy(cameraPos);cam.up.copy(flying?viewUp:worldUp);cam.lookAt(cameraAim);cam.aspect=aspect;cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // The inset always observes the real articulated outlet from the same side of the aircraft.
    if(!state.onGround || state.phase==="crashed")return;
    const vectorFraction=state.nozzle/HALF_PI;
    insetAim.set(0,-.12-.28*vectorFraction,6.12-.21*vectorFraction).applyMatrix4(jet.root.matrixWorld).lerp(flameCenter,.16+power*.35);
    insetPos.set(2.12+.86*vectorFraction+power*1.95,.31+power*.38,8.85-.32*vectorFraction+power*.78).applyMatrix4(jet.root.matrixWorld);
    monitorCam.position.copy(insetPos);monitorCam.up.set(0,1,0).applyQuaternion(jet.root.quaternion);
    monitorCam.lookAt(insetAim);monitorCam.aspect=monitorRect.w/monitorRect.h;monitorCam.updateProjectionMatrix();
  }
  function resize(){
    viewW=Math.max(1,stage.clientWidth);viewH=Math.max(1,stage.clientHeight);
    renderer.setSize(viewW,viewH,false);
    measureInset();hud.resize();pfd.resize();visor.resize(viewW,viewH);cameraReady=false;lastShadowPose=NaN;
    if(modalKind||backgrounded)draw(0);
  }
  function measureInset(){
    const rect=stage.getBoundingClientRect();
    function region(el){
      const box=el.getBoundingClientRect();
      return {x:Math.round(box.left-rect.left),y:Math.round(rect.bottom-box.bottom),w:Math.round(box.width),h:Math.round(box.height)};
    }
    if(!monitor.hidden)monitorRect=region($("monitorView"));
    if(!$("observerPanel").hidden)observerRect=region($("observerView"));
  }
  function updatePanels(){
    const showObserver=!!observerMode&&state.phase!=="crashed";
    const showMonitor=!showObserver&&state.onGround&&state.phase!=="crashed"&&cameraIndex!==3;
    const showPfd=!showObserver&&!state.onGround&&state.phase!=="crashed"&&cameraIndex!==3;
    if($("observerPanel").hidden===showObserver){$("observerPanel").hidden=!showObserver;if(showObserver)measureInset();}
    if(monitor.hidden===showMonitor){monitor.hidden=!showMonitor;if(showMonitor)measureInset();}
    if($("flightDisplay").hidden===showPfd){$("flightDisplay").hidden=!showPfd;if(showPfd)pfd.resize();}
  }
  function draw(dt) {
    state.dt=dt;jet.root.position.copy(state.position);
    jet.root.quaternion.copy(state.attitudeQuaternion);
    jet.update(state);jet.root.updateMatrixWorld(true);
    exhaust.update(state);wingTrails.update(state,jet.root,dt);groundLight.update(state);coast.update(state);updateCameras(dt);
    route.visible=duel.status!=="active"&&tripStarted && ["free","departure"].includes(state.phase) && state.mode==="cruise" && gateIndex<gates.length;
    renderer.setScissorTest(false);renderer.setViewport(0,0,viewW,viewH);scene.background=clearSky;
    // Keep the deck shadow static until some part of the parked silhouette actually moves.
    const parkedPose=state.nozzle+state.gear*2+state.flap*3+range.ammo*4;
    renderer.shadowMap.needsUpdate=state.phase!=="parked" || lastShadowPose!==parkedPose;
    lastShadowPose=state.phase==="parked"?parkedPose:NaN;
    jet.root.visible=state.phase!=="crashed"&&cameraIndex!==3;
    renderer.render(scene,cam);
    if(cameraIndex===3){
      cockpit.render(renderer,cam,state,headYaw,headPitch,viewH);
      visor.draw(state,cam,jet.root,headYaw,headPitch);
    }else exhaust.render(renderer,cam);
    if(state.onGround && !monitor.hidden){
      const r=monitorRect;
      renderer.setScissorTest(true);renderer.setScissor(r.x,r.y,r.w,r.h);renderer.setViewport(r.x,r.y,r.w,r.h);
      scene.background=insetSky;renderer.shadowMap.needsUpdate=false;
      renderer.render(scene,monitorCam);exhaust.render(renderer,monitorCam);
      renderer.setScissorTest(false);renderer.setViewport(0,0,viewW,viewH);scene.background=clearSky;
    }else if(!$("observerPanel").hidden){
      observer.render(renderer,scene,jet,state,duel.rival,observerMode,observerRect);
    }else if(!$("flightDisplay").hidden)pfd.draw(state);
    hud.heading(state.displayHeading);updatePointer();updateTargetMarker();
  }
  function updateTargetMarker(){
    const mark=$("targetMark"),target=mission==="duel"?(duel.status==="active"?duel.rival:null):range.selected;
    if(!target||state.onGround||state.phase==="crashed"){mark.hidden=true;return;}
    routeProjection.copy(target.position).project(cam);
    if(routeProjection.z<0||routeProjection.z>=1||Math.abs(routeProjection.x)>.88||Math.abs(routeProjection.y)>.74){mark.hidden=true;return;}
    if(cameraIndex===3){
      const projectedY=.5-.5*routeProjection.y;
      const sill=.51+(headPitch+.06)*.75+.17*Math.abs(routeProjection.x);
      if(projectedY>sill){mark.hidden=true;return;}
    }
    mark.style.left=(50+50*routeProjection.x)+"%";mark.style.top=(50-50*routeProjection.y)+"%";
    const match=mission==="duel";
    mark.classList.toggle("enemy",match);
    mark.classList.toggle("aligned",match&&duel.inRange&&duel.aligned);
    const label=match?(duel.inRange&&duel.aligned?"已对准 · ":"")+"敌机 02":target.name;
    if(mark.lastElementChild.textContent!==label)mark.lastElementChild.textContent=label;
    mark.hidden=false;
  }
  function updatePointer() {
    const pointer=$("navPointer"), g=gates[gateIndex];
    if(!route.visible || !g || cameraIndex===2 || cameraIndex===3){pointer.hidden=true;return;}
    routeProjection.copy(route.position).project(cam);
    const inFront=routeProjection.z>0 && routeProjection.z<1;
    const dist=state.position.distanceTo(route.position);
    const outside=Math.abs(routeProjection.x)>.88 || Math.abs(routeProjection.y)>.80 || !inFront;
    // On-screen gates are self-explanatory. An edge cue recovers the course after a turn.
    if(!outside || dist<32){pointer.hidden=true;return;}
    jetOffset.copy(route.position).applyMatrix4(cam.matrixWorldInverse);
    let dx=jetOffset.x, dy=jetOffset.y;
    if(!inFront && Math.abs(dx)<1)dx=1;
    if(!inFront)dy=clamp(dy,-Math.abs(dx)*.5,Math.abs(dx)*.5);
    const scale=1/Math.max(Math.abs(dx),Math.abs(dy)*cam.aspect,.00001);
    const x=clamp(.5+.42*dx*scale,.09,.91),y=clamp(.5-.35*dy*scale*cam.aspect,.19,.76);
    pointer.style.left=(x*100)+"%";pointer.style.top=(y*100)+"%";
    pointer.lastElementChild.textContent=Math.round(dist)+" m";pointer.hidden=false;
  }
  function updateTrainingHud(ground,crashed){
    const match=mission==="duel",active=duel.status==="active",finished=duel.status==="finished";
    $("duelTab").setAttribute("aria-pressed",String(match));$("practiceTab").setAttribute("aria-pressed",String(!match));
    const card=$("rangeControls");card.dataset.mission=mission;
    radar.update(state,match,active?duel.rival:null);
    $("target").hidden=match&&!active&&!duelQueued;
    $("shields").hidden=!match||(!active&&!finished);
    $("flare").hidden=!match||!active;
    $("ammo").hidden=match;
    if(match){
      const seconds=finished?Math.round(duel.maxTime-duel.timeLeft):Math.ceil(duel.timeLeft);
      const clock=Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
      hud.write("scoreLabel",finished?"用时":active?"剩余":"限时");hud.write("hits",clock);
      hud.write("targetValue",finished?duel.result:"F-35B · 敌机 02");
      hud.write("targetAction",active?"退出":"取消");$("target").disabled=false;
      $("target").title=active?"退出本局对战":"取消离舰后的对战";
      $("ownShield").value=duel.playerHP;$("enemyShield").value=duel.rivalHP;
      const unavailable=crashed||["falling","return"].includes(state.phase);
      const action=active?(duel.readyToFire?"发射脉冲":"充能 "+duel.cooldown.toFixed(1)+" 秒"):
        duelQueued?"等待离舰":ground?"起飞对战":finished?"再来一局":"开始对战";
      hud.write("actionLabel",action);
      $("fire").disabled=unavailable||duelQueued||(active&&!duel.readyToFire);
      $("fire").title=active?"朝机头方向发射脉冲（J）":"开始一对一空战（J）";
      hud.buttonIcon($("fire"),active?"target":ground?"takeoff":"play");
      if(active){
        $("flare").disabled=!duel.canFlare;
        const cooldown=Math.ceil(duel.flareCooldown),label=$("flareLabel");
        const text=cooldown?"干扰弹 · "+cooldown+" 秒":duel.canFlare?"释放干扰弹":"干扰弹待命";
        if(label.textContent!==text)label.textContent=text;
      }
      const hint=active?(duel.canFlare?"脉冲来袭！按 U 或点「释放干扰弹」。":duel.message):unavailable?(crashed?"重新上舰后可再次对战。":"恢复自由飞行后可开始对战。"):
        finished?"本局护盾　我方 "+duel.playerHP+" / 敌机 "+duel.rivalHP:
        duelQueued?"离舰后敌机入场。":"一对一空战，先击破敌机的三格护盾获胜。";
      hud.write("rangeHint",hint);
      card.dataset.feedback=active?(duel.stage==="attack"?"incoming":duel.readyToFire&&duel.inRange&&duel.aligned?"ready":""):finished?duel.outcome:"";
      return;
    }
    const complete=range.hits===range.total,newRound=ground&&complete,air=!ground&&!crashed;
    hud.write("scoreLabel","命中");hud.write("actionLabel","发射训练弹");hud.buttonIcon($("fire"),"launch");
    hud.write("targetValue",range.selected?.name||(complete?"本轮完成":"训练弹在途"));
    hud.write("targetAction",newRound?"重新布靶":"换靶");hud.write("ammo",String(range.ammo));hud.write("hits",range.hits+"/"+range.total);
    $("fire").disabled=!air||range.ammo===0||!range.selected;$("target").disabled=crashed||(!range.selected&&!newRound);
    $("fire").title="向选中的练习靶发射（J）";$("target").title="选择下一练习靶（T）";
    const recent=air&&!!rangeNote&&state.time<noteExpires;
    const hint=crashed?"本次试飞已结束":recent?rangeNote:complete?(ground?"可重新布置岛上靶":"全靶命中，返舰可开始下一轮"):ground?"离舰后即可发射":range.inFlight?"训练弹飞行中":"已选中岛上靶，点发射即可";
    hud.write("rangeHint",hint);card.dataset.feedback=recent?rangeFeedback:complete?"hit":"";
  }
  function refreshHUD(){
    const phase=state.phase,ground=state.onGround,crashed=phase==="crashed",returning=phase==="return";
    const air=!ground&&!crashed, p=state.position, takingOff=phase==="liftoff"&&ground;
    const labels={parked:"甲板待命",taxi:"甲板滑行",roll:"甲板滑跑",departure:"离舰爬升",liftoff:"垂直起飞",return:"自动返舰",falling:"脱离甲板",crashed:"试飞结束"};
    app.dataset.phase=phase;app.classList.toggle("airborne",air);
    hud.write("mode",state.maneuver==="loop"?"垂直筋斗":state.maneuver==="roll"?"横滚机动":labels[phase]||(state.mode==="hover"?"悬停飞行":state.manualActive?"手动飞行":"巡航平飞"));
    const direct=manualLayout(),assist=$("assist");
    app.classList.toggle("manual-controls",direct);
    assist.setAttribute("aria-checked",String(state.assistEnabled));assist.disabled=crashed;
    assist.title=state.assistEnabled?"关闭辅助，直接操纵三个轴（M）":"开启辅助，松杆自动改平（M）";
    hud.write("assistValue",state.assistEnabled?"开":"关");hud.write("turnHint",direct?"滚转":"转向");$("yawHint").hidden=!direct;
    $("touchStick").setAttribute("aria-label",direct?"左右滚转，上推抬头，下推低头":"摇杆控制前后移动与转向");
    $("touchUp").setAttribute("aria-label",direct?"增加油门":"爬升");$("touchDown").setAttribute("aria-label",direct?"减小油门":"下降");
    hud.write("location",crashed?"试飞结束":ground?"飞行甲板":returning?"返航 · 海岬号":"近海试飞空域");
    hud.write("alt",String(Math.round(state.agl)).padStart(3,"0"));
    hud.write("speed",String(Math.round(state.speed*3.6)).padStart(3,"0"));
    hud.write("climb",(state.vy>=.05?"+":"")+(Math.abs(state.vy)<.05?"0.0":state.vy.toFixed(1)));
    hud.write("thrust",Math.round(state.thrust*100)+"%");
    hud.write("angle",String(Math.round(state.nozzle*180/Math.PI)).padStart(2,"0"));
    const windDir=(Math.atan2(-state.windX,state.windZ)*180/Math.PI+360)%360;
    hud.write("wind",String(Math.round(windDir)%360).padStart(3,"0")+"° / "+Math.round(state.windSpeed*1.944)+" kt");
    $("windArrow").style.transform="rotate("+Math.round(windDir+180)+"deg)";
    hud.write("fuel",Math.round(state.fuel)+"%");
    hud.write("flapValue",(state.flapAuto?"自动 ":"")+Math.round(state.flap*39)+"°");
    hud.write("gearValue",state.gear>.97?"放下":state.gear<.03?"收起":"作动中");
    hud.write("engineValue",phase==="parked"||crashed?"关闭":state.engine<.98?"启动中":"运转");
    const engineLabel=phase==="parked"?"启动滑行":phase==="roll"||(phase==="taxi"&&state.speed>.5)?"甲板制动":phase==="taxi"?"关闭引擎":"发动机";
    hud.write("engineActionLabel",engineLabel);$("engine").title=engineLabel+(engineLabel==="甲板制动"?"（B）":"（E）");
    $("engine").disabled=!ground||takingOff;$("gear").disabled=ground||crashed;$("flaps").disabled=crashed;
    $("inspect").hidden=phase!=="parked";$("aeroControls").hidden=!air;
    $("cockpitToggle").disabled=crashed;$("camera").disabled=crashed;
    hud.write("loadFactor",state.loadFactor.toFixed(1));
    const running=state.maneuver||state.maneuverQueued;
    const canManeuver=air&&["free","departure"].includes(phase);
    for(const [button,kind] of [["aeroRoll","roll"],["aeroLoop","loop"]]){
      const b=$(button);b.disabled=!canManeuver||!!running;b.classList.toggle("active",running===kind);
      if(running===kind)b.style.setProperty("--progress",Math.round(state.maneuverProgress*100)+"%");
    }
    $("boost").disabled=!canManeuver||state.mode!=="cruise";
    $("boost").setAttribute("aria-pressed",String(Boolean(state.boostCommand)));
    updateTrainingHud(ground,crashed);$("observerToggle").disabled=crashed;
    hud.updateMeters(state.nozzle,state.thrust);
    primary.disabled=takingOff||phase==="falling";
    hud.write("primaryLabel",crashed?"重新上舰":phase==="roll"?"中止滑跑":takingOff?"垂直离舰中":ground?"滑跑起飞":returning?"接管悬停":state.mode==="hover"?"转换平飞":"切换悬停");
    hud.write("primaryKey",crashed?"R":phase==="roll"?"B":ground?"SPACE":"V");
    hud.buttonIcon(primary,ground?"takeoff":state.mode==="cruise"?"hover":"cruise");
    secondary.hidden=crashed||returning||phase==="falling"||phase==="roll"||takingOff;
    const secondaryText=ground?"垂直起飞":"返舰着陆";
    if(secondary.lastElementChild.textContent!==secondaryText)secondary.lastElementChild.textContent=secondaryText;
    secondary.title=ground?"垂直起飞（V）":"自动返舰着陆（L）";hud.buttonIcon(secondary,ground?"vector":"land");
    updatePanels();
    $("incident").hidden=!crashed;
    if(crashed){hud.write("incidentTitle",state.crashReason);hud.write("incidentScore","航标 "+gateIndex+"/3 · 靶场命中 "+range.hits+"/"+range.total);}
    const activeRoute=duel.status!=="active"&&air&&["free","departure"].includes(phase)&&state.mode==="cruise";
    $("routeInfo").hidden=!activeRoute;
    if(activeRoute) {
      hud.write("routeLabel",gateIndex<gates.length?"航标 "+String(gateIndex+1).padStart(2,"0")+" / 03":"航线已完成");
      hud.write("routeRange",gateIndex<gates.length?Math.round(p.distanceTo(route.position))+" m":"3 / 3");
    }
  }
  function frame(now){
    if(backgrounded||modalKind){frameRequest=0;lastFrame=0;return;}
    frameRequest=requestAnimationFrame(frame);
    const elapsed=lastFrame?(now-lastFrame)/1000:1/60;
    if(lastFrame && state.phase==="parked" && elapsed<1/32)return;
    lastFrame=now;
    const dt=Math.min(.20,Math.max(0,elapsed)),input=pilotInputs();
    const steps=Math.max(1,Math.ceil(dt/(1/60))),step=dt/steps;
    for(let i=0;i<steps;i++){
      const {x,y,z}=state.position;
      sim.step(step,input);range.step(state,step);checkGate(x,y,z);
      if(duelQueued&&!state.onGround&&["free","departure","liftoff"].includes(state.phase)&&state.agl>3)duel.start(state);
      duel.step(state,step);
      effects.update(step,state.windX,state.windZ);
    }
    state.dt=dt;audio.update(state);comms.step(dt);draw(dt);
    hudTimer+=dt;if(hudTimer>=.065){refreshHUD();hudTimer=0;}
  }
  function ensureRunning() {
    if(!frameRequest && !modalKind && !backgrounded)frameRequest=requestAnimationFrame(frame);
  }
  function pauseLoop() {
    if(frameRequest)cancelAnimationFrame(frameRequest);
    frameRequest=0;lastFrame=0;resetInput();
  }
  function openModal(kind){
    if(modalKind===kind){closeModal();return;}
    if(!modalKind)focusReturn=document.activeElement;
    modalKind=kind;pauseLoop();audio.suspend(true);comms.suspend(true);modal.hidden=false;
    const help=kind==="help";
    $("dialogTitle").textContent=help?"操作指南":"试飞暂停";
    $("dialogTag").textContent=help?"FLIGHT MANUAL":"FLIGHT PAUSED";
    $("helpContent").hidden=!help;$("pauseContent").hidden=help;$("reset").hidden=help;
    $("resume").lastElementChild.textContent=help?"返回试飞场":"继续飞行";
    $("resume").focus({preventScroll:true});
  }
  function closeModal(){
    modalKind="";modal.hidden=true;audio.suspend(backgrounded);comms.suspend(backgrounded);ensureRunning();
    if(focusReturn?.isConnected)focusReturn.focus({preventScroll:true});
  }
  function bindings(){
    // Return keyboard control to the aircraft after an on-screen flight command.
    function flyFromButton(button, action) {
      button.addEventListener("click",()=>{action();canvas.focus({preventScroll:true});});
    }
    flyFromButton(primary,primaryAction);
    flyFromButton(secondary,secondaryAction);
    flyFromButton($("retry"),reset);
    flyFromButton($("inspect"),()=>sim.testNozzle());
    flyFromButton($("engine"),engineAction);flyFromButton($("gear"),()=>sim.gear());flyFromButton($("flaps"),()=>sim.flap());
    flyFromButton($("target"),selectMissionAction);flyFromButton($("fire"),fire);
    flyFromButton($("flare"),deployFlare);
    flyFromButton($("practiceTab"),()=>switchMission("range"));flyFromButton($("duelTab"),()=>switchMission("duel"));
    flyFromButton($("observerToggle"),toggleObserver);flyFromButton($("observerClose"),toggleObserver);flyFromButton($("observerNext"),nextObserver);
    flyFromButton($("cockpitToggle"),toggleCockpit);
    flyFromButton($("aeroRoll"),()=>flyManeuver("roll"));flyFromButton($("aeroLoop"),()=>flyManeuver("loop"));
    flyFromButton($("boost"),boost);
    flyFromButton($("assist"),toggleAssist);
    flyFromButton(monitor,toggleMonitor);
    flyFromButton($("camera"),cycleCamera);
    $("sound").addEventListener("click",toggleSound);
    $("help").addEventListener("click",()=>openModal("help"));
    $("pause").addEventListener("click",()=>openModal("pause"));
    $("closeModal").addEventListener("click",closeModal);$("resume").addEventListener("click",closeModal);
    $("reset").addEventListener("click",()=>{reset();closeModal();});
    modal.addEventListener("click",e=>{if(e.target===modal)closeModal();});
    const driveKeys=new Set(["Space","ShiftLeft","ShiftRight","KeyA","KeyS","KeyD","KeyW","ArrowLeft","ArrowRight","ArrowDown","ArrowUp"]);
    window.addEventListener("keydown",e=>{
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      const key=e.code;
      if(modalKind){
        if(key==="Tab"){
          const focusable=[...modal.querySelectorAll("button:not([hidden])")];
          if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1).focus();}
          else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus();}
        } else if(["Escape","KeyP","KeyH","Slash"].includes(key)){e.preventDefault();if(!e.repeat)closeModal();}
        return;
      }
      if(!e.repeat&&comms.key(key)){e.preventDefault();return;}
      if(key==="Space" && document.activeElement?.matches("button:focus-visible"))return;
      if(driveKeys.has(key)){
        e.preventDefault();pressed.add(key);
        if(!e.repeat&&key==="Space"&&["taxi","parked"].includes(state.phase))sim.launch("roll");
        if(!e.repeat&&key==="KeyW"&&state.phase==="parked")sim.startEngine();
      } else if(!e.repeat){
        const actions={KeyV:()=>sim.changeMode(),KeyL:requestReturn,KeyC:cycleCamera,KeyO:toggleObserver,Digit1:toggleCockpit,Numpad1:toggleCockpit,
          KeyQ:()=>flyManeuver("roll"),KeyK:()=>flyManeuver("loop"),KeyX:boost,KeyM:toggleAssist,
          KeyB:()=>{pressed.add("KeyB");sim.brake();},KeyE:engineAction,KeyF:()=>sim.flap(),KeyG:()=>sim.gear(),
          KeyN:()=>sim.testNozzle(),KeyJ:fire,KeyU:deployFlare,KeyT:()=>{if(mission==="range")pickTarget();else if(duel.status==="active")setObserver("rival");},KeyR:()=>{if(state.phase==="crashed")reset();},
          KeyH:()=>openModal("help"),Slash:()=>openModal("help"),KeyP:()=>openModal("pause"),Escape:()=>openModal("pause")};
        if(actions[key]){e.preventDefault();actions[key]();}
      }
    });
    window.addEventListener("keyup",e=>pressed.delete(e.code));
    window.addEventListener("blur",resetInput);
    document.addEventListener("visibilitychange",()=>{
      backgrounded=document.hidden;audio.suspend(backgrounded || Boolean(modalKind));comms.suspend(backgrounded || Boolean(modalKind));
      if(backgrounded)pauseLoop();else ensureRunning();
    });
    canvas.addEventListener("pointerdown",e=>{
      if(cameraPointer!==null || (e.pointerType==="mouse"&&e.button!==0))return;
      canvas.focus({preventScroll:true});cameraPointer=e.pointerId;cameraDrag=[e.clientX,e.clientY];
      canvas.setPointerCapture(e.pointerId);canvas.classList.add("grabbed");
    });
    canvas.addEventListener("pointermove",e=>{
      if(e.pointerId!==cameraPointer||!cameraDrag)return;
      const dx=e.clientX-cameraDrag[0],dy=e.clientY-cameraDrag[1];
      if(cameraIndex===3){
        headYaw=clamp(headYaw-dx*.0043,-1.32,1.32);headPitch=clamp(headPitch-dy*.004,-.69,.63);
      }else{
        orbitYaw-=dx*.009;orbitElevation=clamp(orbitElevation+dy*.0065,-.36,.94);
      }
      cameraDrag=[e.clientX,e.clientY];
    });
    function endOrbit(e){if(e.pointerId===cameraPointer){cameraPointer=null;cameraDrag=null;canvas.classList.remove("grabbed");}}
    canvas.addEventListener("lostpointercapture",endOrbit);canvas.addEventListener("pointercancel",endOrbit);canvas.addEventListener("pointerup",endOrbit);
    canvas.addEventListener("wheel",e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(clamp(e.deltaY,-200,200)*.001),.62,2.5);},{passive:false});
    canvas.addEventListener("dblclick",()=>{if(cameraIndex===3){headYaw=0;headPitch=-.06;zoom=1;}});
    const stick=$("touchStick"),thumb=stick.firstElementChild;
    function moveStick(e){
      if(e.pointerId!==stickPointer||!stickOrigin)return;
      let x=(e.clientX-stickOrigin.x)/stickOrigin.r,y=(e.clientY-stickOrigin.y)/stickOrigin.r;
      const mag=Math.max(1,Math.hypot(x,y));x/=mag;y/=mag;
      touch.turn=Math.abs(x)<.09?0:x;touch.forward=Math.abs(y)<.09?0:-y;
      if(touch.forward>.15&&state.phase==="parked")sim.startEngine();
      thumb.style.transform="translate("+x*stickOrigin.r+"px,"+y*stickOrigin.r+"px)";
    }
    stick.addEventListener("pointerdown",e=>{
      if(stickPointer!==null)return;
      const r=stick.getBoundingClientRect();stickOrigin={x:r.left+r.width/2,y:r.top+r.height/2,r:r.width*.35};
      stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);
    });
    stick.addEventListener("pointermove",moveStick);
    const releaseStick=e=>{if(e.pointerId===stickPointer){stickPointer=null;stickOrigin=null;touch.turn=touch.forward=0;thumb.style.transform="";}};
    for(const type of ["pointerup","pointercancel","lostpointercapture"])stick.addEventListener(type,releaseStick);
    for(const [id,dir] of [["touchUp","up"],["touchDown","down"],["rudderLeft","left"],["rudderRight","right"]]){
      const b=$(id);b.addEventListener("pointerdown",e=>{b.setPointerCapture(e.pointerId);touch[dir]=true;if(dir==="up"&&["parked","taxi"].includes(state.phase))sim.launch("roll");});
      for(const type of ["pointerup","pointercancel","lostpointercapture"])b.addEventListener(type,()=>touch[dir]=false);
    }
    window.addEventListener("resize",resize);
    if(window.ResizeObserver){const observer=new ResizeObserver(resize);observer.observe(stage);}
  }
  function toggleSound(){
    audio.setEnabled(!audio.enabled);comms.setSound(audio.enabled);
    soundOnFlight=audio.enabled;
    try{localStorage.setItem("vector-flight-sound",soundOnFlight?"on":"muted");}catch{}
    const control=$("sound");control.setAttribute("aria-pressed",String(audio.enabled));
    control.title=audio.enabled?"关闭音效与塔台语音":"开启音效与塔台语音";control.setAttribute("aria-label",control.title);
    hud.buttonIcon(control,audio.enabled?"sound":"mute");
  }
  function showError(message) {
    pauseLoop();const loading=$("loading");loading.hidden=false;loading.innerHTML="";
    const text=document.createElement("b");text.textContent=message;loading.appendChild(text);
    const retry=document.createElement("button");retry.className="return-btn";retry.textContent="重新载入";retry.onclick=()=>location.reload();loading.appendChild(retry);
  }
  async function init(){
    renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.matchMedia("(pointer:coarse)").matches?1.35:1.6));
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    scene=new T.Scene();coast=createCoast(T,scene);
    if(coast.ready)await coast.ready;
    jet=createAircraft(T);scene.add(jet.root);route=buildRoute();
    exhaust=createExhaust(T,jet.nozzleExit);groundLight=createGroundLight(T,scene,coast);
    sim=createFlightSimulator(T,coast,flightEvent);state=sim.state;effects=createRangeEffects(T,scene);
    range=createTrainingRange(T,scene,coast,jet,effects,notify);pfd=createPilotDisplay($("pfd"));
    duel=createFlightDuel(T,scene,coast,duelEvent,jet);radar=createDuelRadar(stage);observer=createFlightObserver(T,coast);
    comms=createTowerConsole(state,sim.home,()=>sim.returnHome(),toggleSound,()=>canvas.focus({preventScroll:true}));
    cockpit=createFlightCockpit(T,scene.environment,coast.sunDirection);visor=createFlightVisor($("visor"),T);wingTrails=createWingTrails(T,scene);
    jet.root.traverse(o=>o.layers.enable(1));scene.traverse(o=>{if(o.isLight)o.layers.enable(1);});
    clearSky=scene.background;insetSky=new T.Color(0x374143);
    const inspectionLight=new T.DirectionalLight(0xe9edff,1.1);inspectionLight.position.set(6,4,8);inspectionLight.layers.set(1);scene.add(inspectionLight);
    cam=new T.PerspectiveCamera(43,1,.57,60000);
    monitorCam=new T.PerspectiveCamera(31,1,.22,40);monitorCam.layers.set(1);
    cameraPos=new T.Vector3();cameraAim=new T.Vector3();desiredPos=new T.Vector3();desiredAim=new T.Vector3();anchor=new T.Vector3();
    insetPos=new T.Vector3();insetAim=new T.Vector3();routeProjection=new T.Vector3();jetOffset=new T.Vector3();
    outletPosition=new T.Vector3();outletAxis=new T.Vector3();flameCenter=new T.Vector3();
    state.renderer=renderer;
    reset();bindings();resize();draw(0);refreshHUD();$("loading").hidden=true;ensureRunning();
    canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();showError("三维画面已中断，请重新载入试飞场。");},{once:true});
  }
  init().catch(error=>{
    console.error("Flight range initialization failed",error);
    showError("无法启动三维画面，请在支持 WebGL 的浏览器中开启硬件加速后重试。");
  });
})();
