/* Heading-up arcade radar. Its single contact is the other aircraft in the match. */
function createDuelRadar(stage) {
  const panel = document.createElement('section');
  panel.className = 'duel-radar';
  panel.setAttribute('aria-label', '对战雷达，机头朝上');
  panel.hidden = true;
  panel.innerHTML = `
    <header><strong>对战雷达</strong><span class="radar-scale"></span></header>
    <div class="radar-body">
      <canvas width="224" height="224" aria-hidden="true"></canvas>
      <div class="radar-readings">
        <span class="radar-contact">敌机</span>
        <b class="radar-distance"></b>
        <span class="radar-bearing"></span>
        <span class="radar-altitude"></span>
      </div>
    </div>`;
  stage.appendChild(panel);
  const ctx = panel.querySelector('canvas').getContext('2d');
  const scaleText = panel.querySelector('.radar-scale');
  const distanceText = panel.querySelector('.radar-distance');
  const bearingText = panel.querySelector('.radar-bearing');
  const altitudeText = panel.querySelector('.radar-altitude');
  const tau = 2 * Math.PI, cx = 56, cy = 56, radius = 49;
  let range = 125;

  function write(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
  function distanceLabel(metres) {
    return metres < 1000 ? Math.round(metres) + ' m' : (metres / 1000).toFixed(1) + ' km';
  }
  function circle(r, color) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, tau);
    ctx.stroke();
  }
  function scope(time) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 112, 112);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, tau);
    ctx.fillStyle = '#102523';
    ctx.fill();
    // Draw from simulation time so the scope freezes while the game is paused.
    const angle = time * 1.5 - Math.PI / 2;
    const sweepWidth = .60;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle - sweepWidth + i * .10, angle - sweepWidth + (i + 1) * .10);
      ctx.closePath();
      ctx.fillStyle = 'rgba(121,222,186,' + (.018 + i * .018) + ')';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.strokeStyle = '#5c9984';
    ctx.lineWidth = .8;
    ctx.stroke();
    circle(radius / 2, '#365751');
    circle(radius, '#6d9286');
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
    ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
    ctx.strokeStyle = '#365751';
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * tau / 12, dx = Math.sin(a), dy = -Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(cx + dx * (radius - 3), cy + dy * (radius - 3));
      ctx.lineTo(cx + dx * radius, cy + dy * radius);
      ctx.strokeStyle = i % 3 ? '#57776c' : '#bedbcc';
      ctx.stroke();
    }
    // The ownship symbol stays pointed toward the top (12 o'clock).
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 3.8, cy + 4.5);
    ctx.lineTo(cx, cy + 2.4); ctx.lineTo(cx - 3.8, cy + 4.5);
    ctx.closePath();
    ctx.fillStyle = '#b6f4dd';
    ctx.fill();
  }
  function drawContact(x, y) {
    ctx.beginPath();
    ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y);
    ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 4.5, y);
    ctx.closePath();
    ctx.fillStyle = '#873d35';
    ctx.fill();
    ctx.strokeStyle = '#ffac92';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }
  function update(s, enabled, rival) {
    const visible = Boolean(enabled && rival);
    if (panel.hidden === visible) {
      panel.hidden = !visible;
      stage.classList.toggle('has-duel-radar', visible);
    }
    if (!visible) { range = 125; return; }
    scope(s.time);
    const p = s.position, target = rival.position;
    const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
    const horizontal = Math.hypot(dx, dz);
    // Leave margin between successive scale changes so a circling contact stays legible.
    while (horizontal > range * .94) range *= 2;
    while (range > 125 && horizontal < range * .38) range /= 2;
    const heading = s.displayHeading ?? s.heading;
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const right = dx * cos + dz * sin, ahead = dx * sin - dz * cos;
    drawContact(cx + radius * right / range, cy - radius * ahead / range);
    const clock = (Math.round(Math.atan2(right, ahead) * 12 / tau) + 12) % 12 || 12;
    const relativeHeight = Math.round(dy);
    write(distanceText, distanceLabel(Math.hypot(horizontal, dy)));
    write(bearingText, horizontal < 1 ? '垂直重合' : clock + ' 点钟');
    write(altitudeText, relativeHeight === 0 ? '同高度' :
      (relativeHeight > 0 ? '高 ' : '低 ') + distanceLabel(Math.abs(relativeHeight)));
    write(scaleText, '量程 ' + distanceLabel(range));
  }
  return { update };
}
