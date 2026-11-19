/* Offline scenery for the coastal flight range. Coordinates are in game metres; Y is up. */
function createCoast(THREE, scene) {
  'use strict';
  const TAU = Math.PI * 2;
  const SEA = -13.5;
  const sunAzimuth=-135*Math.PI/180, sunElevation=47.89*Math.PI/180;
  const lightDir=new THREE.Vector3(Math.cos(sunAzimuth)*Math.cos(sunElevation),Math.sin(sunElevation),Math.sin(sunAzimuth)*Math.cos(sunElevation));
  const world = new THREE.Group();
  world.name = '海岬号 · 海上试飞区';
  scene.add(world);
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v-a)/(b-a))); return t*t*(3-2*t); };
  let seed = 47831;
  function random() { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }
  const noiseGrid = new Float32Array(256*256);
  for (let i=0; i<noiseGrid.length; i++) noiseGrid[i] = random();
  function noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const a = x-ix, b=z-iz, tx=a*a*(3-2*a), tz=b*b*(3-2*b);
    const offset = (iz&255)*256, next = ((iz+1)&255)*256;
    const lo = noiseGrid[offset+(ix&255)]*(1-tx) + noiseGrid[offset+((ix+1)&255)]*tx;
    const hi = noiseGrid[next+(ix&255)]*(1-tx) + noiseGrid[next+((ix+1)&255)]*tx;
    return lo+(hi-lo)*tz;
  }
  function cloudNoise() {
    const size = 256, bytes = new Uint8Array(size*size*4);
    function periodic(x,y,n) {
      let u=x*n, v=y*n, i=Math.floor(u), j=Math.floor(v); u -= i; v -= j;
      u=u*u*(3-2*u); v=v*v*(3-2*v);
      const at=(dx,dy)=>noiseGrid[((j+dy)%n)*256+(i+dx)%n];
      return ((1-u)*at(0,0)+u*at(1,0))*(1-v)+((1-u)*at(0,1)+u*at(1,1))*v;
    }
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const fx=x/size, fy=y/size;
      let v = 0, amplitude = 0.54;
      for(let n=4; n<=128; n*=2) { v += periodic(fx,fy,n)*amplitude; amplitude *= 0.5; }
      const k=(y*size+x)*4;
      bytes[k]=Math.min(255,v*255); bytes[k+1]=255*periodic(fx,fy,32); bytes[k+2]=255*periodic(fx,fy,8); bytes[k+3]=255;
    }
    const texture = new THREE.DataTexture(bytes,size,size);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.magFilter=THREE.LinearFilter; texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps=true; texture.needsUpdate=true;
    return texture;
  }
  const noiseTex=cloudNoise();
  const skyLookup=`vec2 skyUV(vec3 direction){
    vec3 d=normalize(direction);
    float u=atan(d.z,d.x)*0.1591549431+0.5;
    return vec2(u,clamp(asin(clamp(d.y,0.,1.))*0.63661977,.0005,.9995));
  }
  vec3 coastalSky(sampler2D map,vec3 ray,vec3 sun,float ready){
    vec3 d=normalize(ray);
    vec3 clear=mix(vec3(.48,.62,.73),vec3(.085,.255,.50),sqrt(max(0.,d.y)));
    clear+=vec3(.34,.29,.19)*pow(max(0.,dot(d,sun)),22.);
    return mix(clear,texture2D(map,skyUV(d)).rgb,ready);
  }`;
  const waterSky={value:noiseTex};
  const skyUniforms={uSun:{value:lightDir},uPanorama:{value:noiseTex},uHorizon:waterSky,uSkyReady:{value:0}};
  const skyMat=new THREE.ShaderMaterial({
    uniforms:skyUniforms,side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,
    vertexShader:`varying vec3 vDirection;
      void main(){vDirection=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0);gl_Position=p.xyww;}`,
    fragmentShader:`varying vec3 vDirection;uniform vec3 uSun;uniform sampler2D uPanorama,uHorizon;uniform float uSkyReady;
      ${skyLookup}
      void main(){
        vec3 d=normalize(vDirection);
        vec3 color=coastalSky(uPanorama,d,uSun,uSkyReady);
        if(d.y<.038){
          vec3 horizon=coastalSky(uHorizon,vec3(d.x,.014,d.z),uSun,uSkyReady);
          color=mix(horizon,color,smoothstep(.002,.038,d.y));
        }
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),skyMat);
  sky.name='远空云层';sky.frustumCulled=false;sky.renderOrder=-1000;world.add(sky);
  scene.background=new THREE.Color(0xa3c1d4);
  scene.fog=new THREE.Fog(0x90afc4,1050,8050);

  // The dome and the aircraft's sky reflections share one exposure, orientation and horizon.
  const skyReady=new Promise(resolve=>{
    const loader=new THREE.TextureLoader();
    loader.load('@SKY_PANORAMA@',map=>{
      try {
        map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;
        // atan changes branch at the wrapped longitude; explicit linear sampling keeps that seam invisible.
        map.minFilter=THREE.LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;
        skyUniforms.uPanorama.value=map;skyUniforms.uSkyReady.value=1;
        const image=map.image;
        const blurred=document.createElement('canvas');blurred.width=384;blurred.height=104;
        const blur=blurred.getContext('2d');
        blur.fillStyle='#91acc1';blur.fillRect(0,0,384,104);blur.filter='blur(1.8px)';
        for(const left of [-384,0,384])blur.drawImage(image,left,-3,384,110);
        const seaSky=new THREE.CanvasTexture(blurred);seaSky.colorSpace=THREE.SRGBColorSpace;
        seaSky.wrapS=THREE.RepeatWrapping;seaSky.minFilter=THREE.LinearFilter;seaSky.generateMipmaps=false;waterSky.value=seaSky;
        const c=document.createElement('canvas');c.width=512;c.height=256;
        const ctx=c.getContext('2d');
        ctx.drawImage(image,0,0,512,129);
        const ground=ctx.createLinearGradient(0,127,0,256);
        ground.addColorStop(0,'#819eae');ground.addColorStop(.12,'#3c6269');ground.addColorStop(.61,'#263f42');ground.addColorStop(1,'#464d49');
        ctx.fillStyle=ground;ctx.fillRect(0,129,512,127);
        const pixels=ctx.getImageData(0,0,512,256).data,lighting=new Float32Array(512*256*4);
        const lin=new Float32Array(256);for(let i=0;i<256;i++){let v=i/255;lin[i]=v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}
        for(let i=0;i<pixels.length;i+=4){
          const r=lin[pixels[i]],g=lin[pixels[i+1]],b=lin[pixels[i+2]];
          const y=.2126*r+.7152*g+.0722*b,lift=1.02+.78*y*y;
          lighting[i]=r*lift;lighting[i+1]=g*lift;lighting[i+2]=b*lift;lighting[i+3]=1;
        }
        const reflections=new THREE.DataTexture(lighting,512,256,THREE.RGBAFormat,THREE.FloatType);
        reflections.flipY=true;reflections.mapping=THREE.EquirectangularReflectionMapping;
        reflections.minFilter=THREE.LinearFilter;reflections.magFilter=THREE.LinearFilter;reflections.needsUpdate=true;
        scene.environment=reflections;scene.environmentIntensity=.89;
      } finally {resolve();}
    },undefined,()=>resolve());
  });
  const hemi=new THREE.HemisphereLight(0xd5ebff,0x656652,.92);
  const sun=new THREE.DirectionalLight(0xfff1da,2.42);
  sun.name='海岸日光';sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:.6,far:392});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.000047;sun.shadow.normalBias=.016;
  const fill=new THREE.DirectionalLight(0xc5e2fa,.43);fill.position.set(32,27,20);
  world.add(hemi,sun,sun.target,fill);sun.position.copy(lightDir).multiplyScalar(125);

  // Static fixtures share instance buffers, including struts, tins, railings and shoreline rock.
  const primitives={box:new THREE.BoxGeometry(1,1,1),round:new THREE.CylinderGeometry(.5,.5,1,14),tube:new THREE.CylinderGeometry(.5,.5,1,7),
    taper:new THREE.CylinderGeometry(.45,.5,1,20), cone:new THREE.ConeGeometry(.5,1,9), rock:new THREE.DodecahedronGeometry(.5,0), sphere:new THREE.SphereGeometry(.5,12,7)};
  const materials={solid:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.84,metalness:.035}),
    steel:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.60,metalness:.32}),
    glass:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.23,metalness:.47}),
    lit:new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false})};
  const batches=new Map(), pose=new THREE.Object3D();
  function instance(geo,mat,x,y,z,sx,sy,sz,color,ax=0,ay=0,az=0) {
    const key=geo+'/'+mat;
    if(!batches.has(key)) batches.set(key,{geo,mat,matrices:[],colors:[]});
    pose.position.set(x,y,z);pose.rotation.set(ax,ay,az);pose.scale.set(sx,sy,sz);pose.updateMatrix();
    const b=batches.get(key); b.matrices.push(pose.matrix.clone());b.colors.push(color);
  }
  const box=(x,y,z,sx,sy,sz,color,mat='solid',ay=0)=>instance('box',mat,x,y,z,sx,sy,sz,color,0,ay,0);
  const cylinder=(x,y,z,d,h,color,mat='steel')=>instance('round',mat,x,y,z,d,h,d,color);
  const up=new THREE.Vector3(0,1,0), segment=new THREE.Vector3(), segmentEuler=new THREE.Euler(), segmentQ=new THREE.Quaternion();
  function beam(ax,ay,az,bx,by,bz,width,depth,color,geo='box',mat='steel') {
    segment.set(bx-ax,by-ay,bz-az);const length=segment.length();if(length<.001) return;
    segmentQ.setFromUnitVectors(up,segment.divideScalar(length));segmentEuler.setFromQuaternion(segmentQ);
    instance(geo,mat,(ax+bx)*.5,(ay+by)*.5,(az+bz)*.5,width,length,depth,color,segmentEuler.x,segmentEuler.y,segmentEuler.z);
  }
  function flushInstances() {
    const tint = new THREE.Color();
    for(const b of batches.values()) {
      const mesh=new THREE.InstancedMesh(primitives[b.geo],materials[b.mat],b.matrices.length);
      b.matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,tint.set(b.colors[i]));});
      mesh.castShadow=b.mat!=='lit';mesh.receiveShadow=b.mat!=='lit';mesh.computeBoundingSphere();world.add(mesh);
    }
    batches.clear();
  }
  const carrier=createCarrier(THREE,world,{box,cylinder,beam,instance,random,seaLevel:SEA});
  // A single indexed topographic surface joins the islands, the sea floor and the outer mountain range.
  const BED=SEA-13, islands=[];
  function addIsland(x,z,rx,rz,height,angle,s,shelf=false) {
    islands.push({x,z,rx,rz,height,ca:Math.cos(angle),sa:Math.sin(angle),s,shelf,bound:Math.max(rx,rz)*1.19});
  }
  // A distant chain lies off the port quarter; the central trial area opens directly onto the sea.
  addIsland(-88,-495,46,31,13,.20,2.2,true);
  addIsland(92,-805,51,35,16,-.29,4.3,true);
  addIsland(-1250,-1120,375,146,107,.31,8.1);
  addIsland(-1615,-485,464,220,147,-.44,15.3);
  addIsland(-1530,328,495,196,121,-.35,31.1);
  addIsland(-1190,1158,384,159,119,.26,37.7);
  addIsland(-1580,-1735,627,204,174,-.42,44.3);
  addIsland(1605,-1490,449,172,99,.41,65.9);
  addIsland(1710,1170,518,203,143,-.53,85.5);
  function islandHeight(item,x,z) {
    const dx=x-item.x,dz=z-item.z;
    if(Math.abs(dx)>item.bound||Math.abs(dz)>item.bound)return BED;
    const u=(item.ca*dx+item.sa*dz)/item.rx,v=(-item.sa*dx+item.ca*dz)/item.rz;
    const a=Math.atan2(v,u),s=item.s;
    const shore=1+.061*Math.sin(a*3+s)+.033*Math.sin(a*6-s)+.018*Math.sin(a*11+s*.47);
    const r=Math.hypot(u,v)/shore;
    if(r>1.10)return BED;
    const base=BED+(SEA+1.8-BED)*smooth(1.10,.92,r);
    const contour=Math.pow(Math.max(0,1-r*r),.88)*smooth(.998,.80,r);
    const ridge=v-.23*Math.sin(u*3.3+s)-.10*Math.sin(u*7.0-s*.27);
    const folded=.36+.64*Math.exp(-ridge*ridge*6.7);
    const bulk=.56+.64*noise(u*3.0+s,v*3.0-s)+.21*(noise(u*8.1+s*.65,v*9.7+s)-.5);
    const channels=Math.abs(2*noise(u*5.8+s,v*4.7-s*.3)-1);
    const y=base+item.height*contour*folded*(bulk+.37*(channels-.34));
    if(!item.shelf)return y;
    const shelf=SEA+1.8+item.height*.59;
    return shelf+(y-shelf)*smooth(.40,.72,r);
  }
  function relief(x,z) {
    const r=Math.hypot((x+55)*.97,(z+40)*1.035);
    let y=BED;
    if(r>1450 && r<3540) {
      const a=Math.atan2(z+40,x+55);
      const crest=2450+220*Math.sin(3*a+.42)+116*Math.sin(6*a-1.4)+68*Math.cos(10*a+.7);
      const width=435+90*Math.sin(4*a+.72);
      const side=Math.abs(r-crest)/width;
      if(side<1){
        const n=noise(x*.0019+11.3,z*.0019+8.9),n2=noise(x*.0053+3.2,z*.0053-6.6);
        const folds=Math.abs(2*noise(x*.0049+n,z*.0031-n)-1);
        const high=106+151*n+47*n2+122*folds+39*Math.sin(a*7.0+.8);
        const shoulder=smooth(1,.04,side);
        const coastArc=smooth(-.16,.51,(-x+.34*z)/Math.max(1,r));
        y=BED+coastArc*((SEA+2-BED)*smooth(1,.86,side)+high*shoulder*(.69+.46*n2));
      }
    }
    for(const item of islands)y=Math.max(y,islandHeight(item,x,z));
    return y;
  }
  const positive=[0];
  while(positive[positive.length-1]<3740){
    const d=positive[positive.length-1];
    positive.push(d+(d<295?6:d<695?10:d<1950?14:d<3100?20:36));
  }
  // Sample the two small offshore knolls at their narrowest cross-sections as well as the broad coastline.
  const samples=[...new Set([...positive,486,495,505,787,805,817])].sort((a,b)=>a-b);
  const axis=Float32Array.from([...samples.slice(1).reverse().map(v=>-v),...samples]);
  const nAxis=axis.length,count=nAxis*nAxis;
  const altitudes=new Float32Array(count);
  for(let j=0;j<nAxis;j++) for(let i=0;i<nAxis;i++)altitudes[j*nAxis+i]=relief(axis[i],axis[j]);
  function interval(v){
    let lo=0,hi=nAxis-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(axis[mid]<=v)lo=mid;else hi=mid;}
    return lo;
  }
  function seabed(x,z){
    if(x<axis[0]||x>axis[nAxis-1]||z<axis[0]||z>axis[nAxis-1])return BED;
    const i=interval(x),j=interval(z),k=j*nAxis+i;
    const u=(x-axis[i])/(axis[i+1]-axis[i]),v=(z-axis[j])/(axis[j+1]-axis[j]);
    const a=altitudes[k],b=altitudes[k+1],c=altitudes[k+nAxis],d=altitudes[k+nAxis+1];
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  }
  function groundHeight(x,z) {
    if(carrier.isDeck(x,z))return 0;
    return Math.max(SEA,seabed(x,z));
  }
  function woodlandCover(x,z,h,slope){
    const dampGround=.67*noise(x*.0034+12,z*.0041-5)+.33*noise(x*.0105-3,z*.0092+9);
    return smooth(SEA+7,SEA+20,h)*(1-smooth(.53,1.00,slope))*smooth(.29,.65,dampGround);
  }
  function buildTerrain(){
    const xyz=[],cover=[],groundUV=[],indices=[],flat=Math.hypot(lightDir.x,lightDir.z);
    const sx=lightDir.x/flat,sz=lightDir.z/flat,sunSlope=lightDir.y/flat;
    for(let j=0;j<nAxis;j++)for(let i=0;i<nAxis;i++){
      const x=axis[i],z=axis[j],k=j*nAxis+i,h=altitudes[k];xyz.push(x,h,z);
      const ix0=Math.max(0,i-1),ix1=Math.min(nAxis-1,i+1),jz0=Math.max(0,j-1),jz1=Math.min(nAxis-1,j+1);
      const dx=(altitudes[j*nAxis+ix1]-altitudes[j*nAxis+ix0])/(axis[ix1]-axis[ix0]);
      const dz=(altitudes[jz1*nAxis+i]-altitudes[jz0*nAxis+i])/(axis[jz1]-axis[jz0]);
      let shade=1;
      if(h>SEA-.1){
        let horizon=-1;
        for(const length of [23,65,162,365])horizon=Math.max(horizon,(seabed(x+sx*length,z+sz*length)-h)/length);
        shade-=.32*smooth(sunSlope-.05,sunSlope+.13,horizon);
      }
      cover.push(h>SEA+7?woodlandCover(x,z,h,Math.hypot(dx,dz)):0,shade);
      groundUV.push(.5+x/(2*extent),.5+z/(2*extent));
    }
    // Flat stretches of seabed share two triangles per row. Land retains the physics mesh diagonal.
    for(let j=0;j<nAxis-1;j++)for(let i=0;i<nAxis-1;){
      const a=j*nAxis+i,c=a+nAxis;let length=1;
      if(altitudes[a]===BED&&altitudes[c]===BED){
        while(i+length<nAxis-1&&altitudes[a+length]===BED&&altitudes[c+length]===BED
              &&altitudes[a+length+1]===BED&&altitudes[c+length+1]===BED)length++;
      }
      indices.push(a,c,a+length,a+length,c,c+length);i+=length;
    }
    // Continuous shared perimeter, submerged skirt and a closed bottom keep every viewing angle solid.
    const rim=[];
    for(let j=0;j<nAxis;j++)rim.push(j*nAxis);
    for(let i=1;i<nAxis;i++)rim.push((nAxis-1)*nAxis+i);
    for(let j=nAxis-2;j>=0;j--)rim.push(j*nAxis+nAxis-1);
    for(let i=nAxis-2;i>0;i--)rim.push(i);
    const lower=xyz.length/3;
    for(const v of rim){xyz.push(xyz[v*3],BED-8,xyz[v*3+2]);cover.push(0,1);groundUV.push(groundUV[v*2],groundUV[v*2+1]);}
    const bottom=xyz.length/3;xyz.push(0,BED-8,0);cover.push(0,1);groundUV.push(.5,.5);
    for(let i=0;i<rim.length;i++){
      const next=(i+1)%rim.length,a=rim[i],b=rim[next],c0=lower+i,d=lower+next;
      indices.push(a,c0,b,b,c0,d,c0,bottom,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
    g.setAttribute('landCover',new THREE.Float32BufferAttribute(cover,2));g.setAttribute('uv1',new THREE.Float32BufferAttribute(groundUV,2));
    g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,ground.material);mesh.name='海岸地形';mesh.receiveShadow=true;world.add(mesh);
  }
  const extent=axis[nAxis-1];
  const woods=addCoastalWoodland(THREE,world,{seabed,woodlandCover,noise,extent,seaLevel:SEA,sun:lightDir});
  const ground=createCoastalGround(THREE,noiseTex,woods.shadows,SEA);
  buildTerrain();
  // World-aligned bathymetry gives the shallow water a stable tide line without a second coplanar mesh.
  const depthSpan=extent*2, depthSize=1024, depthData=new Uint8Array(depthSize*depthSize*4);
  for(let z=0;z<depthSize;z++)for(let x=0;x<depthSize;x++){
    const h=seabed(((x+.5)/depthSize-.5)*depthSpan,((z+.5)/depthSize-.5)*depthSpan);
    const k=(z*depthSize+x)*4;depthData[k]=255*Math.max(0,Math.min(1,(h-BED)/(SEA+4-BED)));
    depthData[k+1]=depthData[k];depthData[k+2]=depthData[k];depthData[k+3]=255;
  }
  const depths=new THREE.DataTexture(depthData,depthSize,depthSize);depths.magFilter=THREE.LinearFilter;depths.minFilter=THREE.LinearFilter;depths.needsUpdate=true;
  const sea=createOpenSea(THREE,world,{seaLevel:SEA,sun:lightDir,noise:noiseTex,reflection:waterSky,
    skyReady:skyUniforms.uSkyReady,skyLookup,depths,depthSpan,hull:carrier.hullProfile});
  flushInstances();

  const shadowAnchor=new THREE.Vector3(),shadowDelta=new THREE.Vector3();
  const lightRight=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),lightDir).normalize();
  const lightUp=new THREE.Vector3().crossVectors(lightDir,lightRight).normalize();
  const lateralStep=72/2048*256;
  function trackShadow(position){
    shadowDelta.subVectors(position,shadowAnchor);
    if(Math.abs(shadowDelta.dot(lightRight))<13.5 && Math.abs(shadowDelta.dot(lightUp))<13.5 && Math.abs(shadowDelta.dot(lightDir))<48)return;
    const x=Math.round(position.dot(lightRight)/lateralStep)*lateralStep;
    const y=Math.round(position.dot(lightUp)/lateralStep)*lateralStep;
    const z=Math.round(position.dot(lightDir)/48)*48;
    shadowAnchor.copy(lightRight).multiplyScalar(x).addScaledVector(lightUp,y).addScaledVector(lightDir,z);
    sun.target.position.copy(shadowAnchor);sun.position.copy(shadowAnchor).addScaledVector(lightDir,125);
  }
  function update(state) {
    const {position}=state;carrier.updateWind(state);
    if(!position)return;
    sea.update(state,groundHeight(position.x,position.z));
    trackShadow(position);
  }
  return {update,groundHeight,isDeck:carrier.isDeck,obstacleAt:carrier.obstacleAt,ready:Promise.all([skyReady,ground.ready,woods.ready]),seaLevel:carrier.seaLevel,sunDirection:lightDir};
}
