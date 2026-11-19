function createTowerConsole(state,home,onRecovery,toggleSound,focusFlight){
  const el=id=>document.getElementById(id),panel=el("comPanel"),log=el("comLog");
  const toggle=el("comToggle"),voice=el("comVoice"),caption=el("comCaption");
  const buttons=Array.from(el("comCommands").querySelectorAll("button"));
  let radio,opened=false,enabled=false,expiry=-1,lastLine=null,refreshIn=0;
  function channels(){
    if(!radio)return;
    el("comStatus").textContent=radio.busy?"通话中":"频道空闲";
    for(const b of buttons){
      const kind=b.dataset.call;
      b.disabled=(radio.busy&&kind!=="recovery") || state.phase==="crashed" ||
        (kind==="recovery"&&(state.onGround||state.phase==="return"||state.phase==="falling")) ||
        (kind==="ack"&&!radio.canAcknowledge)||(kind==="repeat"&&!radio.canRepeat);
    }
    caption.hidden=opened||!lastLine||state.time>=expiry;
    el("app").classList.toggle("com-speaking",!caption.hidden);
    const status=radio.voiceStatus;
    voice.textContent=!enabled?"开启声音":status==="blocked"||status==="unavailable"?"仅字幕":status==="loading"?"载入语音":"声音开";
  }
  function line(entry){
    if(!entry||!entry.text)return;
    const pinned=log.scrollHeight-log.scrollTop-log.clientHeight<12;
    const item=document.createElement("div"),meta=document.createElement("div"),role=document.createElement("b"),time=document.createElement("time"),copy=document.createElement("p");
    const seconds=Math.floor(Number(entry.time)||0),who=entry.role==="PILOT"?"VECTOR 21":"CAPE TOWER";
    item.className="com-line";item.dataset.role=entry.role;role.textContent=who;
    time.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
    meta.append(role,time);copy.textContent=entry.text;item.append(meta,copy);log.append(item);
    if(log.children.length>14)log.firstElementChild.remove();
    if(pinned||!opened)log.scrollTop=log.scrollHeight;
    lastLine=entry;
    el("captionRole").textContent=who;el("captionText").textContent=entry.text;
    expiry=state.time+Math.min(10,Math.max(4,entry.text.length*.077));channels();
  }
  radio=createTowerRadio({home,onLine:line,onChange:channels});
  function show(value){
    opened=value;panel.hidden=!value;toggle.setAttribute("aria-expanded",String(value));
    el("app").classList.toggle("com-open",value);
    if(value)log.scrollTop=log.scrollHeight;
    channels();focusFlight();
  }
  function call(kind){
    const button=buttons.find(b=>b.dataset.call===kind);
    if(button?.disabled)return;
    if(kind==="recovery"){onRecovery();channels();focusFlight();return;}
    const accepted=radio.call(kind,state);
    channels();
    if(!accepted&&kind==="ack"&&!radio.busy)el("comStatus").textContent="已确认";
    focusFlight();
  }
  for(const b of buttons)b.addEventListener("click",()=>call(b.dataset.call));
  toggle.addEventListener("click",()=>show(!opened));el("comClose").addEventListener("click",()=>show(false));
  voice.addEventListener("click",()=>{toggleSound();focusFlight();});
  function setSound(value){
    enabled=Boolean(value);radio.setEnabled(enabled);voice.setAttribute("aria-pressed",String(enabled));
    channels();
  }
  function key(code){
    if(code==="KeyY"){show(!opened);return true;}
    if(!opened)return false;
    if(code==="Escape"){show(false);return true;}
    const n=/^(?:Digit|Numpad)([1-7])$/.exec(code);
    if(n){call(buttons[Number(n[1])-1].dataset.call);return true;}
    return false;
  }
  function reset(){
    lastLine=null;expiry=-1;log.replaceChildren();radio.reset();refreshIn=0;channels();
  }
  function step(dt){
    radio.step(state,dt);
    refreshIn-=dt;if(refreshIn<=0){channels();refreshIn=.18;}
  }
  return {reset,step,key,setSound,event:kind=>radio.event(kind,state),suspend:value=>radio.suspend(value)};
}
