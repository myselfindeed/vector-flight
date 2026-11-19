// Fictional range radio. The local voice bank contains original English lines in two synthetic voices.
function createTowerRadio({home={x:0,z:0},onLine=()=>{},onChange=()=>{}}={}) {
  const bankURL='@TOWER_RADIO_AUDIO@', cueJSON='@TOWER_RADIO_CUES@';
  const cues=cueJSON[0]==='{' ? JSON.parse(cueJSON) : {};
  const commands=new Set(['position','altitude','wind','check','recovery','ack','repeat']);
  const history=[], recentCalls=new Map(), pending=[], milestones=new Set();
  const sources=new Set();
  let clock=0, release=0, nextTurn=null, deferredReply=null, lastTower=null, lastBusy=false;
  let taxiReported=false, onFinal=false, finalCanceled=false;
  let enabled=false, paused=false, context=null, buffer=null, outlet=null, noise=null;
  let codecFailed=false, audioBlocked=false, loading=false, waitingVoice=null;
  const audioConstructor=()=>typeof window==='undefined' ? null : window.AudioContext||window.webkitAudioContext;
  const hasVoice=()=>Boolean(!codecFailed && bankURL.startsWith('data:audio/mpeg;base64,') && audioConstructor());
  const speaking=()=>sources.size>0 && context?.state==='running';
  const busy=()=>Boolean(nextTurn || clock<release || speaking());
  function changed(force=false){
    const current=busy();
    if(force||current!==lastBusy){lastBusy=current;onChange();}
  }
  function say(role,text,parts){
    const prefix=role==='PILOT'?'P_':'T_';
    return {role,text,clips:parts.map(p=>prefix+p)};
  }
  const pilot=(text,...parts)=>say('PILOT',text,parts);
  const tower=(text,...parts)=>say('TOWER',text,parts);
  const departure=tower('Vector 21, the deck is clear for departure.','departure');
  const local=tower('Vector 21, roger. Report when returning.','cruise');
  const exchanges={
    startup:[pilot('Cape Tower, Vector 21. Starting up on deck.','startup'),tower('Vector 21, Cape Tower. Radio contact.','startup')],
    taxi:[pilot('Cape Tower, Vector 21. Taxiing on deck.','taxi'),tower('Vector 21, report ready for departure.','taxi')],
    takeoff:[pilot('Cape Tower, Vector 21. Ready for departure.','ready'),departure],
    vertical:[pilot('Cape Tower, Vector 21. Ready for vertical departure.','vertical'),departure],
    airborne:[pilot('Cape Tower, Vector 21 is airborne.','airborne'),tower('Vector 21, Cape Tower. Airborne contact confirmed.','airborne')],
    cruise:[pilot('Cape Tower, Vector 21. Continuing local flight.','cruise'),local],
    hover:[pilot('Cape Tower, Vector 21. Entering the hover.','hover'),tower('Vector 21, hover acknowledged.','hover')],
    abort:[pilot('Cape Tower, Vector 21. Stopping on deck.','abort'),tower('Vector 21, roger. Hold on deck.','abort')],
    recovery:[pilot('Cape Tower, Vector 21. Request return to the ship.','recovery'),tower('Vector 21, your return is approved. The deck is clear.','recovery')],
    final:[pilot('Cape Tower, Vector 21. On final for the deck.','final'),tower('Vector 21, deck is clear. Cleared to land.','final'),pilot('Cleared to land, Vector 21.','finalAck')],
    cancel:[pilot('Cape Tower, Vector 21. Canceling the approach.','cancel'),local],
    land:[pilot('Cape Tower, Vector 21. On deck.','land'),tower('Vector 21, touchdown observed. Welcome back.','land')],
    shutdown:[pilot('Cape Tower, Vector 21. Parked, shutting down.','shutdown'),tower('Vector 21, shutdown copied.','shutdown')]
  };
  function digits(value,radioNine=true){
    return Array.from(String(value),c=>c==='.'?'point':c==='9'&&radioNine?'niner':c);
  }
  function cardinal(n){
    if(n<0)return ['negative',...cardinal(-n)];
    if(n<20)return [String(n)];
    if(n<100)return [String(n-n%10),...(n%10?[String(n%10)]:[])];
    const unit=n<1000?100:1000, word=unit===100?'hundred':'thousand';
    return [...cardinal(Math.floor(n/unit)),word,...(n%unit?cardinal(n%unit):[])];
  }
  function direction(rad){
    const degrees=((Math.round(rad*180/Math.PI)%360)+360)%360;
    return String(degrees||360).padStart(3,'0');
  }
  function altitudeReading(s){
    const feet=Math.round((s.msl||0)*3.280839895),vertical=s.vy||0;
    const trend=s.onGround?'On deck':vertical>.65?'Climbing':vertical<-.65?'Descending':'Level';
    return {feet,trend,parts:[...cardinal(feet),Math.abs(feet)===1?'oneFoot':'feet'],
      text:feet.toLocaleString('en-US')+' ft MSL'};
  }
  function pilotReport(kind,s,alt){
    const intro='Cape Tower, Vector 21. ';
    if(kind==='altitude'){
      const prefix={Climbing:'Climbing through',Descending:'Descending through',Level:'Level at','On deck':'On deck at'};
      const cue={Climbing:'altClimb',Descending:'altDescend',Level:'altLevel','On deck':'altDeck'};
      return pilot(intro+prefix[alt.trend]+' '+alt.text+'.','reportIntro',cue[alt.trend],...alt.parts);
    }
    const x=s.position?.x||0,z=s.position?.z||0,metres=Math.hypot(x,z);
    const speed=Number.isFinite(s.speed)?s.speed:Math.hypot(s.vx||0,s.vz||0);
    let position,parts;
    if(s.onGround){
      const stationary=speed<.7,rolling=s.phase==='roll';
      position=stationary?'Stationary on the flight deck':rolling?'Rolling on the flight deck':'Taxiing on the flight deck';
      parts=[stationary?'holdDeck':rolling?'rollDeck':'taxiDeck'];
    }else if(metres<12){
      const holding=speed<1&&Math.abs(s.vy||0)<.65;
      position=holding?'Hovering over the ship':'Over the ship';parts=[holding?'holdOver':'over'];
    }else{
      const sectors=['north','northeast','east','southeast','south','southwest','west','northwest'];
      const sector=sectors[(Math.round(Math.atan2(x,-z)*4/Math.PI)+8)%8];
      const miles=metres/1852,near=miles<.01,display=miles.toFixed(miles<1?2:1);
      position=(near?'Less than 0.01':display)+' NM '+sector+' of the ship';
      parts=[...(near?['tooClose']:[...digits(display,false),Number(display)===1?'nmOne':'nm']),sector];
    }
    const hdg=direction(Number.isFinite(s.displayHeading)?s.displayHeading:(s.heading||0));
    const altitude=s.onGround?'':', '+alt.text;
    return pilot(intro+position+'. Heading '+hdg+'° true'+altitude+'.',
      'reportIntro',...parts,'heading',...digits(hdg),'true',...(s.onGround?[]:alt.parts));
  }
  function answer(kind,s,reported) {
    if(kind==='check')return {line:tower('Vector 21, Cape Tower. Reading you loud and clear.','check'),
      ack:pilot('Loud and clear, Vector 21.','checkAck')};
    if(kind==='recovery')return {line:exchanges.recovery[1],
      ack:pilot('Returning to the ship, Vector 21.','recAck')};
    if(kind==='position')return {line:tower('Vector 21, position report received.','posReceived')};
    if(kind==='altitude'){
      const alt=altitudeReading(s);
      if(reported&&Math.abs(alt.feet-reported.feet)>=50){
        const trendClip=alt.trend==='On deck'?'deck':alt.trend.toLowerCase();
        return {line:tower('Vector 21, altitude copied. Now reading '+alt.text+'. '+alt.trend+'.',
          'altLive',...alt.parts,trendClip)};
      }
      return {line:tower('Vector 21, altitude copied.','altReceived')};
    }
    const wx=s.windX||0,wz=s.windZ||0,knots=Math.round(Math.hypot(wx,wz)*1.94384449);
    if(knots===0)return {line:tower('Vector 21, surface wind calm.','calm'),
      ack:pilot('Calm wind copied, Vector 21.','calmAck')};
    const heading=direction(Math.atan2(-wx,wz)),hdg=digits(heading),speed=digits(knots);
    return {line:tower('Vector 21, surface wind from '+heading+'° true at '+knots+' kt.','wind',...hdg,'trueAt',...speed,knots===1?'ktOne':'kt'),
      ack:pilot('Wind '+heading+'° true at '+knots+' kt copied, Vector 21.','windAck',...hdg,'trueAt',...speed,knots===1?'knotAck':'knotsAck')};
  }

  function stopVoice(){
    waitingVoice=null;
    for(const src of sources){src.onended=null;try{src.stop();}catch{}src.disconnect();}
    sources.clear();
  }
  function duration(line){
    return line.clips.reduce((total,key)=>total+(cues[key]?cues[key][1]/1000+.023:0),.06);
  }
  function schedule(src,start,offset,span){
    sources.add(src);
    src.onended=()=>{sources.delete(src);src.disconnect();changed();};
    src.start(start,offset,span);
  }
  function playPending(){
    if(!waitingVoice||!buffer||!enabled||paused||context?.state!=='running')return;
    const {line,expires}=waitingVoice;waitingVoice=null;
    if(clock>expires||!line.clips.every(k=>cues[k]))return;
    let start=context.currentTime+.024;
    const squelch=()=>{
      const src=context.createBufferSource();src.buffer=noise;src.connect(outlet);schedule(src,start,0,noise.duration);
    };
    squelch();start+=.034;
    for(const key of line.clips){
      const [ms,length]=cues[key],span=Math.min(length/1000,buffer.duration-ms/1000);
      if(span<=0)continue;
      const src=context.createBufferSource();src.buffer=buffer;src.connect(outlet);
      schedule(src,start,ms/1000,span);start+=span+.023;
    }
    squelch();changed();
  }
  function prepare(){
    if(!enabled||!hasVoice())return;
    try{
      if(!context){
        const Audio=audioConstructor();context=new Audio();
        outlet=context.createGain();outlet.gain.value=.84;outlet.connect(context.destination);
        noise=context.createBuffer(1,Math.ceil(context.sampleRate*.034),context.sampleRate);
        const data=noise.getChannelData(0);let prev=0;
        for(let i=0;i<data.length;i++){
          const w=Math.random()*2-1;prev+=.36*(w-prev);
          data[i]=prev*.045*Math.sin(Math.PI*i/data.length)*Math.exp(-2.8*i/data.length);
        }
      }
      if(!paused)context.resume().then(()=>{audioBlocked=false;playPending();changed(true);},()=>{audioBlocked=true;changed(true);});
      if(!buffer&&!loading){
        loading=true;
        const encoded=atob(bankURL.slice(bankURL.indexOf(',')+1));
        const bytes=new Uint8Array(encoded.length);
        for(let i=0;i<bytes.length;i++)bytes[i]=encoded.charCodeAt(i);
        context.decodeAudioData(bytes.buffer).then(value=>{
          buffer=value;loading=false;playPending();changed(true);
        },()=>{codecFailed=true;loading=false;waitingVoice=null;changed(true);});
      }
    }catch{audioBlocked=true;loading=false;changed(true);}
  }
  function publish(line,state) {
    stopVoice();
    const entry=Object.freeze({role:line.role,text:line.text,time:Number.isFinite(state?.time)?state.time:clock});
    history.push(entry);if(history.length>14)history.shift();
    const voice=enabled&&hasVoice()&&!audioBlocked;
    const readingTime=Math.min(5,Math.max(1.65,line.text.length*.055));
    const hold=voice?Math.max(readingTime,duration(line)):readingTime;
    release=clock+hold+(line.role==='PILOT' ? .35 : .22);
    if(voice){waitingVoice={line,expires:clock+hold};playPending();}
    onLine(entry);changed(true);
  }
  const requests={
    wind:'Request surface wind.',check:'Radio check.',recovery:'Request return to the ship.'
  };
  function canRecover(s){
    return !s.onGround&&!['parked','taxi','roll','return','falling','crashed'].includes(s.phase);
  }
  function call(kind,state){
    if(!commands.has(kind)||paused||!state||state.phase==='crashed'||busy())return false;
    if(kind==='recovery'&&!canRecover(state))return false;
    if(kind==='ack'){
      if(!lastTower||lastTower.acknowledged)return false;
      lastTower.acknowledged=true;publish(lastTower.ack,state);return true;
    }
    if(kind==='repeat'&&!lastTower)return false;
    if(clock-(recentCalls.get(kind)??-Infinity)<1.25)return false;
    recentCalls.set(kind,clock);
    const report=kind==='position'||kind==='altitude';
    const reading=report?altitudeReading(state):null;
    nextTurn={kind,reported:reading,repeat:kind==='repeat'?lastTower:null};
    const line=report?pilotReport(kind,state,reading):kind==='repeat'?pilot('Cape Tower, say again for Vector 21.','repeat'):
      pilot('Cape Tower, Vector 21. '+requests[kind],kind);
    publish(line,state);
    return true;
  }
  function pushTower(reply,state){
    lastTower={line:reply.line,ack:reply.ack||pilot('Roger, Vector 21.','ack'),acknowledged:false};
    publish(reply.line,state);
  }
  function relevant(kind,s){
    if(s.phase==='crashed'||s.phase==='falling')return false;
    switch(kind){
      case 'startup': case 'taxi': case 'abort': return s.phase==='taxi';
      case 'takeoff': return s.onGround&&s.phase==='roll';
      case 'vertical': return s.onGround&&s.phase==='liftoff';
      case 'airborne': return !s.onGround&&s.phase!=='return';
      case 'cruise': case 'hover': return s.phase==='free'&&s.mode===kind;
      case 'recovery': return s.phase==='return';
      case 'final': case 'shortFinal': return onFinal&&!s.onGround;
      case 'cancel': return s.phase==='free'&&!onFinal;
      case 'land': return s.onGround;
      case 'shutdown': return s.phase==='parked';
    }
    return false;
  }
  function beginPending(state){
    while(pending.length){
      const item=pending[0];
      if(!relevant(item.kind,state)){pending.shift();continue;}
      if(clock<item.due)return;
      pending.shift();
      if(item.kind==='shortFinal'){
        nextTurn={auto:'final',readback:true};
        pushTower({line:exchanges.final[1],ack:exchanges.final[2]},state);
      }else{
        nextTurn={auto:item.kind};publish(exchanges[item.kind][0],state);
      }
      return;
    }
  }
  function insideFinal(state){
    const p=state.position;
    return p&&p.y<110&&Math.hypot(home.x-p.x,home.z-p.z)<245;
  }
  function event(kind,state){
    if(paused||!state)return false;
    if(kind==='crash'||kind==='water'){
      if(milestones.has('lost'))return false;
      milestones.add('lost');pending.length=0;nextTurn=deferredReply=null;onFinal=false;
      pushTower({line:tower(kind==='water'?'Cape Tower. Water contact observed. Exercise stopped.':'Cape Tower. Contact lost. Exercise stopped.',kind)},state);
      return true;
    }
    if(!Object.hasOwn(exchanges,kind))return false;
    const launch=kind==='takeoff'||kind==='vertical';
    if(launch||kind==='startup'){
      milestones.clear();taxiReported=false;onFinal=finalCanceled=false;
    }
    if(kind==='land'||kind==='airborne'){
      if(milestones.has(kind))return false;
      milestones.add(kind);
    }
    if(kind==='cancel'||kind==='land'||kind==='recovery'){
      onFinal=false;finalCanceled=kind==='cancel';
    }
    const shortArrival=kind==='recovery'&&busy()&&insideFinal(state);
    if(kind==='land'||kind==='abort')taxiReported=true;
    // Give clearances the next gap between speakers. Resume the outstanding routine reply after the deck exchange.
    if((launch||['abort','recovery','final','land','cancel'].includes(kind))&&nextTurn?.kind){
      deferredReply=nextTurn;nextTurn=null;
    }
    // Already over the deck with a busy frequency: the tower initiates clearance, and the pilot reads it back.
    if(shortArrival){onFinal=true;kind='shortFinal';}
    // A return requested over the deck can enter final before the tower has answered the pilot.
    if(kind==='final'&&(nextTurn?.auto==='recovery'||pending.some(p=>p.kind==='recovery')))return true;
    // Discard obsolete clearances at the transition, even if the pilot switches back a frame later.
    for(let i=pending.length-1;i>=0;i--)if(!relevant(pending[i].kind,state))pending.splice(i,1);
    const departingReply=kind==='airborne'&&['takeoff','vertical'].includes(nextTurn?.auto);
    if(nextTurn?.auto&&!relevant(nextTurn.auto,state)&&!departingReply)nextTurn=null;
    if(kind==='airborne'&&departingReply){
      nextTurn={auto:'airborne'};return true;
    }
    if(!relevant(kind,state)||pending.some(p=>p.kind===kind)||nextTurn?.auto===kind)return false;
    const settle=kind==='hover'||kind==='cruise' ? 1 : 0;
    pending.push({kind,due:clock+settle});
    if(!busy())beginPending(state);
    return true;
  }
  function observe(state){
    if(state.phase==='taxi'&&!taxiReported&&state.speed>1.2){
      taxiReported=true;event('taxi',state);
    }
    if(!state.position||state.onGround||(state.phase!=='return'&&state.phase!=='free'))return;
    const dx=home.x-state.position.x,dz=home.z-state.position.z,dist=Math.hypot(dx,dz);
    const height=state.position.y;
    if(finalCanceled){
      if(dist<180&&height<110&&state.vy<-.35)return;
      finalCanceled=false;
    }
    if(onFinal){
      if(state.phase==='free'&&(dist>220||height>125||state.vy>3)){
        onFinal=false;event('cancel',state);
      }
      return;
    }
    const inbound=dist<28||dx*state.vx+dz*state.vz>dist;
    const approaching=state.phase==='return'?insideFinal(state):
      dist<145&&height<85&&state.gear>.7&&state.vy<-.7&&inbound;
    if(approaching){onFinal=true;event('final',state);}
  }
  function step(state,dt){
    if(paused||!state)return;
    clock+=Math.max(0,Number.isFinite(dt)?dt:0);
    observe(state);
    if(nextTurn&&clock>=release&&!speaking()){
      const turn=nextTurn;nextTurn=null;
      if(state.phase==='crashed'){changed(true);return;}
      if(turn.auto){
        if(relevant(turn.auto,state)){
          const replyKind=turn.auto==='recovery'&&onFinal?'final':turn.auto;
          const [,line,ack]=exchanges[replyKind];
          if(turn.readback){lastTower.acknowledged=true;publish(ack,state);}
          else{
            if(ack)nextTurn={auto:replyKind,readback:true};
            pushTower({line,ack},state);
          }
          return;
        }
      }else if(turn.kind==='repeat'){pushTower(turn.repeat,state);return;}
      else if(turn.kind==='recovery'&&state.onGround){
        pushTower({line:exchanges.land[1]},state);
      }else if(turn.kind==='recovery'&&state.phase==='falling'){
        changed(true);
      }else pushTower(answer(turn.kind,state,turn.reported),state);
    }
    if(!busy()){
      beginPending(state);
      if(!busy()&&deferredReply){nextTurn=deferredReply;deferredReply=null;}
    }
    changed();
  }
  function reset(){
    stopVoice();history.length=pending.length=0;lastTower=nextTurn=deferredReply=null;onFinal=finalCanceled=taxiReported=false;
    recentCalls.clear();milestones.clear();clock=release=0;changed(true);
  }
  function setEnabled(value){
    enabled=Boolean(value);
    if(enabled){prepare();}
    else{
      stopVoice();release=Math.min(release,clock+.35);
      if(context)context.suspend().catch(()=>{});
    }
    changed(true);return enabled&&hasVoice();
  }
  function suspend(value){
    const next=Boolean(value);if(next===paused)return;
    paused=next;
    if(context&&enabled){
      if(paused)context.suspend().catch(()=>{});
      else prepare();
    }
    changed(true);
  }
  return {
    call,event,step,reset,setEnabled,suspend,repeat:state=>call('repeat',state),
    get log(){return history.slice();}, get busy(){return busy();},get enabled(){return enabled;},
    get hasVoice(){return hasVoice();},
    get voiceStatus(){return !hasVoice()?'unavailable':!enabled?'muted':audioBlocked?'blocked':buffer?'ready':'loading';},
    get canAcknowledge(){return Boolean(lastTower&&!lastTower.acknowledged);},
    get canRepeat(){return Boolean(lastTower);}
  };
}
