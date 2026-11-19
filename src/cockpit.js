/* Original pilot-eye flight trainer. The exterior proportions reference the public
   JPO cockpit tour (www.jsf.mil/cockpit) and Lockheed Martin's simulator brochure.
   The instrument graphics and all interior geometry are generated locally. */
function createFlightCockpit(T,environment=null,sunDirection=new T.Vector3(-1,1,-1).normalize()){
  const scene=new T.Scene(),rig=new T.Group();scene.environment=environment;scene.add(rig);
  const eye=new T.PerspectiveCamera(66,1,.017,12);
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)), lerp=(a,b,t)=>a+(b-a)*t;
  const num=x=>Number.isFinite(x)?x:0, rad=Math.PI/180, deg=1/rad;
  // Fine moulded grain is mip-filtered for a stable finish at both close and wide angles.
  const grainSize=128,grainBytes=new Uint8Array(grainSize*grainSize*4);
  let randomSeed=537019;
  for(let y=0;y<grainSize;y++)for(let x=0;x<grainSize;x++){
    randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;
    const wave=3*Math.sin(2*Math.PI*x/grainSize)+2*Math.cos(4*Math.PI*y/grainSize);
    const grey=Math.round(234+(randomSeed/4294967295)*17+wave),k=(y*grainSize+x)*4;
    grainBytes[k]=grainBytes[k+1]=grainBytes[k+2]=grey;grainBytes[k+3]=255;
  }
  const grain=new T.DataTexture(grainBytes,grainSize,grainSize);grain.wrapS=grain.wrapT=T.RepeatWrapping;
  grain.minFilter=T.LinearMipmapLinearFilter;grain.magFilter=T.LinearFilter;grain.generateMipmaps=true;grain.needsUpdate=true;
  const matte=new T.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.06,side:T.DoubleSide,
    map:grain,bumpMap:grain,bumpScale:.0008,envMapIntensity:.42});
  const trim=new T.MeshStandardMaterial({vertexColors:true,roughness:.44,metalness:.50,side:T.DoubleSide,envMapIntensity:.62});
  const rubber=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0,side:T.DoubleSide,
    map:grain,bumpMap:grain,bumpScale:.0006,envMapIntensity:.20});
  const bodies=new Map(),pose=new T.Object3D(),shade=new T.Color();
  const sky=new T.HemisphereLight(0xe4ebf2,0x85807c,1.42),sun=new T.DirectionalLight(0xfff1da,2.42);
  sun.castShadow=true;sun.shadow.mapSize.set(256,256);
  Object.assign(sun.shadow.camera,{left:-1.5,right:1.5,top:1.5,bottom:-1.5,near:.1,far:7});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.002;sun.shadow.bias=-.0002;
  scene.add(sky,sun,sun.target,new T.AmbientLight(0xe7e4e0,.32));

  function add(parent,geo,mat,hex,p,r,sz,quat){
    if(geo.index){const old=geo;geo=old.toNonIndexed();old.dispose();}
    if(!geo.attributes.normal)geo.computeVertexNormals();
    pose.position.set(...(p||[0,0,0]));pose.rotation.set(...(r||[0,0,0]));
    if(quat)pose.quaternion.copy(quat);pose.scale.set(...(sz||[1,1,1]));pose.updateMatrix();geo.applyMatrix4(pose.matrix);
    if(!bodies.has(parent))bodies.set(parent,new Map());const parts=bodies.get(parent);
    if(!parts.has(mat))parts.set(mat,{p:[],n:[],c:[],uv:[]});
    const b=parts.get(mat),points=geo.attributes.position,normals=geo.attributes.normal,vertexTint=geo.attributes.color;shade.setHex(hex);
    for(let i=0;i<points.count;i++){
      const x=points.getX(i),y=points.getY(i),z=points.getZ(i),nx=normals.getX(i),ny=normals.getY(i),nz=normals.getZ(i);
      b.p.push(x,y,z);b.n.push(nx,ny,nz);
      if(vertexTint)b.c.push(vertexTint.getX(i),vertexTint.getY(i),vertexTint.getZ(i));else b.c.push(shade.r,shade.g,shade.b);
      if(mat.map===grain){if(Math.abs(ny)>=Math.max(Math.abs(nx),Math.abs(nz)))b.uv.push(x*3.4,z*3.4);
        else if(Math.abs(nx)>Math.abs(nz))b.uv.push(z*3.4,y*3.4);else b.uv.push(x*3.4,y*3.4);}
    }
    geo.dispose();
  }
  function group(parent,p=[0,0,0]){const g=new T.Group();g.position.set(...p);parent.add(g);return g;}
  function box(parent,p,dims,c,mat=matte,r){add(parent,new T.BoxGeometry(...dims),mat,c,p,r);}
  function ell(parent,p,dims,c,mat=matte,r){add(parent,new T.SphereGeometry(1,16,10),mat,c,p,r,dims);}
  function surface(parent,pts,c,mat=matte){
    const g=new T.BufferGeometry(),ids=[];for(let i=1;i<pts.length-1;i++)ids.push(0,i,i+1);
    g.setAttribute('position',new T.Float32BufferAttribute(pts.flat(),3));g.setIndex(ids);g.computeVertexNormals();add(parent,g,mat,c);
  }
  function bar(parent,a,b,w,c,mat=trim,w2=w,n=10){
    const va=new T.Vector3(...a),vb=new T.Vector3(...b),d=vb.clone().sub(va),len=d.length();if(len<1e-5)return;
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.multiplyScalar(1/len));
    add(parent,new T.CylinderGeometry(w2,w,len,n),mat,c,va.lerp(vb,.5).toArray(),null,null,q);
  }
  function segments(parent,rows,c,mat){for(let i=1;i<rows.length;i++)for(let j=1;j<rows[i].length;j++){
    surface(parent,[rows[i-1][j-1],rows[i-1][j],rows[i][j],rows[i][j-1]],Array.isArray(c)?c[j-1]:c,mat);
  }}
  function curvedSkin(parent,rows,colours,mat){
    const p=[],rgb=[],ids=[],count=rows[0].length;
    for(let i=0;i<rows.length;i++)for(let j=0;j<count;j++){
      p.push(...rows[i][j]);shade.setHex(colours[j]);rgb.push(shade.r,shade.g,shade.b);
      if(i<rows.length-1&&j<count-1){const a=i*count+j;ids.push(a,a+1,a+count,a+1,a+count+1,a+count);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    g.setIndex(ids);g.computeVertexNormals();add(parent,g,mat,0xffffff);
  }
  // Original silk-screened hardware placards. The letters take the same incident
  // light as the plate. Fine dark outlines below the bevel provide contact shading.
  function printPlate(parent,p,w,h,title,fields){
    const art=document.createElement('canvas');art.width=512;art.height=Math.round(512*h/w);const q=art.getContext('2d');
    const aw=art.width,ah=art.height;
    const bg=q.createLinearGradient(0,0,0,ah);bg.addColorStop(0,'#3c3d3e');bg.addColorStop(.24,'#343536');bg.addColorStop(1,'#2c2d2e');q.fillStyle=bg;q.fillRect(0,0,aw,ah);
    q.strokeStyle='#565758';q.lineWidth=3;q.strokeRect(7,6,aw-14,ah-12);
    q.fillStyle='#c5c5c0';q.textAlign='left';q.textBaseline='middle';q.font='600 '+Math.round(ah*.135)+'px Arial,sans-serif';q.fillText(title,aw*.075,ah*.23);
    q.fillStyle='#777879';q.fillRect(aw*.064,ah*.355,aw*.865,2);
    q.fillStyle='#b6b8b7';q.font='600 '+Math.round(ah*.105)+'px Arial,sans-serif';
    fields.forEach(([word,x])=>q.fillText(word,aw*x,ah*.82));
    const tx=new T.CanvasTexture(art);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=2;
    const m=new T.MeshStandardMaterial({map:tx,roughness:.84,metalness:.04,side:T.FrontSide,envMapIntensity:.47});
    const printed=new T.Mesh(new T.PlaneGeometry(w,h),m);printed.position.set(...p);parent.add(printed);
  }
  function oct(w,h,clip,z){const x=w/2,y=h/2;return [[-x+clip,-y,z],[x-clip,-y,z],[x,-y+clip,z],[x,y-clip,z],[x-clip,y,z],[-x+clip,y,z],[-x,y-clip,z],[-x,-y+clip,z]];}
  function border(parent,outer,inner,c,mat){for(let i=0;i<outer.length;i++){
    const k=(i+1)%outer.length;surface(parent,[outer[i],outer[k],inner[k],inner[i]],Array.isArray(c)?c[i]:c,mat);
  }}
  function screw(parent,x,y,z,size=.0085){
    bar(parent,[x,y,z],[x,y,z+.0028],size,0x858688,trim,size*.92,12);
    box(parent,[x,y,z+.0032],[size*1.02,size*.20,.0014],0x29282a,rubber,[0,0,.48]);
  }

  // Cockpit tub and side rails extend behind the camera, so looking sideways exposes
  // the shell and the side consoles in their real relative positions.
  for(const s of [-1,1]){
    const rails=[[-1.04,.67,-.257],[-.76,.69,-.220],[-.48,.688,-.204],[-.03,.662,-.182],[.38,.637,-.157],[.73,.629,-.137]];
    const rows=rails.map(([z,x,y])=>[[s*(x+.088),y-.046,z],[s*(x+.078),y-.014,z],[s*(x+.056),y+.008,z],
      [s*(x+.026),y+.021,z],[s*(x+.004),y+.023,z],[s*(x-.018),y+.015,z],[s*(x-.034),y-.004,z],
      [s*(x-.044),y-.060,z],[s*(x-.058),y-.189,z],[s*(x-.082),y-.40,z]]);
    curvedSkin(rig,rows,[0x555658,0x626365,0x696a6b,0x707071,0x69696a,0x5c5d5e,0x515254,0x424345,0x46474a,0x3e3f42],matte);
    const lip=rails.map(([z,x,y])=>[[s*(x+.007),y+.026,z],[s*(x-.011),y+.024,z],[s*(x-.014),y+.019,z]]);
    segments(rig,lip,[0x272628,0x1c1b1d],rubber);
    for(const z of [-.82,-.59,-.32,-.07,.19,.44]){
      const x=.676-.048*(z+.4),y=-.206+.064*(z+.35);
      bar(rig,[s*x,y,z],[s*x,y+.006,z],.010,0x87888a,trim,.009,10);
      box(rig,[s*x,y+.007,z],[.012,.001,.0022],0x29292a,matte,[0,.52,0]);
    }
    box(rig,[s*.553,-.613,-.005],[.231,.145,1.035],0x363638,matte,[0,-s*.065,-s*.12]);
    box(rig,[s*.554,-.531,-.055],[.197,.023,.85],0x414143,matte,[0,-s*.065,-s*.12]);
    for(let j=0;j<5;j++){
      const z=-.336+j*.093;const x=s*.56;
      box(rig,[x,-.509,z],[.084,.018,.057],0x242425,rubber);
      bar(rig,[x,-.497,z],[x+.003,-.475,z-.006],.009,0xa2a2a3,trim,.007,10);
    }
    // Recessed side bay. A short cam handle sits in its pocket between two pinned
    // cheeks. Both of its ends terminate in the mechanism rather than in free air.
    const latch=group(rig,[s*.625,-.269,-.49]);latch.rotation.y=-s*Math.PI/2;latch.rotation.x=.045;
    const well=oct(.213,.063,.013,.002),floor=oct(.173,.039,.010,.006);
    surface(latch,well,0x282829,rubber);border(latch,oct(.215,.065,.014,-.007),well,0x5b5b5c,trim);
    border(latch,well,floor,0x3c3c3d,matte);surface(latch,floor,0x282829,rubber);
    for(const x of [-.064,.064]){
      box(latch,[x,0,.012],[.021,.041,.020],0x4f4f50,matte);
      screw(latch,x,0,.022,.0058);
    }
    const handle=[[-.068,-.007,.018],[-.049,-.011,.019],[.046,-.011,.019],[.062,-.004,.019],[.052,.007,.019],[-.047,.009,.019]];
    surface(latch,handle,0x747578,trim);
    border(latch,handle,handle.map(([x,y])=>[x*.97,y*.87,.024]),0x898a8b,trim);surface(latch,handle.map(([x,y])=>[x*.97,y*.87,.024]),0x5a5a5b,matte);
    for(const x of [-.091,.091])screw(latch,x,-.014,.004,.0048);
    const sidePanel=group(rig,[s*.602,-.376,-.217]);sidePanel.rotation.y=-s*1.40;
    border(sidePanel,oct(.322,.126,.016,-.004),oct(.307,.115,.012,.004),0x4b4b4c,trim);
    surface(sidePanel,oct(.308,.116,.012,.003),0x262627,rubber);
    printPlate(sidePanel,[0,0,.005],.283,.10,s<0?'CABIN LIGHTING':'CABIN AUDIO',s<0?[['PANEL',.14],['FLOOD',.56]]:[['LEVEL',.14],['COM',.58]]);
    for(const x of [-.079,.039]){
      bar(sidePanel,[x,-.001,.007],[x,-.001,.015],.014,0x29292a,rubber,.015,14);
      bar(sidePanel,[x,-.001,.015],[x,-.001,.022],.011,0x686869,trim,.010,12);
      box(sidePanel,[x,-.001,.023],[.0024,.012,.0015],0xc8c7c3,matte,[0,0,.42]);
    }
    for(const x of [-.145,.145])for(const y of [-.046,.046])screw(sidePanel,x,y,.005,.0048);
    for(const z of [.04,.37]){
      const p=group(rig,[s*.599,-.374,z]);p.rotation.y=-s*1.51;
      border(p,oct(.240,.117,.013,0),oct(.224,.100,.010,.005),0x474748,trim);surface(p,oct(.224,.100,.010,.005),0x3c3c3d);
      for(const x of [-.09,.09])screw(p,x,-.036,.006,.0048);
    }
    for(let j=0;j<2;j++)bar(rig,[s*(.596+.008*j),-.466,-.62],[s*(.573+.008*j),-.451,.38],.006,0x2c2c2d,rubber);
    // Recessed structural side rib and the dark seat bolster at the edge of vision.
    surface(rig,[[s*.629,-.249,.52],[s*.597,-.568,.45],[s*.563,-.651,-.55],[s*.646,-.273,-.67]],0x2c2c2d);
    ell(rig,[s*.348,-.555,.22],[.111,.114,.39],0x4b4843,rubber,[-.10,0,-s*.13]);
  }
  box(rig,[0,-.774,-.05],[1.42,.14,1.88],0x242425,matte);
  // Palm grip and throttle handles remain attached to the tub as the pilot looks around.
  const stick=group(rig,[.489,-.554,-.276]);
  ell(stick,[0,.013,0],[.105,.048,.112],0x262627,rubber);
  for(let i=0;i<3;i++)ell(stick,[0,.024+i*.022,-i*.006],[.079-i*.011,.022,.072-i*.007],0x3a3a3b,rubber);
  bar(stick,[0,.04,0],[-.021,.188,-.028],.029,0x3f3f40,matte,.045);
  ell(stick,[-.021,.212,-.030],[.056,.062,.054],0x39393a,rubber,[-.29,0,-.2]);
  ell(stick,[-.034,.247,-.008],[.029,.015,.026],0x6e6e6f,matte);
  const throttle=group(rig,[-.502,-.535,-.221]);
  box(throttle,[0,.028,0],[.142,.049,.307],0x1d1d1e,rubber);
  bar(throttle,[0,.023,.05],[0,.125,.015],.018,0x727273,trim,.018);
  box(throttle,[0,.128,.01],[.144,.057,.081],0x444445,rubber,[-.25,0,0]);

  // Anti-glare coaming: a graduated, faceted shelf with a rolled rubber lip. The
  // middle sits low enough that the deck and horizon remain clearly visible.
  const coaming=group(rig),coverRows=[];
  for(const u of [-1,-.89,-.75,-.55,-.30,0,.30,.55,.75,.89,1]){
    const a=Math.abs(u),wing=clamp((a-.68)/.32,0,1),tip=wing*wing*(3-2*wing),x=.795*u;
    const nearZ=-.880+.043*a*a+.127*tip,farZ=-1.34+.12*a*a+.25*tip;
    const edge=-.111-.022*a*a-.121*tip,brow=-.084-.025*a*a-.109*tip;
    coverRows.push([[x,edge-.035,nearZ-.012],[x,edge-.025,nearZ+.011],[x,edge-.006,nearZ+.015],
      [x,edge+.005,nearZ-.008],[x,brow,lerp(nearZ,farZ,.58)],[x,brow-.014,farZ],[x,brow-.035,farZ-.013]]);
  }
  segments(coaming,coverRows.map(row=>row.slice(0,4)),[0x242325,0x302f30,0x424143],rubber);
  curvedSkin(coaming,coverRows.map(row=>row.slice(3,7)),[0x505052,0x575759,0x515153,0x414143],matte);
  for(const r of [coverRows[0],coverRows[coverRows.length-1]])surface(coaming,r,0x302f30,rubber);
  // The front bulkhead closes the gaps between the display shoulders and the sill.
  const bulkhead=coverRows.map(row=>{
    const [x,y,z]=row[4];
    return [[x,y-.004,z],[x,y-.46,z+.025]];
  });
  segments(rig,bulkhead,0x343436,matte);
  for(const s of [-1,1]){
    for(let j=0;j<6;j++){
      const x=s*(.451+j*.034);box(rig,[x,-.099-(j*.0032),-1.085+j*.008],[.014,.007,.088],0x363637,matte,[.08,0,s*.08]);
    }
  }
  // The short painted spine is visible over the shelf when looking down through the glass.
  const noseRows=[[-1.34,.47,-.145],[-1.90,.369,-.177],[-2.47,.225,-.239],[-3.15,.102,-.301],[-3.56,.01,-.352]]
    .map(([z,w,y])=>[[-w,y-.068,z],[-w*.41,y-.013,z],[0,y,z],[w*.41,y-.013,z],[w,y-.068,z]]);
  segments(rig,noseRows,[0x626366,0x707174,0x6b6d6e,0x626365],matte);
  const screenWidth=1.091,screenHeight=screenWidth/2.5;
  const panel=group(rig,[0,-.397,-.960]);panel.rotation.x=-.27;
  const outer=oct(1.286,screenHeight+.136,.052,-.033),bevel=oct(1.271,screenHeight+.128,.048,.010);
  const rim=oct(1.227,screenHeight+.089,.035,.024),inner=oct(1.112,screenHeight+.016,.009,.022);
  const gasket=oct(screenWidth,screenHeight,.004,.010);
  border(panel,outer,bevel,[0x3e3f40,0x505153,0x555658,0x57585a,0x606163,0x48494a,0x494a4b,0x414243],matte);
  border(panel,bevel,rim,[0x4b4d4f,0x606163,0x66686a,0x757678,0x6c6d6e,0x626365,0x57585a,0x4e4f50],trim);
  border(panel,rim,inner,0x2c2b2d,rubber);border(panel,inner,gasket,[0x5d5d5e,0x434446,0x323234,0x303032,0x252527,0x343436,0x535456,0x5a5b5c],trim);
  surface(panel,oct(1.278,screenHeight+.131,.049,-.036),0x272729);
  for(const s of [-1,1]){
    for(const end of [-1,1])screw(panel,s*.594,end*screenHeight*.49,.027,.008);
    // Two tactile edge knobs and low-profile panel fasteners.
    bar(panel,[s*.580,-.006,.026],[s*.580,-.006,.050],.018,0x2c2b2d,rubber,.017,14);
    bar(panel,[s*.580,-.006,.050],[s*.580,-.006,.052],.0115,0x858687,trim,.013,14);
    for(let j=0;j<2;j++)box(panel,[s*.578,.064+.040*j,.029],[.027,.019,.012],0x474749,rubber);
  }
  // Structural shoulders close the bay behind the display and carry short labelled
  // utility strips, flush with the surrounding front fascia.
  for(const side of [-1,1]){
    const pts=[[side*.625,.204,-.027],[side*.79,.065,-.095],[side*.868,-.142,-.095],
      [side*.741,-.245,-.034],[side*.626,-.247,-.020]];
    surface(panel,pts,0x48494a);border(panel,pts,pts.map(([x,y,z])=>[x,y-.006,z-.020]),0x2e2e2f,rubber);
    const bay=group(panel,[side*.697,-.103,-.043]);bay.rotation.y=-side*.28;bay.rotation.z=-side*.035;
    border(bay,oct(.111,.111,.012,0),oct(.100,.101,.009,.004),0x5f5f60,trim);
    surface(bay,oct(.101,.102,.009,.004),0x2a2a2b,rubber);
    printPlate(bay,[0,.001,.005],.087,.089,side<0?'DISP':'AIR',side<0?[['BRT',.26]]:[['VENT',.19]]);
    bar(bay,[0,-.003,.008],[0,-.003,.016],.017,0x2a2a2b,rubber,.016,18);
    bar(bay,[0,-.003,.016],[0,-.003,.022],.014,0x686869,trim,.012,14);
    box(bay,[0,-.003,.023],[.002,.014,.001],0xc8c7c3,matte,[0,0,side*.37]);
    screw(bay,-.041,.041,.005,.0038);screw(bay,.041,-.040,.005,.0038);
  }
  const dash=group(rig,[0,-.723,-.784]);dash.rotation.x=-.34;
  box(dash,[0,0,0],[.95,.178,.118],0x444547,matte);
  for(const s of [-1,1]){
    box(dash,[s*.224,-.013,.067],[.37,.110,.013],0x272728,rubber);
    for(let j=0;j<4;j++){box(dash,[s*(.092+j*.071),-.001,.079],[.047,.029,.012],0x555658,matte);}
  }
  // The frame and hardware share material batches, including small fasteners.
  for(const [parent,byMat] of bodies)for(const [material,d] of byMat){const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(d.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(d.n,3));
    g.setAttribute('color',new T.Float32BufferAttribute(d.c,3));if(d.uv.length)g.setAttribute('uv',new T.Float32BufferAttribute(d.uv,2));g.computeBoundingSphere();
    const mesh=new T.Mesh(g,material);mesh.castShadow=parent===coaming;mesh.receiveShadow=parent!==coaming;parent.add(mesh);}
  bodies.clear();

  // A single continuous piece of glass contains three original trainer displays.
  const display=document.createElement('canvas');display.width=1000;display.height=400;
  const c=display.getContext('2d',{alpha:false});
  const attitudeCanvas=document.createElement('canvas');
  const attitude=createPilotDisplay(attitudeCanvas,{width:470,height:282});
  const screenMap=new T.CanvasTexture(display);screenMap.colorSpace=T.SRGBColorSpace;
  screenMap.minFilter=T.LinearMipmapLinearFilter;screenMap.magFilter=T.LinearFilter;screenMap.anisotropy=2;
  const glass=new T.MeshStandardMaterial({color:0x08090b,roughness:.32,metalness:0,envMapIntensity:.24,
    emissive:0xffffff,emissiveMap:screenMap,toneMapped:false,fog:false});
  const screen=new T.Mesh(new T.PlaneGeometry(screenWidth,screenHeight),glass);
  screen.receiveShadow=true;screen.position.z=.012;panel.add(screen);
  const digit='"Barlow Condensed", "Arial Narrow", Arial, sans-serif', sans='Arial, Helvetica, sans-serif';
  const bright='#edf0f2',soft='#b5bdc5',gold='#edbd73',divider='#384047';
  const trail=[];
  let previousTime=-1,lastRefresh=-Infinity,lastCompact=null,lastPhase='',sampleZ=Infinity,sampleX=Infinity;
  function text(value,x,y,size,colour=bright,align='left',font=digit){
    c.textBaseline='middle';c.textAlign=align;c.font='600 '+size+'px '+font;c.fillStyle=colour;c.fillText(String(value),x,y);
  }
  function line(pts,colour,w=1){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=colour;c.lineWidth=w;c.stroke();}
  function polygon(pts,colour,outline,thick=1){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=colour;c.fill();if(outline){c.strokeStyle=outline;c.lineWidth=thick;c.stroke();}}
  function field(title,value,x,y,size=27){text(title,x,y,14,soft,'left',sans);text(value,x,y+23,size,bright);}
  function barMeter(x,y,w,f,colour){c.fillStyle='#33383c';c.fillRect(x,y,w,5);c.fillStyle=colour;c.fillRect(x,y,w*clamp(f,0,1),5);}
  const normalHeading=h=>(Math.round(h*deg)%360+360)%360;
  function mapPage(x,y,w,h,state,heading){
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
    const px=num(state.position&&state.position.x),pz=num(state.position&&state.position.z);
    if(!trail.length||Math.hypot(px-sampleX,pz-sampleZ)>7){trail.push([px,pz]);if(trail.length>75)trail.shift();sampleX=px;sampleZ=pz;}
    const extent=Math.max(505,Math.abs(px)*.72,Math.abs(pz)*.66),unit=Math.min(w/(extent*2.3),h/(extent*2.12));
    const ox=px*.50,oz=-355+pz*.46;
    const project=(wx,wz)=>[x+w*.49+(wx-ox)*unit,y+h*.49+(wz-oz)*unit];
    c.fillStyle='#10171e';c.fillRect(x,y,w,h);
    const grid=extent>1000?500:250;
    for(let i=Math.floor((ox-w/unit)/grid);i<=(ox+w/unit)/grid;i++){const xx=project(i*grid,0)[0];line([[xx,y],[xx,y+h]],'#2c343d',1);}
    for(let i=Math.floor((oz-h/unit)/grid);i<=(oz+h/unit)/grid;i++){const yy=project(0,i*grid)[1];line([[x,yy],[x+w,yy]],'#2c343d',1);}
    function island(wx,wz,rx,rz,phase){
      const loop=(scale)=>Array.from({length:37},(_,i)=>{const a=i/36*2*Math.PI,r=scale*(1+.14*Math.sin(3*a+phase)+.08*Math.cos(7*a-phase));return project(wx+r*rx*Math.cos(a),wz+r*rz*Math.sin(a));});
      polygon(loop(1.19),'#293744');polygon(loop(1),'#53534b','#818178',1);polygon(loop(.62),'#666359','#787469',.8);
    }
    island(-88,-495,48,33,.9);island(92,-805,53,37,3.4);
    island(-1230,-1110,370,145,2.2);island(-700,-1650,250,152,3.1);island(1010,-990,275,210,1.3);
    const home=project(0,0), own=project(px,pz);
    for(const radius of [250,500]){c.beginPath();c.arc(own[0],own[1],radius*unit,0,2*Math.PI);c.strokeStyle='#46515b';c.lineWidth=1;c.stroke();}
    if(trail.length>1)line(trail.map(v=>project(...v)),'#91afc5',1.8);
    if(Math.hypot(px,pz)>28){c.setLineDash([6,5]);line([home,own],gold,1.3);c.setLineDash([]);}
    c.save();c.translate(home[0],home[1]);polygon([[-3,-8],[2,-10],[4,-6],[4,9],[-3,9]],'#33383d',gold,1.5);c.restore();
    text('CV',home[0]+9,home[1]+6,14,gold);
    c.save();c.translate(own[0],own[1]);c.rotate(heading);polygon([[0,-10],[6,7],[0,4],[-6,7]],bright,'#1a222a',1.7);c.restore();
    text('N',x+12,y+13,15,soft,'center');polygon([[x+12,y+24],[x+8,y+32],[x+16,y+32]],soft);
    // The scale bar is tied to the chart projection, including when the map zooms out.
    const metres=extent>1000?500:200,len=metres*unit,rx=x+w-9,ry=y+h-10;
    line([[rx-len,ry-3],[rx-len,ry],[rx,ry],[rx,ry-3]],soft,1.6);text(metres+' M',rx,y+h-19,13,soft,'right');
    c.restore();
  }
  function gauge(x,y,r,label,value,suffix,fraction){
    const start=Math.PI*.77,end=Math.PI*2.23;
    c.beginPath();c.arc(x,y,r,start,end);c.strokeStyle='#434b52';c.lineWidth=5;c.stroke();
    c.beginPath();c.arc(x,y,r,start,start+(end-start)*clamp(fraction,0,1));c.strokeStyle='#8fc7a3';c.lineWidth=5;c.stroke();
    for(let i=0;i<=8;i++){const a=lerp(start,end,i/8),d=i%2===0?6:3;
      line([[x+Math.cos(a)*(r-2),y+Math.sin(a)*(r-2)],[x+Math.cos(a)*(r-d-2),y+Math.sin(a)*(r-d-2)]],soft,1.3);}
    text(label,x,y-r*.20,14,soft,'center',sans);text(value+suffix,x,y+r*.36,32,bright,'center');
  }
  function page(state,narrow){
    const W=narrow?740:display.width,H=W*display.height/display.width;
    const heading=num(state.displayHeading??state.heading),pitch=num(state.displayPitch??state.pitch),roll=num(state.displayRoll??state.roll);
    const thrust=clamp(num(state.thrust),0,1),nozzle=clamp(num(state.nozzle)*deg,0,90),fuel=clamp(num(state.fuel??100),0,100);
    const engine=clamp(num(state.engine),0,1),gear=clamp(num(state.gear),0,1),flap=clamp(num(state.flap),0,1);
    const attitudeState={...state,heading,roll,pitch,displayHeading:heading,displayPitch:pitch,displayRoll:roll};
    attitude.draw(attitudeState);
    const scale=display.width/W,band=narrow?25:33;
    c.setTransform(scale,0,0,scale,0,0);
    c.fillStyle='#080a0c';c.fillRect(0,0,W,H);
    c.fillStyle='#191d21';c.fillRect(0,0,W,band);c.fillRect(0,H-band,W,band);
    const aEnd=narrow?W*.48:W*.425,mapEnd=narrow?W:W*.72;
    text('FLIGHT',10,band/2,18,bright,'left',sans);text('NAV',aEnd+10,band/2,18,bright,'left',sans);
    text(String(normalHeading(heading)).padStart(3,'0')+'°',mapEnd-10,band/2,20,bright,'right');
    line([[aEnd,0],[aEnd,H-band]],divider,2);
    const aw=aEnd-14,ah=aw*attitudeCanvas.height/attitudeCanvas.width,top=band+6;
    c.drawImage(attitudeCanvas,7,top,aw,ah);
    if(narrow){
      const rowY=H-band-17;
      text('AGL',9,rowY,13,soft,'left',sans);text(Math.round(num(state.agl))+' M',39,rowY,21);
      text('THR',aEnd*.42,rowY,13,soft,'left',sans);text(Math.round(thrust*100)+'%',aEnd*.42+33,rowY,21);
      text('FUEL',aEnd*.72,rowY,13,soft,'left',sans);text(Math.round(fuel)+'%',aEnd*.72+39,rowY,21);
      mapPage(aEnd+3,band+3,W-aEnd-6,H-2*band-51,state,heading);
      text('VECTOR',aEnd+11,rowY,13,soft,'left',sans);text(Math.round(nozzle)+'°',aEnd+72,rowY,22);
      text('GEAR',aEnd+(W-aEnd)*.52,rowY,13,soft,'left',sans);
      text(gear>.85?'DN':gear<.15?'UP':'TRANS',aEnd+(W-aEnd)*.52+46,rowY,22);
    }else{
      const rowY=(top+ah+H-band)/2-12;
      field('AGL',Math.round(num(state.agl))+' M',12,rowY);
      field('LOAD',num(state.loadFactor??1).toFixed(1)+' G',aEnd*.54,rowY);
      mapPage(aEnd+3,band+3,mapEnd-aEnd-6,H-2*band-6,state,heading);
      line([[mapEnd,0],[mapEnd,H-band]],divider,2);const sw=W-mapEnd;
      text('AIRFRAME',mapEnd+11,band/2,17,bright,'left',sans);
      const rr=sw*.17;gauge(mapEnd+sw*.26,114,rr,'THR',String(Math.round(thrust*100)),'%',thrust);
      gauge(mapEnd+sw*.74,114,rr,'VECTOR',String(Math.round(nozzle)),'°',nozzle/90);
      field('FUEL',Math.round(fuel)+'%',mapEnd+14,203);barMeter(mapEnd+14,248,sw*.42,fuel/100,'#8fc7a3');
      field('GEAR',gear>.86?'DOWN':gear<.14?'UP':'TRANS',mapEnd+sw*.58,203);
      field('FLAPS',Math.round(flap*100)+'%',mapEnd+14,291);
      field('WIND',Math.round(Math.hypot(num(state.windX),num(state.windZ))*1.94384)+' KT',mapEnd+sw*.58,291);
    }
    const baseline=H-band/2;
    c.fillStyle=engine>.10?'#8fc7a3':gold;c.beginPath();c.arc(12,baseline,4,0,Math.PI*2);c.fill();
    text(engine>.10?'ENGINE RUN':'ENGINE OFF',24,baseline,15,bright,'left',sans);
    const mode=state.onGround?'GROUND':state.mode==='hover'?'HOVER':'CRUISE';text(mode,W-10,baseline,16,bright,'right',sans);
    screenMap.needsUpdate=true;
  }
  const lastShadowSun=new T.Vector3(),airQ=new T.Quaternion(),airEuler=new T.Euler(0,0,0,'YXZ');
  function reset(){lastRefresh=-Infinity;lastCompact=null;lastPhase='';previousTime=-1;trail.length=0;sampleX=sampleZ=Infinity;}
  function render(renderer,worldCamera,state,lookYaw=0,lookPitch=0,viewHeight=renderer.domElement.clientHeight){
    const ar=worldCamera.aspect;
    const fov=worldCamera.getEffectiveFOV?worldCamera.getEffectiveFOV():worldCamera.fov;
    if(eye.fov!==fov||eye.aspect!==ar){eye.fov=fov;eye.aspect=ar;eye.updateProjectionMatrix();}
    eye.rotation.set(num(lookPitch),num(lookYaw),0,'YXZ');
    if(state.attitudeQuaternion)airQ.copy(state.attitudeQuaternion);
    else airQ.setFromEuler(airEuler.set(num(state.pitch),-num(state.heading),num(state.roll),'YXZ'));
    airQ.invert();
    sky.position.set(0,1,0).applyQuaternion(airQ);
    sun.position.copy(sunDirection).applyQuaternion(airQ).multiplyScalar(4);
    stick.rotation.z=-clamp(num(state.turn),-1,1)*.13;
    stick.rotation.x=clamp(num(state.pitchInput),-1,1)*.15;
    const projectedWidth=viewHeight*screenWidth/(-2*panel.position.z*Math.tan(fov*rad/2));
    const compact=projectedWidth<390,now=performance.now();
    const time=num(state.time);if(time<previousTime-.1)reset();previousTime=time;
    if(now-lastRefresh>105||compact!==lastCompact||state.phase!==lastPhase){page(state,compact);lastRefresh=now;lastCompact=compact;lastPhase=state.phase;}
    const auto=renderer.autoClear,pendingShadow=renderer.shadowMap.needsUpdate;
    renderer.autoClear=false;
    // The coaming is rigid. Only a change in the local sun direction moves its shadow.
    renderer.shadowMap.needsUpdate=lastShadowSun.distanceToSquared(sun.position)>.000004;
    if(renderer.shadowMap.needsUpdate)lastShadowSun.copy(sun.position);
    try{renderer.clearDepth();renderer.render(scene,eye);}finally{
      renderer.autoClear=auto;renderer.shadowMap.needsUpdate=pendingShadow;
    }
  }
  return {render,reset};
}
