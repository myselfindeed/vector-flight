/* Original exterior model. Coordinates are local to the airframe, with the nose along -Z. */
function createAircraft(THREE) {
  const root = new THREE.Group();
  root.name = 'F-35B · 035';
  const tau = Math.PI * 2;
  const halfPi = Math.PI / 2;
  const clamp01 = n => Math.min(1, Math.max(0, n));
  const inputAxis=value=>Math.max(-1,Math.min(1,Number.isFinite(value)?value:0));
  const lerp = (a, b, t) => a + (b - a) * t;
  const v3 = p => new THREE.Vector3(p[0], p[1], p[2]);
  const groups = new Map();
  const scratch = new THREE.Object3D();
  const tone = new THREE.Color();

  // A low-frequency, mip-filtered variation in the paint catches broad patches of light.
  // Reflective materials use the same scene environment as the water and the airfield.
  const tileSize=128, paintData=new Uint8Array(tileSize*tileSize*4);
  function softNoise(x,y,period,seed){
    const u=x*period/tileSize,v=y*period/tileSize,ix=Math.floor(u),iy=Math.floor(v);
    const smooth=t=>t*t*(3-2*t);
    function value(a,b){let h=Math.imul((a%period)+seed,198491317)^Math.imul((b%period)+seed*2,6542989);
      h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
    return lerp(lerp(value(ix,iy),value(ix+1,iy),smooth(u-ix)),
      lerp(value(ix,iy+1),value(ix+1,iy+1),smooth(u-ix)),smooth(v-iy));
  }
  for(let y=0;y<tileSize;y++)for(let x=0;x<tileSize;x++){
    const i=(y*tileSize+x)*4;
    const pigment=Math.round(238+12*softNoise(x,y,4,11)+4*softNoise(x,y,13,31));
    paintData[i]=pigment;paintData[i+1]=pigment;paintData[i+2]=pigment;paintData[i+3]=255;
  }
  const paintMap=new THREE.DataTexture(paintData,tileSize,tileSize);
  paintMap.wrapS=paintMap.wrapT=THREE.RepeatWrapping;
  paintMap.minFilter=THREE.LinearMipmapLinearFilter;paintMap.magFilter=THREE.LinearFilter;
  paintMap.generateMipmaps=true;paintMap.colorSpace=THREE.SRGBColorSpace;paintMap.needsUpdate=true;
  const standard=(metalness,roughness,extra)=>new THREE.MeshStandardMaterial({
    vertexColors:true,metalness,roughness,envMapIntensity:.68,side:THREE.DoubleSide,...extra
  });
  const skin=standard(.27,.66,{map:paintMap});
  const metal=standard(.66,.54,{envMapIntensity:.79});
  const dark=standard(.12,.84,{envMapIntensity:.40});
  const trim = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide});
  const marker = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const seamMat = new THREE.LineBasicMaterial({vertexColors:true, transparent:true, opacity:.38, depthWrite:false});
  const paintedPatch=standard(.24,.70,{map:paintMap,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3});
  const colors = {
    top: 0x737c80, mid: 0x687276, side: 0x5e686b, belly: 0x555e60, nose: 0x7d8180,
    leading: 0x82888a, edge: 0x88908e, panel: 0x6f797c, panelDark: 0x626e72,
    seam: 0x485357, seamLight: 0x909792, well: 0x242a2b, lip: 0x888f91, rubber: 0x25282b
  };

  function group(parent, name, xyz = [0, 0, 0]) {
    const g = new THREE.Group(); g.name = name; g.position.set(...xyz); parent.add(g); return g;
  }
  // Only moving parts are kept as separate groups. The static pieces of each part are
  // packed by material, including paint colors, instead of issuing one draw per rivet.
  function bucket(parent, mat) {
    if (!groups.has(parent)) groups.set(parent, new Map());
    const byMaterial = groups.get(parent);
    if (!byMaterial.has(mat)) byMaterial.set(mat, {p: [], n: [], c: [], uv: []});
    return byMaterial.get(mat);
  }
  function shape(parent, geometry, mat, tint, pos, rot, scale, quaternion) {
    if (geometry.index) { const original = geometry; geometry = original.toNonIndexed(); original.dispose(); }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (pos || rot || scale || quaternion) {
      scratch.position.set(...(pos || [0,0,0])); scratch.rotation.set(...(rot || [0,0,0]));
      if (quaternion) scratch.quaternion.copy(quaternion);
      scratch.scale.set(...(scale || [1,1,1])); scratch.updateMatrix(); geometry.applyMatrix4(scratch.matrix);
    }
    const out = bucket(parent, mat), gp = geometry.attributes.position, gn = geometry.attributes.normal;
    const gc = geometry.attributes.color;
    tone.setHex(tint ?? 0xffffff);
    for (let n = 0; n < gp.count; n++) {
      const x=gp.getX(n), y=gp.getY(n), z=gp.getZ(n);
      const nx=gn.getX(n),ny=gn.getY(n),nz=gn.getZ(n);
      out.p.push(x,y,z);out.n.push(nx,ny,nz);
      if(mat.map===paintMap){
        if(Math.abs(ny)>=Math.max(Math.abs(nx),Math.abs(nz)))out.uv.push(x*.235,z*.235);
        else if(Math.abs(nx)>Math.abs(nz))out.uv.push(z*.235,y*.235);
        else out.uv.push(x*.235,y*.235);
      }
      if (gc) out.c.push(gc.getX(n), gc.getY(n), gc.getZ(n));
      else out.c.push(tone.r, tone.g, tone.b);
    }
    geometry.dispose();
  }
  function geom(points, indices, faceColors) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    if (indices) g.setIndex(indices);
    if (faceColors) g.setAttribute('color', new THREE.Float32BufferAttribute(faceColors.flat(), 3));
    g.computeVertexNormals(); return g;
  }
  function polygon(parent, points, mat, tint, outside) {
    if (outside) {
      const u=v3(points[1]).sub(v3(points[0])), v=v3(points[2]).sub(v3(points[0]));
      if(u.cross(v).dot(v3(outside))<0) points=points.slice().reverse();
    }
    // All callers use convex polygons, or individual panels of a piecewise-convex skin.
    const idx = []; for(let i=1; i<points.length-1; i++) idx.push(0,i,i+1);
    shape(parent, geom(points, idx), mat, tint);
  }
  function box(parent, p, dims, tint, mat=skin, rot) {
    shape(parent, new THREE.BoxGeometry(...dims), mat, tint, p, rot);
  }
  function ellipsoid(parent, p, size, tint, mat=skin, rot) {
    shape(parent, new THREE.SphereGeometry(1,18,12), mat, tint, p, rot, size);
  }
  function rod(parent, a, b, radius, tint, mat=metal, tipRadius=radius, steps=10) {
    const dir = v3(b).sub(v3(a)), len = dir.length(); if (len < 1e-6) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.divideScalar(len));
    shape(parent,new THREE.CylinderGeometry(tipRadius,radius,len,steps),mat,tint,v3(a).lerp(v3(b),.5).toArray(),null,null,q);
  }
  function line(parent, pts, tint=colors.seam) {
    const b = bucket(parent, seamMat); tone.setHex(tint);
    for(let i=1;i<pts.length;i++){b.p.push(...pts[i-1],...pts[i]); b.c.push(tone.r,tone.g,tone.b,tone.r,tone.g,tone.b);}
  }
  function closeLine(parent, pts, tint) {line(parent, [...pts, pts[0]], tint);}
  function cylinderZ(parent, z1,z2,r1,r2,tint,mat=metal,n=40, cx=0,cy=0) {
    rod(parent,[cx,cy,z1],[cx,cy,z2],r1,tint,mat,r2,n);
  }
  function ringZ(parent, stations, tint, mat=metal, count=48) {
    const pts=[],ix=[];
    for(const [z,r] of stations) for(let j=0;j<count;j++) {
      const a=tau*j/count; pts.push([Math.cos(a)*r,Math.sin(a)*r,z]);
    }
    for(let k=0;k<stations.length-1;k++) for(let j=0;j<count;j++) {
      const a=k*count+j,b=k*count+(j+1)%count,c=b+count,d=a+count;
      ix.push(a,b,d,b,c,d);
    }
    shape(parent,geom(pts,ix),mat,tint);
  }

  // Longitudinal stations describe the centerbody, chines and engine fairing.
  const stations = [
    [-8.03,.025,-.025,-.055,-.041],[-7.62,.22,.075,-.14,-.033],[-6.84,.54,.232,-.276,-.012],
    [-6.15,.75,.383,-.39,.01],[-5.47,.875,.48,-.47,.045],[-4.75,.96,.54,-.535,.089],
    [-3.75,1.045,.597,-.599,.12],[-3.12,1.19,.649,-.64,.15],[-2.5,1.47,.706,-.658,.162],
    [-2.05,1.62,.728,-.682,.168],[-.8,1.69,.739,-.68,.16],[.6,1.75,.731,-.658,.148],
    [1.68,1.71,.724,-.652,.127],[2.62,1.57,.695,-.636,.109],[3.42,1.38,.647,-.607,.074],
    [4.05,1.125,.60,-.586,.05],[4.54,.848,.567,-.56,.016],[4.98,.667,.557,-.55,-.008]
  ];
  const outline = s => {
    const [,w,top,base,chine]=s, upper=top-chine, lower=chine-base;
    const right=[[0,top],[w*.39,top-.052*upper],[w*.66,top-.235*upper],[w*.84,top-.56*upper],
      [w*.965,chine+.125*upper],[w,chine],[w*.95,chine-.29*lower],[w*.73,base+.24*lower],[w*.38,base+.04*lower],[0,base]];
    return [...right,...right.slice(1,-1).reverse().map(([x,y])=>[-x,y])];
  };
  function stationAt(z){
    if(z<=stations[0][0])return stations[0];
    for(let i=1;i<stations.length;i++)if(z<=stations[i][0]){
      const a=stations[i-1],b=stations[i],t=(z-a[0])/(b[0]-a[0]);return a.map((v,k)=>lerp(v,b[k],t));
    }
    return stations[stations.length-1];
  }
  function hullY(x,z,lower=false) {
    const o=outline(stationAt(z)); const side=lower ? o.slice(5,10).reverse() : o.slice(0,6);
    const v=Math.abs(x); for(let i=1;i<side.length;i++){
      const [ax,ay]=side[i-1],[bx,by]=side[i]; if(v<=bx) return lerp(ay,by,(v-ax)/Math.max(.0001,bx-ax));
    } return side[side.length-1][1];
  }
  function top(x,z,h=.009){return [x,hullY(x,z)+h,z];}
  function topLine(coords,tint){line(root,coords.map(([x,z])=>top(x,z,.016)),tint);}
  const rings=stations.map(st=>outline(st).map(([x,y])=>[x,y,st[0]]));
  const ringN=rings[0].length, bodyP=[],bodyI=[],bodyC=[];
  for(let i=0;i<rings.length;i++)for(let j=0;j<ringN;j++){
    bodyP.push(rings[i][j]);const pos=Math.min(j,ringN-j);
    tone.setHex(i<=3 ? colors.nose : pos<=2 ? colors.top : pos<=5 ? colors.mid : colors.belly);
    bodyC.push(tone.toArray());
    if(i<rings.length-1){const a=i*ringN+j,b=i*ringN+(j+1)%ringN;bodyI.push(a,a+ringN,b,b,a+ringN,b+ringN);}
  }
  shape(root,geom(bodyP,bodyI,bodyC),skin);
  polygon(root,rings[0],skin,colors.nose);
  // A narrow radome join and angular access panels follow the actual skin profile.
  const seamZ=-6.2;
  closeLine(root,outline(stationAt(seamZ)).map(([x,y])=>[x*1.006,y*1.009,seamZ]),colors.seam);
  for(const side of [-1,1]){
    topLine([[.06*side,-7.56],[.19*side,-6.89],[.29*side,-6.23]],0x828684);
    topLine([[.55*side,-5.87],[.74*side,-5.29],[.82*side,-4.32],[.91*side,-3.73]],0x505b5f);
    topLine([[.9*side,-3.48],[1.0*side,-2.98],[1.22*side,-2.63],[1.43*side,-2.17]],0x969b95);
    topLine([[.98*side,-1.87],[1.12*side,-1.63],[1.11*side,-.54],[1.24*side,-.31],[1.18*side,.30]],colors.seam);
    topLine([[.68*side,.34],[.67*side,1.12],[.48*side,1.41],[.48*side,2.56],[.65*side,2.78],[.62*side,3.68]],colors.seam);
    topLine([[.71*side,.41],[.71*side,1.14],[.53*side,1.44],[.53*side,2.5]],0x8c9391);
    topLine([[.11*side,2.48],[.35*side,2.48],[.43*side,2.66],[.37*side,3.74],[.17*side,3.87]],colors.seam);
  }

  // Seat, pilot and instruments inside the frameless canopy.
  ellipsoid(root,[0,.612,-4.13],[.50,.12,1.20],0x333a3b,dark);
  ellipsoid(root,[0,.78,-3.77],[.29,.28,.29],0x464a48,dark);
  box(root,[0,.815,-3.49],[.37,.42,.19],0x343832,dark,[-.15,0,0]);
  ellipsoid(root,[0,.93,-3.81],[.17,.194,.168],0x6e7468,skin);
  ellipsoid(root,[0,.973,-3.90],[.159,.073,.104],0x272e30,metal);
  box(root,[0,.732,-4.79],[.52,.23,.21],0x303636,dark,[.16,0,0]);

  // Angular cheeks wrap around dark intake recesses. The inner wall, lip, ramp and
  // backplate are separate surfaces, so the opening remains visible obliquely.
  for(const side of [-1,1]){
    const F=[[.87,.12,-3.72],[1.49,.29,-3.48],[1.66,.15,-3.18],[1.54,-.36,-2.98],[1.10,-.47,-3.20],[.90,-.25,-3.53]];
    const D=[[1.02,.055,-3.16],[1.43,.15,-2.93],[1.52,.07,-2.79],[1.41,-.25,-2.6],[1.12,-.34,-2.76],[1.0,-.17,-3.00]];
    const E=[[.84,.43,-2.54],[1.50,.45,-2.45],[1.72,.18,-2.13],[1.56,-.40,-2.07],[1.12,-.59,-2.18],[.88,-.31,-2.43]];
    const A=[[1.12,.46,1.93],[1.47,.46,2.01],[1.63,.19,2.00],[1.46,-.36,1.94],[.98,-.53,1.70],[.85,-.21,1.69]];
    const M=a=>a.map(([x,y,z])=>[x*side,y,z]);
    const mids=F.map(([x,y,z],i)=>[lerp(x,D[i][0],.10),lerp(y,D[i][1],.10),lerp(z,D[i][2],.10)]);
    for(let j=0;j<F.length;j++){
      const k=(j+1)%F.length;
      polygon(root,M([F[j],F[k],E[k],E[j]]),skin,j<2?colors.panel:colors.side);
      polygon(root,M([E[j],E[k],A[k],A[j]]),skin,j<2?colors.panel:colors.side);
      polygon(root,M([F[j],F[k],mids[k],mids[j]]),metal,0x8c918b);
      polygon(root,M([mids[j],mids[k],D[k],D[j]]),dark,j<2?0x43494a:0x282f32);
    }
    polygon(root,M(D),dark,0x1c2426);
    line(root,M([E[1],E[2],A[2]]),colors.seam);
    polygon(root,M([[1.51,.255,-2.56],[1.59,.217,-2.31],[1.59,.215,-1.57],[1.55,.25,-1.70]]),skin,0x5a6567);
  }

  const wingStations=[[.96,-2.82,3.76,.125,.35],[1.86,-2.23,3.72,.17,.30],
    [3.28,-.79,3.25,.155,.202],[4.75,.70,2.75,.136,.115],[5.36,1.35,2.42,.114,.076]];
  const tailStations=[[.79,3.50,6.22,.05,.23],[1.44,3.71,6.71,.025,.213],
    [2.40,4.47,7.16,-.01,.158],[3.14,5.22,7.22,-.015,.103],[3.75,5.87,6.86,-.03,.067]];
  function sampleFoil(rows,x,c,upper=true){
    let i=1;while(i<rows.length-1&&x>rows[i][0])i++;
    const a=rows[i-1],b=rows[i],t=clamp01((x-a[0])/(b[0]-a[0]));
    const lead=lerp(a[1],b[1],t), trail=lerp(a[2],b[2],t), y=lerp(a[3],b[3],t), thick=lerp(a[4],b[4],t);
    const u=[0,.12,.31,.66,1],h=upper?[.005,.39,.54,.35,.025]:[-.005,-.32,-.43,-.27,-.025];
    let k=1;while(k<u.length-1&&c>u[k])k++;
    return [x,y+thick*lerp(h[k-1],h[k],(c-u[k-1])/(u[k]-u[k-1])),lerp(lead,trail,c)];
  }
  const flapSections=[[1.93,3.27],[3.31,4.94]], flapHinge=.66;
  const flaperons=[];
  function makeFlaperon(side,span,outer){
    const [lo,hi]=span, inset=.018, xs=[lo+inset,...wingStations.map(r=>r[0]).filter(x=>x>lo+.05&&x<hi-.05),hi-inset];
    function wingPoint(x,t,upper){const p=sampleFoil(wingStations,x,t,upper);return [side*p[0],p[1],p[2]];}
    function center(x){return v3(wingPoint(x,flapHinge,true)).lerp(v3(wingPoint(x,flapHinge,false)),.5);}
    const first=center(lo),last=center(hi);
    const joint=group(root,(side<0?'Left ':'Right ')+(outer?'outer flaperon':'inner flaperon'),first.toArray());
    const axis=last.clone().sub(first).normalize().multiplyScalar(side);
    function point(x,u,upper){
      const c=lerp(flapHinge+.008,1,u);const a=wingPoint(x,c,upper);
      return [a[0]-first.x,a[1]-first.y,a[2]-first.z];
    }
    const chord=[0,.18,.68,1];
    for(const upper of [true,false]){
      const pts=[],ids=[],tints=[];
      for(let i=0;i<xs.length;i++)for(let k=0;k<chord.length;k++){
        pts.push(point(xs[i],chord[k],upper));
        tone.setHex(upper?(k===0?0x717d80:outer?0x687477:0x697578):colors.belly);tints.push(tone.toArray());
        if(i===xs.length-1||k===chord.length-1)continue;
        const a=i*chord.length+k,b=a+1,c=b+chord.length,d=a+chord.length;
        if(upper===(side>0))ids.push(a,b,d,b,c,d);else ids.push(a,d,b,b,d,c);
      }
      shape(joint,geom(pts,ids,tints),skin);
    }
    for(let i=1;i<xs.length;i++)for(const u of [0,1]){
      const a=xs[i-1],b=xs[i];polygon(joint,[point(a,u,true),point(b,u,true),point(b,u,false),point(a,u,false)],skin,u===0?0x4a5559:colors.edge);
    }
    for(const x of [xs[0],xs[xs.length-1]])for(let i=1;i<chord.length;i++){
      const a=chord[i-1],b=chord[i];polygon(joint,[point(x,a,true),point(x,b,true),point(x,b,false),point(x,a,false)],skin,colors.side);
    }
    flaperons.push({joint,axis,side,outer});
  }
  function buildFoil(parent, rows, side, pivot, tail=false){
    function pt(x,t,topSide=true,lift=0){const [vx,y,z]=sampleFoil(rows,x,t,topSide);return [vx*side-pivot[0],y+lift-pivot[1],z-pivot[2]];}
    const ts=[0,.12,.31,.66,1];
    const xs=tail?rows.map(r=>r[0]):[...new Set([...rows.map(r=>r[0]),...flapSections.flat()])].sort((a,b)=>a-b);
    const movingSlot=(a,b)=>!tail&&flapSections.some(([lo,hi])=>a>=lo&&b<=hi);
    // Adjacent panels share normals on the cambered lifting surface. Broad reflected
    // highlights move continuously across it as the camera and aircraft turn.
    for(const upper of [true,false]){
      const pts=[],idx=[],tints=[];
      const palette=upper?[colors.leading,colors.top,colors.top,colors.top,colors.panel]:
        [colors.panel,colors.belly,colors.belly,colors.belly,colors.side];
      for(let i=0;i<xs.length;i++)for(let k=0;k<ts.length;k++){
        pts.push(pt(xs[i],ts[k],upper));tone.setHex(palette[k]);
        const rootShade=lerp(.90,1,clamp01((xs[i]-.96)/1.25));
        tints.push([tone.r*rootShade,tone.g*rootShade,tone.b*rootShade]);
        if(i===xs.length-1||k===ts.length-1||(k===ts.length-2&&movingSlot(xs[i],xs[i+1])))continue;
        const a=i*ts.length+k,b=a+1,c=b+ts.length,d=a+ts.length;
        if(upper===(side>0))idx.push(a,b,d,b,c,d);else idx.push(a,d,b,b,d,c);
      }
      shape(parent,geom(pts,idx,tints),skin);
    }
    // Close the fixed trailing spar at each actual hinge slot. The moving face fills
    // the remainder of the planform; there is no underlying fixed wing polygon.
    if(!tail){
      for(let i=1;i<xs.length;i++)if(movingSlot(xs[i-1],xs[i])){
        const a=xs[i-1],b=xs[i];polygon(parent,[pt(a,flapHinge),pt(b,flapHinge),pt(b,flapHinge,false),pt(a,flapHinge,false)],dark,0x414c50);
      }
      for(const [lo,hi] of flapSections)for(const x of [lo,hi])polygon(parent,[pt(x,flapHinge),pt(x,1),pt(x,1,false),pt(x,flapHinge,false)],skin,colors.side);
    }
    const end=rows[rows.length-1][0];
    for(let i=1;i<ts.length;i++)polygon(parent,[pt(end,ts[i-1]),pt(end,ts[i]),pt(end,ts[i],false),pt(end,ts[i-1],false)],skin,colors.side);
    const stripe=(coords,color=colors.seam)=>line(parent,coords.map(([x,t])=>pt(x,t,true,.022)),color);
    if(tail){
      stripe([[1.24,.68],[1.76,.69],[1.97,.646],[2.08,.673],[3.34,.67],[3.68,.6]]);
      stripe([[1.27,.13],[1.65,.17],[2.05,.17],[2.39,.21],[3.58,.21]],0x969a94);
      stripe([[2.58,.29],[2.76,.35],[2.76,.57],[2.54,.60]],0x59656a);
    }else{
      for(let i=0;i<flapSections.length;i++)makeFlaperon(side,flapSections[i],i===1);
      stripe([[1.57,.13],[2.02,.19],[2.21,.14],[3.21,.16],[3.36,.2],[4.96,.20],[5.29,.13]],0x979c99);
      stripe([[1.8,.31],[2.04,.32],[2.27,.29],[2.70,.34],[3.01,.35],[3.12,.43],[3.10,.58],[2.94,.60],[2.49,.57]],0x4f5b60);
      stripe([[3.34,.23],[3.47,.27],[3.74,.27],[3.87,.31],[4.38,.31],[4.53,.41],[4.50,.52]],0x596569);
      stripe([[1.85,.61],[2.34,.60],[2.53,.64],[2.87,.62]],colors.seamLight);
      // A low-visibility flight station roundel is painted onto the left wing.
      if(side<0){
        const cx=3.88,cz=1.40;
        function ink(x,z){const p=sampleFoil(rows,x,0),q=sampleFoil(rows,x,1);return pt(x,(z-p[2])/(q[2]-p[2]),true,.016);}
        const paths=[[[0,-.36],[.095,-.1],[.37,.165],[.34,.215],[.085,.132],[.047,.29],[-.05,.29],[-.085,.132],[-.34,.215],[-.37,.165],[-.095,-.10]],
          [[-.58,-.04],[-.28,-.04],[-.21,.02],[-.56,.02]],[[.28,-.04],[.58,-.04],[.56,.02],[.21,.02]]];
        for(const path of paths) {
          const points=path.map(([x,z])=>ink(cx+x,cz+z));
          const shp=THREE.ShapeUtils.triangulateShape(path.map(([x,z])=>new THREE.Vector2(x,z)),[]);
          shape(parent,geom(points,shp.flat()),marker,0xa2a9a6);
        }
      }
      const p=pt(5.31,.34,true,.017), q=pt(5.31,.52,true,.016);
      rod(parent,p,q,.027,side<0?0xcc544d:0x61b9a5,trim,.019,8);
    }
  }
  const stabilators=[];
  for(const side of [-1,1]){
    buildFoil(root,wingStations,side,[0,0,0]);
    const pivot=[1.04*side,.02,5.51], stab=group(root,'Stabilator',pivot);
    buildFoil(stab,tailStations,side,pivot,true);stabilators.push(stab);
    // Side booms carry the tail surfaces and taper into two pointed fairings.
    const rr=[[1.00,1.25,.07,.27,.17],[1.65,1.35,.07,.37,.25],[2.75,1.36,.035,.45,.27],
      [3.80,1.32,.012,.435,.25],[4.92,1.22,-.012,.36,.22],[5.54,1.17,-.035,.26,.14],[6.09,1.11,-.044,.046,.026]];
    const p=[], ix=[];const n=12;
    for(let i=0;i<rr.length;i++)for(let j=0;j<n;j++){
      const [z,cx,cy,w,h]=rr[i],a=tau*j/n;
      p.push([side*(cx+Math.cos(a)*w),cy+Math.sin(a)*h,z]);
      if(i<rr.length-1){const v=i*n+j,w=i*n+(j+1)%n;ix.push(v,w,v+n,w,w+n,v+n);}
    }
    shape(root,geom(p,ix),skin,colors.panel);
    line(root,rr.slice(1).map(([z,cx,cy,w,h])=>[side*(cx+.77*w),cy+.67*h+.008,z]),0x606b6c);
    ellipsoid(root,[side*.91,.18,4.58],[.28,.18,1.04],colors.panelDark,skin,[0,side*.09,0]);
  }

  function canvasDecal(parent, coords, paint, width=512,height=256) {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)return;paint(ctx,width,height);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    const mat=new THREE.MeshBasicMaterial({map:tex,color:0xffffff,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    const g=geom(coords,[0,1,2,0,2,3]);g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
    const m=new THREE.Mesh(g,mat);m.renderOrder=3;parent.add(m);
  }
  function tailInk(ctx,w,h){
    ctx.textAlign='center';ctx.fillStyle='#c0c3ba';ctx.font='bold 119px Arial, sans-serif';ctx.fillText('JF',w*.50,110);
    ctx.fillStyle='#aab0ab';ctx.font='bold 57px monospace';ctx.fillText('035',w*.5,171);
    ctx.font='bold 18px monospace';ctx.fillText('FLIGHT TEST',w*.5,199);
  }
  const rudders=[];
  for(const side of [-1,1]){
    const xFin=y=>1.30+(y-.20)*.39;
    const wFin=y=>lerp(.139,.030,clamp01((y-.18)/2.18));
    const levels=[[.16,1.61,5.56],[.55,2.00,5.44],[1.07,2.47,5.27],[1.91,3.22,4.77],[2.25,3.49,4.85],[2.37,3.67,4.88]];
    function chord(y){let i=1;while(i<levels.length-1&&y>levels[i][0])i++;
      const a=levels[i-1],b=levels[i],t=clamp01((y-a[0])/(b[0]-a[0]));return [lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}
    const finPt=(z,y,outer=true,h=0)=>{const [a,b]=chord(y),t=clamp01((z-a)/(b-a));
      const thickness=(.15+.85*Math.min(1,t/.18,(1-t)/.18))*wFin(y);
      return [side*(xFin(y)+(outer?1:-1)*thickness+h),y,z];};
    // Only the aft panel moves. Its pivot joins two points on the canted fin
    // centreline, and the facing hinge surfaces and end caps are separate solids.
    const low=.32,high=2.14,gap=.010,hingeZ=y=>lerp(5.035,4.48,(y-low)/(high-low));
    const pivot=[side*xFin(low),low,hingeZ(low)],rudder=group(root,side<0?'Left rudder':'Right rudder',pivot);
    const axis=v3([side*xFin(high),high,hingeZ(high)]).sub(v3(pivot)).normalize();
    rudders.push({joint:rudder,axis});
    const heights=[...levels.map(s=>s[0]),low,high].sort((a,b)=>a-b);
    function facePoint(parent,z,y,outer){const p=finPt(z,y,outer);
      return parent===root?p:[p[0]-pivot[0],p[1]-pivot[1],p[2]-pivot[2]];}
    function strips(y,section){const [le,te]=chord(y),w=te-le;
      if(section==='whole')return [le,le+w*.18,le+w*.64,le+w*.82,te];
      if(section==='fixed'){const end=hingeZ(y)-gap;return [le,le+w*.18,le+w*.64,Math.min(le+w*.82,lerp(le+w*.64,end,.84)),end];}
      const start=hingeZ(y)+gap;return [start,Math.max(lerp(start,te,.16),le+w*.82),te];
    }
    function finBand(section,a,b){const onRudder=section==='rudder',parent=onRudder?rudder:root;
      const lo=strips(a,section),hi=strips(b,section);
      for(const outer of [true,false])for(let j=1;j<lo.length;j++){
        const tint=onRudder?(outer?colors.panelDark:colors.side):j===1?colors.leading:outer?colors.panel:colors.mid;
        polygon(parent,[facePoint(parent,lo[j-1],a,outer),facePoint(parent,lo[j],a,outer),
          facePoint(parent,hi[j],b,outer),facePoint(parent,hi[j-1],b,outer)],skin,tint,[side*(outer?1:-1),0,0]);
      }
      for(const j of [0,lo.length-1]){
        const hinge=(onRudder&&j===0)||(section==='fixed'&&j!==0);
        polygon(parent,[facePoint(parent,lo[j],a,true),facePoint(parent,lo[j],a,false),facePoint(parent,hi[j],b,false),
          facePoint(parent,hi[j],b,true)],hinge?dark:skin,hinge?0x455154:colors.edge);
      }
    }
    for(let i=1;i<heights.length;i++){
      const a=heights[i-1],b=heights[i];
      if(a>=low&&b<=high){finBand('fixed',a,b);finBand('rudder',a===low?a+gap:a,b===high?b-gap:b);}
      else finBand('whole',a,b);
    }
    for(const edge of [low,high]){
      for(const parent of [root,rudder]){
        const y=edge+(parent===rudder?(edge===low?gap:-gap):0),z0=hingeZ(y)+(parent===rudder?gap:-gap),z1=chord(y)[1];
        polygon(parent,[facePoint(parent,z0,y,true),facePoint(parent,z1,y,true),facePoint(parent,z1,y,false),
          facePoint(parent,z0,y,false)],skin,colors.side);
      }
    }
    const tip=levels[levels.length-1];polygon(root,[finPt(tip[1],tip[0]),finPt(tip[2],tip[0]),finPt(tip[2],tip[0],false),finPt(tip[1],tip[0],false)],skin,colors.panel,[0,1,0]);
    const fline=(pts,c=colors.seam)=>line(root,pts.map(([z,y])=>finPt(z,y,true,.008)),c);
    fline([[2.18,.5],[3.67,2.19],[4.75,2.18]],0xa5a8a0);
    fline([[2.41,.50],[2.95,.48],[3.17,.62],[3.84,.61],[3.93,.51],[4.38,.51]],0x414e53);
    const cap=[[3.51,2.252],[3.67,2.369],[4.869,2.349],[4.843,2.235]];
    polygon(root,cap.map(([z,y])=>finPt(z,y,true,.012)),paintedPatch,0x596566);
    const flash=[[3.70,2.25],[3.78,2.313],[4.62,2.30],[4.56,2.242]];
    polygon(root,flash.map(([z,y])=>finPt(z,y,true,.018)),marker,0xb59c69);
    const zMid=3.95, dw=.535,yBot=1.10,yTop=1.84;
    canvasDecal(root,[finPt(zMid+side*dw,yBot,true,.013),finPt(zMid-side*dw,yBot,true,.013),
      finPt(zMid-side*dw,yTop,true,.013),finPt(zMid+side*dw,yTop,true,.013)],tailInk);
  }
  for(const s of [-1,1]){
    // The short angled cheek beneath the forward canopy carries a subdued hull number.
    const sideCo=(z,q)=>{const st=stationAt(z),y=lerp(st[4]+.013,st[2]*.65,q),o=outline(st).slice(0,6);
      for(let i=1;i<o.length;i++)if(y>=o[i][1])return [s*(lerp(o[i-1][0],o[i][0],(o[i-1][1]-y)/(o[i-1][1]-o[i][1]))+.01),y,z];
      return [s*(st[1]+.01),y,z];};
    const z=-5.02, range=.35;
    canvasDecal(root,[sideCo(z+s*range,0),sideCo(z-s*range,0),sideCo(z-s*range,1),sideCo(z+s*range,1)],
      (c,w,h)=>{c.fillStyle='#c4c4b8';c.textAlign='center';c.font='bold 106px monospace';c.fillText('035',w/2,159);});
    line(root,[sideCo(-4.66,.33),sideCo(-4.41,.34),sideCo(-4.36,.53)],0xb09c70);
  }

  // Dorsal fan recess. The hinged cover has an external skin and a ribbed interior,
  // both visible as the vehicle changes between cruise and vertical flight.
  const deckZ=-1.03, deckY=.743;
  const fanHousing=group(root,'Lift fan well');
  const cut=[[-.68,-1.01],[.68,-1.01],[.91,-.83],[.91,.80],[.71,1.04],[-.71,1.04],[-.91,.80],[-.91,-.83]];
  polygon(fanHousing,cut.map(([x,z])=>[x,deckY,z+deckZ]),dark,0x323a3b);
  closeLine(fanHousing,cut.map(([x,z])=>[x,deckY+.007,z+deckZ]),0x969b92);
  rod(fanHousing,[0,deckY-.006,deckZ],[0,deckY+.021,deckZ],.823,0x888e8a,metal,.823,64);
  rod(fanHousing,[0,deckY+.022,deckZ],[0,deckY+.031,deckZ],.779,0x272e30,dark,.779,64);
  const fan=group(fanHousing,'Visible lift fan',[0,deckY+.042,deckZ]);
  for(let i=0;i<16;i++){
    const a=i*tau/16;
    const fp=(r,turn,y)=>[Math.cos(a+turn)*r,y,Math.sin(a+turn)*r];
    polygon(fan,[fp(.15,.02,.016),fp(.39,.095,.021),fp(.736,.20,.002),fp(.733,.28,.005),fp(.42,.24,.009),fp(.14,.18,.018)],metal,
      i%3===0?0x667377:0x5e696c);
    line(fan,[fp(.2,.022,.023),fp(.43,.108,.025),fp(.72,.20,.010)],0x747d78);
  }
  rod(fan,[0,.004,0],[0,.040,0],.158,0x646e70,metal,.080,28);
  // At high speed a real rotor resolves as an annulus. A soft disk gently reduces
  // blade contrast before a display's frame rate can make the rotor appear to strobe.
  const rotorBlurMaterial=new THREE.MeshStandardMaterial({color:0x666e70,roughness:.72,metalness:.26,
    transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const rotorBlur=new THREE.Mesh(new THREE.RingGeometry(.156,.737,56),rotorBlurMaterial);
  rotorBlur.rotation.x=-halfPi;rotorBlur.position.set(0,deckY+.082,deckZ);rotorBlur.renderOrder=2;
  fanHousing.add(rotorBlur);
  const fanHinge=group(root,'Lift fan cover',[0,.758,-2.098]);
  const coverPts=[[-.72,.015],[.72,.015],[.94,.23],[.94,1.90],[.72,2.16],[-.72,2.16],[-.94,1.90],[-.94,.23]];
  const cover=(x,z,h)=>[x,h-.061*(Math.abs(x)/.94)**1.65,z];
  for(let i=0;i<coverPts.length;i++){
    const a=coverPts[i],b=coverPts[(i+1)%coverPts.length];
    polygon(fanHinge,[cover(0,1.08,.042),cover(...a,.034),cover(...b,.034)],skin,colors.top,[0,1,0]);
    polygon(fanHinge,[cover(...a,.034),cover(...b,.034),cover(...b,-.008),cover(...a,-.008)],skin,colors.edge);
  }
  polygon(fanHinge,coverPts.map(([x,z])=>cover(x,z,-.010)),skin,0x525a57,[0,-1,0]);
  closeLine(fanHinge,coverPts.map(([x,z])=>cover(x*.90,lerp(1.08,z,.92),.045)),0x535f63);
  for(const s of [-1,1]){
    const p1=cover(s*.68,.20,-.016),p2=cover(s*.68,1.86,-.016);
    rod(fanHinge,p1,p2,.031,0x737b75,metal);rod(fanHinge,p1,cover(s*.19,1,-.019),.036,0x717a75,metal);
    rod(fanHinge,cover(s*.19,1,-.019),p2,.040,0x717a75,metal);
    rod(root,[s*.56,.761,-2.117],[s*.77,.761,-2.117],.064,0x737978,metal);
  }
  for(const z of [.42,1.09,1.74])rod(fanHinge,cover(-.64,z,-.013),cover(.64,z,-.013),.025,0x717974,metal);
  const inletLeaves=[], undersideLeaves=[];
  for(const s of [-1,1]){
    const inlet=group(root,'Auxiliary inlet',[s*.87,.688,.36]);
    // Local inboard edge lifts while the outboard edge stays attached to the spine.
    const plate=[[0,0,0],[-s*.42,.030,.06],[-s*.39,.029,.82],[-s*.12,.006,.95],[0,0,.78]];
    polygon(fanHousing,plate.map(([x,y,z])=>[s*.87+x,.736,z+.36]),dark,0x30383a);
    polygon(inlet,plate.map(([x,y,z])=>[x,y+.064,z]),skin,colors.panel,[0,1,0]);
    closeLine(inlet,plate.map(([x,y,z])=>[x,y+.07,z]),colors.seam);
    inletLeaves.push(inlet);
    const under=group(root,'Lower lift door',[s*.83,-.686,deckZ]);
    const underPts=[[0,0,-.85],[-s*.58,-.039,-.91],[-s*.77,-.065,-.69],[-s*.77,-.065,.66],[-s*.48,-.026,.87],[0,0,.76]];
    polygon(under,underPts,skin,colors.belly,[0,-1,0]);closeLine(under,underPts.map(([x,y,z])=>[x,y-.004,z]),colors.seam);
    undersideLeaves.push(under);
  }
  rod(root,[0,-.692,deckZ],[0,-.699,deckZ],.741,0x31393a,dark,.736,48);
  for(const s of [-1,1]){
    const gcoords=[[s*.80,1.49],[s*1.13,1.51],[s*1.20,2.23],[s*.91,2.04]];
    polygon(root,gcoords.map(([x,z])=>top(x,z,.018)),paintedPatch,0x59676a,[0,1,0]);
    for(let j=0;j<8;j++)topLine([[s*(.83+.011*j),1.56+j*.059],[s*(1.11+.009*j),1.585+j*.067]],0x3f4d51);
    const u=[[s*.42,3.20],[s*.66,3.25],[s*.70,3.75],[s*.46,3.68]];
    polygon(root,u.map(([x,z])=>top(x,z,.020)),paintedPatch,0x687276,[0,1,0]);
  }
  ellipsoid(root,[0,-.406,-5.84],[.24,.136,.48],0x4f5c5f,metal);
  const inspectionWindow=[[0,-.55,-6.14],[.175,-.529,-5.92],[.112,-.543,-5.67],[-.112,-.543,-5.67],[-.173,-.529,-5.92]];
  polygon(root,inspectionWindow,metal,0x454f4c);

  const gearSets=[];
  function makeWheel(parent, center, radius, width, nose){
    const [cx,cy,cz]=center;
    const profile=[[-width*.50,radius*.60],[-width*.496,radius*.80],[-width*.41,radius*.945],[-width*.25,radius*.992],
      [0,radius],[width*.25,radius*.992],[width*.41,radius*.945],[width*.496,radius*.80],[width*.50,radius*.60]];
    const n=36,p=[],ix=[];
    for(let k=0;k<profile.length;k++)for(let j=0;j<n;j++){
      const [x,r]=profile[k],a=tau*j/n;p.push([cx+x,cy+r*Math.sin(a),cz+r*Math.cos(a)]);
      if(k<profile.length-1){const t=k*n+j,b=k*n+(j+1)%n;ix.push(t,b,t+n,b,b+n,t+n);}
    }
    shape(parent,geom(p,ix),dark,colors.rubber);
    rod(parent,[cx-width*.51,cy,cz],[cx+width*.51,cy,cz],radius*.597,0x92958d,metal,radius*.597,32);
    for(const s of [-1,1]){
      const x=cx+s*width*.515;
      rod(parent,[x,cy,cz],[x+s*.009,cy,cz],radius*.437,0x555b57,metal,radius*.437,28);
      rod(parent,[x+s*.012,cy,cz],[x+s*.035,cy,cz],radius*.18,0xb1b1a3,metal,radius*.14,16);
      for(let j=0;j<6;j++){
        const a=j*tau/6,y=cy+radius*.331*Math.sin(a),z=cz+radius*.331*Math.cos(a);
        rod(parent,[x+s*.011,y,z],[x+s*.019,y,z],nose?.014:.018,0x8b938d,metal,undefined,6);
      }
    }
  }
  function makeGear(side){
    const nose=side===0;
    const pivot=nose?[0,-.431,-4.36]:[side*1.07,-.397,1.26];
    const g=group(root,nose?'Nose landing gear':'Main landing gear',pivot);
    const radius=nose?.251:.324;
    const axle=[nose?0:side*.35,-1.6+radius-pivot[1],nose?.10:.19];
    const lock=[nose?-.003:side*.13,-.34,-.035];
    rod(g,[0,.09,-.02],lock,nose?.068:.095,0xaaa99a,metal,nose?.063:.083);
    rod(g,lock,[axle[0]*.83,axle[1]+.19,axle[2]-.071],nose?.044:.064,0xb8b9ad,metal);
    rod(g,[axle[0]*.83,axle[1]+.20,axle[2]-.074],[axle[0],axle[1],axle[2]-.045],nose?.050:.071,0x999c93,metal);
    rod(g,[0,.03,.49],[axle[0]*.34,-.32,.25],.040,0x737d78,metal);
    rod(g,[axle[0]*.34,-.32,.25],[axle[0]*.76,axle[1]+.21,axle[2]-.06],.031,0xa0a59a,metal);
    for(const s of [-1,1]){
      const bx=axle[0]+s*(nose?.092:.128);
      rod(g,[axle[0],axle[1]+.24,axle[2]-.04],[bx,axle[1]+.14,axle[2]-.06],.035,0x878d83,metal);
      rod(g,[bx,axle[1]+.14,axle[2]-.06],[bx,axle[1],axle[2]],.038,0x9fa197,metal);
    }
    const wheel=group(g,nose?'Nose wheel':'Main wheel',axle);
    makeWheel(wheel,[0,0,0],radius,nose?.15:.211,nose);
    const door=group(root,'Landing gear door',nose?[-.34,-.513,-4.38]:[side*1.40,-.40,1.48]);
    const dw=nose?.27:.43,dl=nose?.69:.87;
    const d=side===0?1:-side;
    const doorPts=[[0,0,-dl],[d*dw,-.025,-dl+.14],[d*(dw+.10),-.03,dl-.28],[d*dw,-.012,dl],[0,0,dl-.06]];
    polygon(door,doorPts,skin,colors.belly);closeLine(door,doorPts,colors.seam);
    gearSets.push({g,door,wheel,radius,side,base:pivot[1]});
  }
  makeGear(0);makeGear(-1);makeGear(1);

  const mounts=[];
  function paintTrainingCapsule(store){
    // The colour-blocked optical game marker is visually distinct from aircraft skin.
    // Its broad bands remain legible in the normal exterior camera.
    const chalk=0xd3d3bf, midnight=0x324d60, orange=0xf6a44c;
    const sections=[
      [[-1.31,.012],[-1.23,.083],[-1.09,.151],[-.92,.180]],
      [[-.92,.180],[-.78,.188]],[[ -.78,.188],[-.60,.194]],[[-.60,.194],[.45,.194]],
      [[.45,.194],[.65,.194]],[[.65,.194],[.75,.194]],[[.75,.194],[.98,.184]],
      [[.98,.184],[1.18,.139],[1.23,.111]]
    ];
    const tones=[midnight,orange,chalk,chalk,midnight,orange,chalk,midnight];
    sections.forEach((profile,i)=>ringZ(store,profile,tones[i],skin,24));
    cylinderZ(store,1.224,1.238,.107,.107,0x779ca0,skin,24);
    cylinderZ(store,1.238,1.247,.066,.061,0xf7bb61,trim,24);
    for(const sign of [-1,1]){
      const fin=[[sign*.142,.013,.60],[sign*.278,.012,.82],[sign*.286,.012,.97],[sign*.172,.012,.93]];
      polygon(store,fin,skin,midnight,[0,1,0]);
      polygon(store,fin.map(([x,y,z])=>[x,y-.023,z]),skin,midnight,[0,-1,0]);
    }
  }
  // Sockets remain in the aircraft when a capsule departs. Geometry for the four
  // capsules is shared, and the sockets retain their own independent visibility.
  for(const outer of [true,false])for(const side of [-1,1]){
    const x=outer?4.15:2.51,z=outer?.69:-.55;
    const base=sampleFoil(wingStations,x,.36,false)[1];
    const y=base-(outer?.56:.61),socket=group(root,(outer?'Outer ':'Inner ')+(side<0?'left':'right')+' range mount',[side*x,y,z]);
    const store=group(socket,'Range training capsule');
    const hw=.066,fh=base-y;
    const sidePts=[[fh+.13,-.47],[fh+.13,.43],[.245,.31],[.19,.20],[.19,-.35],[.25,-.44]];
    for(const face of [-1,1])polygon(socket,sidePts.map(([yy,zz])=>[face*hw,yy,zz]),skin,face===side?colors.panel:colors.side,[face,0,0]);
    for(let i=0;i<sidePts.length;i++){
      const [a,b]=sidePts[i],[c,d]=sidePts[(i+1)%sidePts.length];
      polygon(socket,[[-hw,a,b],[hw,a,b],[hw,c,d],[-hw,c,d]],skin,i===4?colors.edge:colors.side);
    }
    box(socket,[0,.204,-.06],[.22,.054,.66],0x4c5758,skin);
    if(!mounts.length)paintTrainingCapsule(store);
    mounts.push({socket,store});
  }

  // Each short sleeve has an overlapping seal. Turning the linked sleeves forms a
  // continuous curved exhaust. The exit anchor follows the metallic nozzle.
  const cowlingRows=[[3.15,1.36,.659,.06],[3.79,1.23,.689,.008],[4.42,1.07,.720,-.042],
    [4.91,.98,.729,-.068],[5.29,.905,.724,-.075],[5.61,.827,.697,-.077]];
  const arcSteps=20, cp=[],ciw=[],ccw=[];
  function cowlPoint(i,j,h=0){
    const [z,w,high,edge]=cowlingRows[i];const a=j*Math.PI/arcSteps,ca=Math.cos(a),sa=Math.sin(a);
    const serration=i===cowlingRows.length-1?.132*(j%2)+.058*ca*ca:0;
    return [ca*(w+h),edge+(high-edge+h)*sa,z+serration];
  }
  for(let i=0;i<cowlingRows.length;i++)for(let j=0;j<=arcSteps;j++){
    cp.push(cowlPoint(i,j));tone.setHex(i<3?colors.top:j<3||j>17?colors.side:colors.panel);ccw.push(tone.toArray());
    if(j<arcSteps&&i<cowlingRows.length-1){const a=i*(arcSteps+1)+j;ciw.push(a,a+1,a+arcSteps+1,a+1,a+arcSteps+2,a+arcSteps+1);}
  }
  shape(root,geom(cp,ciw,ccw),skin);
  for(let j=0;j<=arcSteps;j+=2)line(root,[cowlPoint(2,j,.005),cowlPoint(3,j,.005),cowlPoint(4,j,.005),cowlPoint(5,j,.006)],0x626b6d);
  for(let j=0;j<arcSteps;j++){
    const a=cowlPoint(5,j),b=cowlPoint(5,j+1),lower=([x,y,z])=>[x*.976,y*.962,z-.025];
    polygon(root,[a,b,lower(b),lower(a)],metal,0x84877d);line(root,[a,b],0x9d9c91);
  }
  const engine=group(root,'Aft engine collar',[0,-.012,4.77]);
  ringZ(engine,[[-.082,.55],[0,.651],[.075,.687],[.285,.681],[.48,.650],[.625,.594]],0x636b6b,metal);
  ringZ(engine,[[.061,.685],[.078,.701],[.137,.701],[.152,.685]],0x7e827e,metal);
  ringZ(engine,[[.275,.679],[.292,.688],[.338,.681],[.354,.674]],0x797e78,metal);
  for(let i=0;i<24;i++){
    const a=tau*i/24,c=Math.cos(a),s=Math.sin(a);
    line(engine,[[.687*c,.687*s,.15],[.681*c,.681*s,.29],[.663*c,.663*s,.48]],0x414849);
    rod(engine,[.693*c,.693*s,.098],[.706*c,.706*s,.098],.014,0xc2c0a8,metal,.014,6);
  }
  const joints=[],dimensions=[.44,.34];let previous=engine;
  for(let i=0;i<3;i++){
    const joint=group(previous,'Exhaust swivel '+(i+1),[0,0,i===0?.60:dimensions[i-1]]);
    joints.push(joint);previous=joint;
    const radius=[.642,.624,.595][i];
    ellipsoid(joint,[0,0,-.014],[radius*.982,radius*.982,radius*.80],0x525650,metal);
    const length=i<2?dimensions[i]:.20;
    ringZ(joint,[[-.137,radius*.87],[-.078,radius*.969],[-.021,radius],[length*.51,radius*.988],[length+.07,radius*.88]],i%2?0x747572:0x626666,metal);
    ringZ(joint,[[-.029,radius*.996],[-.011,radius*1.022],[.020,radius*1.022],[.036,radius*.998]],0x767b75,metal);
    for(let j=0;j<20;j++){
      const a=tau*(j+(i%2)*.44)/20, c=Math.cos(a),s=Math.sin(a);
      line(joint,[[radius*.999*c,radius*.999*s,.042],[radius*.992*c,radius*.992*s,length*.48],[radius*.943*c,radius*.943*s,length*.82]],0x444746);
      if(j%2===0)rod(joint,[radius*1.012*c,radius*1.012*s,.003],[radius*1.031*c,radius*1.031*s,.003],.014,0x65675f,metal,.014,6);
    }
  }
  const outlet=joints[2];
  ringZ(outlet,[[.098,.509],[.122,.608],[.19,.609],[.207,.585]],0x77796e,metal);
  ringZ(outlet,[[.158,.550],[.34,.532],[.50,.492],[.615,.464]],0x514f49,metal);
  const aft=(a,r,z)=>[Math.cos(a)*r,Math.sin(a)*r,z];
  const petalTones=[0x7a7266,0x888074,0x716f6a,0x817a6e,0x736d64,0x898276];
  for(let j=0;j<18;j++){
    const a=tau*j/18, w=Math.PI/18, fl=a-w*.94,fr=a+w*.94;
    const p=[aft(fl,.589,.169),aft(fr,.589,.169),aft(a+w*.91,.572,.275),aft(a+w*.75,.491,.619),
      aft(a,.480,.681),aft(a-w*.75,.491,.619),aft(a-w*.91,.572,.275)];
    const c=aft(a,.565,.385);
    for(let k=0;k<p.length;k++)polygon(outlet,[c,p[k],p[(k+1)%p.length]],metal,petalTones[j%petalTones.length]);
    // The overlap is black at the root and pale at the trailing ceramic edge.
    line(outlet,[p[6],p[5],p[4]],0xb2a693);
    const lip=[p[5],p[4],p[3],aft(a+w*.73,.461,.615),aft(a,.450,.670),aft(a-w*.73,.461,.615)];
    polygon(outlet,lip,metal,0xa89983);
    const aa=a+w;
    polygon(outlet,[aft(aa-w*.20,.563,.205),aft(aa+w*.20,.563,.205),aft(aa+w*.30,.466,.604),aft(aa,.460,.651),aft(aa-w*.30,.466,.604)],metal,0x524f47);
    const outer=aft(a,.593,.217),inner=aft(a,.604,.217);
    rod(outlet,outer,inner,.012,0x5a5b53,metal,.012,6);
    // Interior tiles remain visible from the aft camera even with low exhaust glow.
    polygon(outlet,[aft(fl,.39,.148),aft(fr,.39,.148),aft(a+w*.75,.46,.609),aft(a,.449,.667),aft(a-w*.75,.46,.609)],metal,
      [0x665f54,0x72685a,0x605b53][j%3]);
    line(outlet,[aft(a,.39,.165),aft(a,.413,.37),aft(a,.451,.658)],0x91816e);
  }
  ringZ(outlet,[[.085,.46],[.104,.422],[.128,.371],[.169,.371]],0x6b6254,metal);
  cylinderZ(outlet,.072,.108,.39,.39,0x29282a,dark);
  for(let j=0;j<19;j++){
    const a=tau*j/19;
    polygon(outlet,[aft(a,.072,.129),aft(a+.08,.183,.12),aft(a+.20,.363,.119),aft(a+.31,.362,.121),aft(a+.19,.17,.137)],metal,0x6e6455);
  }
  cylinderZ(outlet,.104,.175,.101,.046,0x504d46,metal,24);
  const nozzleExit=group(outlet,'Nozzle exit',[0,0,.675]);
  for(const [parent,entries] of groups){for(const [mat,data] of entries){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.p,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(data.c,3));
    if(data.uv.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));
    let mesh;
    if(mat===seamMat)mesh=new THREE.LineSegments(g,mat);
    else{g.setAttribute('normal',new THREE.Float32BufferAttribute(data.n,3));mesh=new THREE.Mesh(g,mat);
      // The real silhouette still falls on the deck. Sub-centimetre trim cannot
      // reliably sample the wide world shadow atlas, especially at a grazing sun angle.
      mesh.castShadow=(mat===skin||mat===metal||mat===dark);mesh.receiveShadow=false;
    }
    g.computeBoundingSphere();parent.add(mesh);
  }}
  groups.clear();
  const capsule=mounts[0].store;
  for(const {store} of mounts.slice(1))for(const piece of capsule.children)store.add(piece.clone());
  function createTrainingRound(){
    const copy=capsule.clone(true);copy.visible=true;
    copy.traverse(part=>part.layers.set(0));
    return copy;
  }
  let fanAngle=0;
  function update(state={}){
    const dt=Math.min(.10,Math.max(0,state.dt??1/60));
    const theta=Math.min(halfPi,Math.max(0,state.nozzle??0)),power=clamp01(state.thrust??0),gear=clamp01(state.gear??1);
    const n=theta/halfPi, opening=clamp01(n*1.36),t=opening*opening*(3-2*opening);
    joints[0].rotation.x=theta*.32;joints[1].rotation.x=theta*.36;joints[2].rotation.x=theta*.32;
    fanHinge.rotation.x=-t*1.28;
    // A closed opaque cover completely conceals the internals. Excluding them
    // avoids minified fan/well fragments leaking through a flush exterior panel.
    fanHousing.visible=t>.062;
    const enginePower=clamp01(state.engine??1), speed=t*(1.8+power*21)*enginePower;
    fanAngle=(fanAngle+dt*speed)%tau;fan.rotation.y=fanAngle;
    rotorBlurMaterial.opacity=.85*clamp01((speed-2.5)/7);rotorBlur.visible=rotorBlurMaterial.opacity>.01;
    inletLeaves[0].rotation.z=t*.87;inletLeaves[1].rotation.z=-t*.87;
    undersideLeaves[0].rotation.z=-t*.94;undersideLeaves[1].rotation.z=t*.94;
    for(const {g,door,wheel,radius,side,base} of gearSets){
      const stow=1-gear;g.visible=gear>.025;
      g.position.y=base+stow*.145;g.rotation.x=side===0?-stow*1.54:-stow*.15;
      g.rotation.z=side===0?0:-side*stow*1.39;
      door.rotation.z=side===0?-gear*.96:side*gear*.92;
      const groundspeed=state.speed??0;
      if(state.onGround&&gear>.95&&Math.abs(groundspeed)>.01)wheel.rotation.x=(wheel.rotation.x-dt*groundspeed/radius)%tau;
    }
    const direct=Boolean(state.manualActive)&&!state.maneuver;
    const rawPitch=state.pitch??0,rawBank=state.roll??0;
    // The neutral trim remains small through an inverted attitude. On the scripted
    // path the original trim and roll mixer retain their existing animation.
    const pitch=Math.max(-.45,Math.min(.45,direct?Math.sin(rawPitch):rawPitch));
    const bank=Math.max(-.75,Math.min(.75,direct?Math.sin(rawBank):rawBank));
    const turn=inputAxis(state.turn),pitchCommand=direct?inputAxis(state.pitchInput):0;
    const pitchSurface=pitch*.29-pitchCommand*.39;
    const differential=bank*.105+(direct?turn*.19:0);
    stabilators[0].rotation.x=pitchSurface+differential;stabilators[1].rotation.x=pitchSurface-differential;
    const rollDemand=direct?turn:inputAxis((state.turn??-bank/.66)*.78-bank/.66*.22);
    const manualYaw=direct||(!state.maneuver&&(state.phase==='taxi'||(state.phase==='free'&&state.mode==='hover')));
    const yawAngle=manualYaw?inputAxis(state.yawInput)*.52:0;
    for(const {joint,axis} of rudders)joint.quaternion.setFromAxisAngle(axis,yawAngle);
    const flap=clamp01(state.flap??0);
    for(const {joint,axis,side,outer} of flaperons){
      const angle=flap*(outer?.57:.68)-side*rollDemand*(outer?.47:.27);
      joint.quaternion.setFromAxisAngle(axis,angle);
    }

  }
  // Snapshot the clean flying configuration before the player adds exhaust effects.
  // The opponent instances the same meshes without sharing moving parts with the pilot.
  update({dt:0,gear:0});
  root.updateMatrixWorld(true);
  const flightCopy=new THREE.Group();
  for(const slot of mounts)slot.store.visible=false;
  root.traverseVisible(part=>{
    if(!part.isMesh&&!part.isLineSegments)return;
    const mesh=part.clone(false);
    mesh.matrix.copy(part.matrixWorld);
    mesh.matrixAutoUpdate=false;
    mesh.castShadow=false;
    flightCopy.add(mesh);
  });
  for(const slot of mounts){
    slot.store.visible=true;
    // The range owns its ammunition, even while the duel loadout is on display.
    slot.rangeRack=new THREE.Group();slot.rangeRack.add(slot.store);
    slot.combatStore=createTrainingRound();slot.combatStore.visible=false;
    slot.socket.add(slot.rangeRack,slot.combatStore);
    slot.rivalStore=createTrainingRound();
    slot.rivalStore.position.copy(slot.socket.position);flightCopy.add(slot.rivalStore);
  }
  update({dt:0});
  return {root,flightCopy,update,nozzlePivot:joints[0],nozzleExit,mounts,createTrainingRound};
}
