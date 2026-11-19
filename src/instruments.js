const iconPaths = {
  radio:["M9 21l3-10 3 10M9.7 18.5h4.6","M12 7.7v.1","M8.5 5a5.1 5.1 0 0 0 0 6.4m7-6.4a5.1 5.1 0 0 1 0 6.4","M5.6 2.9a8.1 8.1 0 0 0 0 10.7M18.4 2.9a8.1 8.1 0 0 1 0 10.7"],
  pip:["M3 4h18v16H3Z","M12 11h7v6h-7Z"],
  cockpit:["M2 17c0-7 4-12 10-12s10 5 10 12l-3 2H5Z","M3 15l5-3h8l5 3M9 17h6"],
  target:["M12 2v3m0 14v3M2 12h3m14 0h3","M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z","M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"],
  launch:["m3 16 17-12-6 17-3-7-8 2Z","m11 14 9-10"],
  pin: ["M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z","M14.4 10a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 1 1 4.8 0"],
  mute: ["M3 9h4l5-4v14l-5-4H3Z","m16 9 5 6m0-6-5 6"],
  sound: ["M3 9h4l5-4v14l-5-4H3Z","M15 9a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12"],
  keys: ["M3 5h18v14H3Z","M6 9h1m3 0h1m3 0h1m3 0h.1M6 12h1m3 0h1m3 0h1m3 0h.1M8 15h8"],
  pause: ["M8 5v14m8-14v14"], play:["m7 4 12 8-12 8Z"], close:["m5 5 14 14M19 5 5 19"],
  camera:["M3 7h4l2-3h6l2 3h4v13H3Z","M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],
  expand:["M13 4h7v7m0-7-7 7M10 20H4v-6"],
  shrink:["M20 4l-7 7m0-7v7h7M4 20l6-6m-6 0h6v6"],
  up:["M12 20V4m-6 7 6-7 6 7"],down:["M12 4v16m-6-7 6 7 6-7"],
  takeoff:["M12 16V3m-5 5 5-5 5 5M3 17v4h18v-4"],
  cruise:["M3 13h15m-5-6 6 6-6 6","M3 7h4m-4 12h4"],
  hover:["M3 17h18M12 14V4m-4 4 4-4 4 4","M6 21h12"],
  land:["M6 7h4a5 5 0 0 1 5 5v4m-4-4 4 4 4-4M4 20h16"],
  vector:["M4 5h6v4H4z","M10 7a7 7 0 0 1 7 7m-4-2 4 4 4-4M8 20h9"],
  mouse:["M5 10a7 7 0 0 1 14 0v4a7 7 0 0 1-14 0ZM12 5v5"],
};

function drawIcon(canvas, name) {
  const size = 48;
  canvas.dataset.icon = name;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.strokeStyle = getComputedStyle(canvas).color;
  ctx.lineWidth = name === "pause" ? 3 : 1.7;
  ctx.lineJoin = ctx.lineCap = "round";
  for (const path of iconPaths[name] || []) ctx.stroke(new Path2D(path));
}

function createInstruments() {
  const byId = id => document.getElementById(id);
  const bar = (id, count) => {
    const parent = byId(id);
    return Array.from({length: count}, () => parent.appendChild(document.createElement("i")));
  };
  const angleBars = bar("angleMeter", 15);
  const thrustBars = bar("thrustBars", 12);
  const fields = ["alt", "speed", "climb", "angle", "mode", "thrust", "location", "primaryLabel", "primaryKey",
    "routeLabel", "routeRange", "engineValue", "engineActionLabel", "gearValue", "flapValue", "fuel", "wind",
    "ammo", "hits", "targetValue", "targetAction", "actionLabel", "scoreLabel", "rangeHint", "loadFactor", "assistValue", "turnHint", "incidentTitle", "incidentScore"];
  const output = Object.fromEntries(fields.map(id => [id, byId(id)]));
  const compass = byId("compass"), ctx = compass.getContext("2d");
  let compassHeading = NaN, compassWidth = 0, compassHeight = 0, backingScale = 1;
  const cards = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function resize() {
    const r = compass.getBoundingClientRect();
    compassWidth = Math.round(r.width);
    compassHeight = Math.round(r.height);
    backingScale = Math.min(2, window.devicePixelRatio || 1);
    compass.width = Math.round(compassWidth * backingScale);
    compass.height = Math.round(compassHeight * backingScale);
    compassHeading = NaN;
  }
  function heading(radians) {
    const deg = (radians * 180 / Math.PI % 360 + 360) % 360;
    if (Math.abs(deg - compassHeading) < .12) return;
    compassHeading = deg;
    const w = compassWidth, h = compassHeight, mid = w * .5;
    const px = w < 180 ? 2.8 : 3.6, span = w / (2 * px);
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.shadowColor = "#172021"; ctx.shadowBlur = 3;
    for (let tick = Math.floor((deg - span)/5) * 5; tick < deg + span; tick += 5) {
      const label = (tick % 360 + 360) % 360, x = mid + (tick - deg) * px;
      const alpha = Math.min(1, Math.min(x, w - x) / 20);
      if (alpha <= 0) continue;
      ctx.fillStyle = "rgba(249,248,235," + (.88 * alpha) + ")";
      const major = label % 15 === 0;
      ctx.fillRect(Math.round(x), h*.46, 1.2, major ? 7 : 4);
      if (major) {
        ctx.font = label % 45 === 0 ? "bold 11px ui-monospace,monospace" : "9px ui-monospace,monospace";
        ctx.fillText(label % 45 === 0 ? cards[label / 45] : label.toString().padStart(3,"0"), x, h*.38);
      }
    }
    ctx.shadowBlur = 0;
    const y = h*.46 + 10;
    ctx.fillStyle="#ffb446"; ctx.beginPath(); ctx.moveTo(mid,y-6);ctx.lineTo(mid-3.3,y);ctx.lineTo(mid+3.3,y);ctx.fill();
    ctx.fillStyle="#20292add";ctx.fillRect(mid-20,y+1,40,15);
    ctx.fillStyle="#ffe0a4";ctx.font="bold 10px ui-monospace,monospace";ctx.fillText(String(Math.round(deg)%360).padStart(3,"0")+"°",mid,y+12);
  }
  function write(id, value) { const node=output[id]; if(node.textContent!==value)node.textContent=value; }
  function meter(bars, fraction) { const count = Math.round(fraction*bars.length); bars.forEach((b,i)=>b.classList.toggle("on",i<count)); }
  function radio(message) {
    byId("radioText").textContent = message;
    const node = byId("radioText").parentElement;
    node.classList.remove("flash"); void node.offsetWidth; node.classList.add("flash");
  }
  function buttonIcon(button, name) {
    const canvas = button.querySelector("canvas");
    if(canvas && canvas.dataset.icon !== name) drawIcon(canvas, name);
  }
  document.querySelectorAll("canvas[data-icon]").forEach(c => drawIcon(c, c.dataset.icon));
  resize();
  return {write, heading, resize, radio, buttonIcon, updateMeters(nozzle,thrust) {
    meter(angleBars,nozzle / (Math.PI/2)); meter(thrustBars,thrust);
  }};
}
