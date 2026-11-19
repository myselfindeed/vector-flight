// One small contact flash, a spray of cooling metal and a short wisp of smoke.
function createDuelImpact(T, root) {
  const duration = .83;
  const geometry = new T.BufferGeometry();
  const vertices = [], motions = [], traits = [], indices = [];
  // Draw smoke first so the contact and hot particles stay crisp.
  const kinds = [...Array(7).fill(0), ...Array(5).fill(1), ...Array(12).fill(2), 3];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i], seed = ((i + 1) * .618034) % 1;
    const angle = i * 2.39996, radius = kind === 0 ? 1.6 : 5 + 11 * seed;
    const speed = [Math.cos(angle) * radius, Math.sin(angle) * radius, kind === 0 ? .9 : 3 + 7 * (1 - seed)];
    const delay = kind === 0 ? i * .026 : 0;
    const life = kind === 0 ? .51 + .16 * seed : kind === 3 ? .115 : .24 + .16 * seed;
    const first = vertices.length / 3;
    for (const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      vertices.push(x, y, 0);
      motions.push(...speed);
      traits.push(kind, seed, delay, life);
    }
    indices.push(first, first+1, first+2, first, first+2, first+3);
  }
  geometry.setIndex(indices);
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('motion', new T.Float32BufferAttribute(motions, 3));
  geometry.setAttribute('trait', new T.Float32BufferAttribute(traits, 4));

  const viewport = new T.Vector4();
  function cloud(name) {
    const material = new T.ShaderMaterial({
      uniforms: {
        age: {value: 0}, airspeed: {value: new T.Vector3()},
        attached: {value: new T.Vector3()}, viewHeight: {value: 720}
      },
      transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `
        attribute vec3 motion;
        attribute vec4 trait;
        uniform float age, viewHeight;
        uniform vec3 airspeed, attached;
        varying vec2 q;
        varying float kind, seed, u;
        void main() {
          q = position.xy;
          kind = trait.x; seed = trait.y;
          float t = max(0., age - trait.z);
          u = t / trait.w;
          if (age < trait.z || u >= 1.) { gl_Position = vec4(2.,2.,2.,1.); return; }
          vec3 departure = mat3(modelMatrix) * motion;
          float drag = kind < .5 ? 5.5 : 1.8;
          float travel = (1. - exp(-drag*t)) / drag;
          vec3 offset = airspeed * (trait.z + travel) + departure * travel;
          offset.y += kind < .5 ? 1.8 * t : -3.9 * t*t;
          if (kind > 2.5) offset = attached;
          vec4 eye = viewMatrix * vec4(modelMatrix[3].xyz + offset, 1.);
          float pixel = max(.01, -2.*eye.z / (viewHeight * projectionMatrix[1][1]));
          vec2 axes;
          vec2 dir = vec2(1.,0.);
          if (kind < .5) {
            axes = vec2(.31 + (1.1 + .68*seed)*u, .29 + (1. + .31*seed)*u);
          } else if (kind < 1.5) {
            float spin = seed*18. + t*(9. + seed*20.);
            dir = vec2(cos(spin),sin(spin));
            axes = max(vec2(.22, .085) * (.7+seed), pixel*vec2(.95,.60));
          } else if (kind < 2.5) {
            vec3 move = mat3(viewMatrix) * (departure + .05*airspeed);
            vec2 projected = move.xy + eye.xy * move.z / max(.1,-eye.z);
            dir = normalize(projected + vec2(.0001,0.));
            axes = max(vec2((.35 + .63*seed)*(1.-.43*u), .065), pixel*vec2(1.45,.68));
          } else {
            axes = vec2(1.4,1.12) * (1.-.40*u);
          }
          eye.xy += q.x*axes.x*dir + q.y*axes.y*vec2(-dir.y,dir.x);
          gl_Position = projectionMatrix * eye;
        }`,
      fragmentShader: `
        varying vec2 q;
        varying float kind, seed, u;
        void main() {
          float r = length(q), a;
          vec3 ink;
          if (kind < .5) {
            float angle = atan(q.y, q.x + .00001);
            float edge = .80 + .11*sin(3.*angle + seed*24.) + .06*cos(5.*angle - seed*11.);
            a = (1.-smoothstep(.19, edge, r)) * (1.-u)*(1.-u) * .57;
            ink = mix(vec3(.052,.047,.045), vec3(.28,.27,.25), u + .13*r);
          } else if (kind < 1.5) {
            float edge = max(abs(q.x), abs(q.y + .28*q.x) + .29*q.x);
            a = (1.-smoothstep(.73,1.,edge))*(1.-smoothstep(.64,1.,u));
            ink = mix(vec3(.055,.057,.059), vec3(.43,.38,.27), step(0.,q.y+.32*q.x));
          } else if (kind < 2.5) {
            a = (1.-smoothstep(.23,1.,r))*(1.-u*u);
            ink = mix(vec3(.55,.16,.025), vec3(1.,.94,.65), (1.-u)*(1.-.65*r));
          } else {
            float core = exp(-12.*r*r);
            a = (core + .69*exp(-3.2*r*r)) * (1.-u*u)*(1.-smoothstep(.80,1.,r));
            ink = mix(vec3(.97,.34,.055),vec3(1.,1.,.90),core);
          }
          if (a < .008) discard;
          gl_FragColor = vec4(ink, min(1.,a));
          #include <colorspace_fragment>
        }`
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    mesh.onBeforeRender = renderer => { material.uniforms.viewHeight.value = renderer.getCurrentViewport(viewport).w; };
    root.add(mesh);
    return {mesh, center: new T.Vector3()};
  }

  const impacts = [cloud('我机受击'), cloud('敌机受击')];
  const normal = new T.Vector3(), local = new T.Vector3(), inverse = new T.Quaternion(), z = new T.Vector3(0,0,1);
  function burst(enemy, position, rotation, source, velocity) {
    const event = impacts[enemy ? 1 : 0], mesh = event.mesh, uniforms = mesh.material.uniforms;
    if (source) normal.subVectors(source, position);
    else normal.set(0, 0, 1);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    normal.normalize();
    local.copy(normal);
    if (rotation) local.applyQuaternion(inverse.copy(rotation).invert());
    // Place the flash on the facing side of the fuselage in aircraft-local coordinates.
    const extent = 1 / Math.hypot(local.x / 1.82, local.y / 1.02, local.z / (local.z < 0 ? 7.9 : 6.4));
    mesh.position.copy(position).addScaledVector(normal, extent + .16);
    mesh.quaternion.setFromUnitVectors(z, normal);
    mesh.rotateZ(Math.random() * 2 * Math.PI);
    event.center.copy(position);
    uniforms.attached.value.set(0,0,0);
    if (velocity) uniforms.airspeed.value.copy(velocity);
    else uniforms.airspeed.value.set(0,0,0);
    uniforms.age.value = 0;
    mesh.visible = true;
  }

  function step(dt, playerPosition, rivalPosition) {
    for (let i = 0; i < impacts.length; i++) {
      const {mesh,center} = impacts[i];
      if (!mesh.visible) continue;
      const uniforms = mesh.material.uniforms;
      uniforms.age.value += dt;
      mesh.visible = uniforms.age.value < duration;
      const position = i === 0 ? playerPosition : rivalPosition;
      if (position) uniforms.attached.value.subVectors(position, center);
    }
  }

  function reset() { for (const {mesh} of impacts) mesh.visible = false; }
  return {burst, step, reset, get visible() { return impacts[0].mesh.visible || impacts[1].mesh.visible; }};
}
