function createFlightAudio() {
  let context = null;
  let voice = null;
  let enabled = false;
  let paused = false;
  let suspendTimer = 0;
  let transition = 0;
  let lastMix = -Infinity;

  function createVoice(ctx) {
    function gain(level, destination) {
      const node = ctx.createGain();
      node.gain.value = level;
      node.connect(destination);
      return node;
    }

    function filter(type, frequency, destination) {
      const node = ctx.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = 0.63;
      node.connect(destination);
      return node;
    }

    function rotor(partials, frequency, output) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(ctx.createPeriodicWave(
        new Float32Array(partials.length), Float32Array.from(partials)
      ));
      osc.frequency.value = frequency;
      osc.connect(output);
      osc.start();
      return osc.frequency;
    }

    const output = gain(0, ctx.destination);
    const mix = filter('highpass', 34, output);
    const propulsion = gain(0, mix);
    const sampleRate = 22050;
    const noise = ctx.createBuffer(2, sampleRate * 4, sampleRate);
    for (let channel = 0; channel < noise.numberOfChannels; channel++) {
      const samples = noise.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = 2 * Math.random() - 1;
        low += 0.075 * (white - low);
        samples[i] = 0.58 * white + 0.9 * low;
      }
    }

    function loopNoise(destination, offset, rate) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.playbackRate.value = rate;
      source.connect(destination);
      source.start(0, offset);
    }

    const windLevel = gain(0.05, mix);
    const windCut = filter('lowpass', 600, windLevel);
    loopNoise(filter('highpass', 96, windCut), 0, 0.83);

    const jetLevel = gain(0.07, propulsion);
    const jetCut = filter('lowpass', 430, jetLevel);
    loopNoise(jetCut, 2.17, 0.94);

    const turbineLevel = gain(0.01, propulsion);
    const turbinePitch = rotor([0, 0.8, 0.09, 0.21, 0.035], 84, turbineLevel);
    const whineLevel = gain(0.003, propulsion);
    const whinePitch = rotor([0, 1, 0.09, 0.035], 414, whineLevel);

    const fanLevel = gain(0, propulsion);
    const fanCut = filter('lowpass', 600, fanLevel);
    const fanChop = gain(0.74, fanCut);
    loopNoise(fanChop, 0.73, 1.09);
    const blades = ctx.createOscillator();
    blades.frequency.value = 24;
    blades.connect(gain(0.25, fanChop.gain));
    blades.start();
    const fanToneLevel = gain(0, propulsion);
    const fanPitch = rotor([0, 0.55, 0.17, 0.28, 0.08, 0.06], 48, fanToneLevel);

    return {
      output, mix, propulsion, noise, windLevel, windCut, jetLevel, jetCut, turbineLevel, turbinePitch,
      whineLevel, whinePitch, fanLevel, fanCut, blades, fanToneLevel, fanPitch
    };
  }

  function syncPlayback() {
    if (!context || !voice) return;
    clearTimeout(suspendTimer);
    const ticket = ++transition;
    const ctx = context;
    const now = ctx.currentTime;
    const volume = voice.output.gain;
    volume.cancelScheduledValues(now);
    if (enabled && !paused) {
      lastMix = -Infinity;
      volume.setTargetAtTime(0.64, now, 0.038);
      // Calling resume even during a pending suspend keeps quick toggles ordered.
      ctx.resume().catch(() => {
        if (ticket === transition) {
          enabled = false;
          syncPlayback();
        }
      });
    } else {
      volume.setTargetAtTime(0, now, 0.022);
      voice.propulsion.gain.cancelScheduledValues(now);
      voice.propulsion.gain.setTargetAtTime(0, now, 0.017);
      suspendTimer = setTimeout(() => {
        if (ticket === transition && ctx.state !== 'closed') ctx.suspend().catch(() => {});
      }, 155);
    }
  }

  function setEnabled(value) {
    const next = Boolean(value);
    if (next && !voice) {
      try {
        const Audio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!Audio) return false;
        context = new Audio();
        voice = createVoice(context);
      } catch {
        if (context) context.close().catch(() => {});
        context = null;
        return false;
      }
    }
    enabled = next;
    syncPlayback();
    return enabled;
  }

  function update(state) {
    if (!enabled || paused || !voice || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - lastMix < 0.045) return;
    lastMix = now;
    const clamp = (value, high) => Math.max(0, Math.min(high, Number(value) || 0));
    const power = clamp(state.thrust, 1);
    const engine = clamp(state.engine ?? (state.onGround ? 0 : 1), 1);
    const boost = clamp(state.boost,1)*(1-Math.sin(clamp(state.nozzle,Math.PI/2)));
    const speed = clamp(Math.abs(state.speed) / 120, 1);
    const lift = Math.sin(clamp(state.nozzle, Math.PI / 2));
    const ground = state.onGround ? 1 : Math.exp(-clamp(state.agl, 600) / 18);
    const time = Number(state.time) || 0;
    const swell = 0.5 + 0.5 * Math.sin(time * 0.64 + 0.7 * Math.sin(time * 0.27));
    const follow = (param, target, lag = 0.24) => param.setTargetAtTime(target, now, lag);

    follow(voice.propulsion.gain, engine, engine>0 ? 0.095 : 0.020);
    follow(voice.windLevel.gain, 0.06 + 0.03 * swell * ground + 0.19 * speed, 0.5);
    follow(voice.windCut.frequency, 570 + 125 * swell + 1750 * speed, 0.45);
    follow(voice.jetLevel.gain, 0.065 + power * (0.47 - 0.13 * lift) + .11*boost);
    follow(voice.jetCut.frequency, 400 + 1520 * power - 380 * lift * power + 540*boost);
    follow(voice.turbinePitch, 82 + 125 * power + 14*boost, 0.4);
    follow(voice.turbineLevel.gain, 0.008 + 0.019 * power);
    follow(voice.whinePitch, 410 + 433 * power, 0.55);
    follow(voice.whineLevel.gain, 0.0028 + 0.008 * power);
    follow(voice.fanLevel.gain, lift * power * (0.27 + 0.22 * ground));
    follow(voice.fanCut.frequency, 420 + 640 * power + 240 * ground);
    follow(voice.blades.frequency, 20 + 24 * power);
    follow(voice.fanPitch, 45 + 31 * power, 0.35);
    follow(voice.fanToneLevel.gain, lift * power * (0.034 + 0.015 * ground));
  }

  const calls = {
    takeoff: [466, 622],
    mode: [554],
    land: [622, 415],
    gate: [622, 831]
  };

  // Each layer specifies duration, noise filter sweep, level and body pitch sweep.
  // A second layer can start later and swell for longer than the initial strike.
  const impacts = {
    hit:     [[.16, 2600, 570, .25, 310, 120]],
    crash:   [[.68, 1120, 100, .58, 112, 39]],
    launch:  [[.27, 430, 1790, .22, 190, 480]],
    water:   [[.59, 1730, 280, .43, 169, 64]],
    missile: [[.13, 1900, 540, .30, 134, 62], [.53, 2550, 320, .34, 92, 46, .028, .065]],
    flare:   [[.080, 4700, 1300, .25, 290, 138], [.24, 5800, 1800, .16, 205, 104, .072]],
    knockout:[[.21, 3300, 460, .40, 158, 57], [.68, 880, 92, .40, 79, 37, .055, .037]]
  };
  function transient(profile) {
    const [duration,from,to,level,pitch,endPitch,delay=0,attack=.012]=profile;
    const now=context.currentTime+delay;
    const source=context.createBufferSource(), filter=context.createBiquadFilter();
    const burst=context.createGain(),tone=context.createOscillator(),body=context.createGain();
    source.buffer=voice.noise;
    filter.type='lowpass';filter.Q.value=.63;
    filter.frequency.setValueAtTime(from,now);
    filter.frequency.exponentialRampToValueAtTime(to,now+duration);
    burst.gain.setValueAtTime(.0001,now);
    burst.gain.exponentialRampToValueAtTime(level,now+attack);
    burst.gain.exponentialRampToValueAtTime(.0002,now+duration);
    body.gain.setValueAtTime(.0001,now);
    body.gain.exponentialRampToValueAtTime(level*.12,now+.009);
    body.gain.exponentialRampToValueAtTime(.0001,now+duration*.8);
    tone.frequency.setValueAtTime(pitch,now);
    tone.frequency.exponentialRampToValueAtTime(endPitch,now+duration*.74);
    source.connect(filter).connect(burst).connect(voice.mix);
    tone.connect(body).connect(voice.mix);
    source.onended=()=>{source.disconnect();filter.disconnect();burst.disconnect();};
    tone.onended=()=>{tone.disconnect();body.disconnect();};
    source.start(now,.42+delay*7);source.stop(now+duration);
    tone.start(now);tone.stop(now+duration*.82);
  }

  function cue(kind) {
    if (!enabled || paused || !voice) return;
    if (Object.prototype.hasOwnProperty.call(impacts,kind)) { impacts[kind].forEach(transient); return; }
    const notes = calls[kind];
    if (!Array.isArray(notes)) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const envelope = context.createGain();
    osc.type = 'sine';
    envelope.gain.value = 0;
    osc.connect(envelope);
    envelope.connect(voice.mix);
    notes.forEach((note, index) => {
      const t = now + index * 0.092;
      osc.frequency.setValueAtTime(note, t);
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(0.036, t + 0.007);
      envelope.gain.exponentialRampToValueAtTime(0.0002, t + 0.08);
    });
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
    osc.start(now);
    osc.stop(now + notes.length * 0.092);
  }

  return {
    setEnabled, update, cue,
    suspend(value) {
      if (paused === Boolean(value)) return;
      paused = Boolean(value);
      syncPlayback();
    },
    get enabled() { return enabled; }
  };
}
