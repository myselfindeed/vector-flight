/* Original unarmed deck aircraft. Geometry is baked by surface material across the parking bays. */
function createDeckFleet(T,world,solidBox){
  'use strict';
  const deck=new T.Group();deck.name='甲板停机区';world.add(deck);
  const stands=[
    {id:'21',type:'twin',x:16.3,z:64.2,yaw:.38,body:0x87959b,lower:0x687782,accent:0xc58d4d,glass:0x63818b,fold:1.07},
    {id:'12',type:'tandem',x:16.75,z:31.9,yaw:-.13,body:0xd0d0c0,lower:0x819099,accent:0xb96144,glass:0x577582,fold:.63},
    {id:'41',type:'survey',x:15.45,z:-56.4,yaw:-.15,body:0xb7c1b8,lower:0x7b8985,accent:0x978653,glass:0x506b73,fold:1.19},
    {id:'06',type:'rotor',x:16.6,z:92.8,yaw:2.82,body:0xc78b4c,lower:0x526c78,accent:0xdad7c2,glass:0x506d76},
    {id:'27',type:'twin',x:-26.05,z:3.6,yaw:-.56,body:0x677f8e,lower:0x526975,accent:0xc6c8b4,glass:0x526e79,fold:.92},
    {id:'32',type:'tandem',x:-22.64,z:35.0,yaw:2.95,body:0xa8b6b8,lower:0x798b91,accent:0xc4874a,glass:0x556e79,fold:1.29}
  ];
  const TAU=Math.PI*2,ink=0x35444b,edge=0x707b7c,steel=0x9aa29d,tyre=0x303739;
  const skin='skin',glass='glass',decal='decal',contact='contact';
  const chunks={};for(const key of [skin,glass,decal,contact])chunks[key]={p:[],n:[],c:[],u:[],i:[],ranges:[]};
  const unitBar=new T.CylinderGeometry(.5,.5,1,8),unitWheel=new T.CylinderGeometry(.5,.5,1,14),ball=new T.SphereGeometry(.5,12,8);
  const local=new T.Object3D(),pose=new T.Matrix4(),combined=new T.Matrix4(),normalMatrix=new T.Matrix3();
  const vertex=new T.Vector3(),normal=new T.Vector3(),line=new T.Vector3(),up=new T.Vector3(0,1,0),color=new T.Color();
  let plane,slot;
  function append(g,tint,group=skin,localTransform=null){
    const b=chunks[group],base=b.p.length/3,xyz=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv;
    if(localTransform)combined.multiplyMatrices(pose,localTransform);else combined.copy(pose);
    normalMatrix.getNormalMatrix(combined);color.set(tint);
    for(let i=0;i<xyz.count;i++){
      vertex.fromBufferAttribute(xyz,i).applyMatrix4(combined);normal.fromBufferAttribute(norm,i).applyNormalMatrix(normalMatrix);
      b.p.push(vertex.x,vertex.y,vertex.z);b.n.push(normal.x,normal.y,normal.z);b.c.push(color.r,color.g,color.b);
      if(group===decal||group===contact)b.u.push(uv.getX(i),uv.getY(i));
    }
    if(g.index){for(const i of g.index.array)b.i.push(base+i);}else for(let i=0;i<xyz.count;i++)b.i.push(base+i);
  }
  function shape(g,col,x,y,z,w,h,d,ax=0,ay=0,az=0,group=skin){
    local.position.set(x,y,z);local.rotation.set(ax,ay,az);local.scale.set(w,h,d);local.updateMatrix();append(g,col,group,local.matrix);
  }
  function faces(p,index,col,group=skin,uv){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p.flat(),3));g.setIndex(index);
    if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv.flat(),2));g.computeVertexNormals();append(g,col,group);g.dispose();
  }
  function quad(a,b,c,d,col,group=skin,uv){faces([a,b,c,d],[0,1,2,0,2,3],col,group,uv);}
  function rod(a,b,width,col){
    local.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);line.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const length=line.length();local.quaternion.setFromUnitVectors(up,line.divideScalar(length));local.scale.set(width,length,width);local.updateMatrix();append(unitBar,col,skin,local.matrix);
  }
  function obstruction(x,y,z,w,h,d,localYaw=0){
    vertex.set(x,y,z).applyMatrix4(pose);solidBox(vertex.x,vertex.y,vertex.z,w,h,d,plane.yaw+localYaw);
  }
  function enclose(points){
    const b=new T.Box3();for(const v of points)b.expandByPoint(vertex.fromArray(v));
    const mid=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());
    obstruction(mid.x,mid.y,mid.z,Math.max(.13,size.x),Math.max(.15,size.y),Math.max(.13,size.z));
  }
  function label(a,b,c,d,dark){
    const u0=(slot+.025)/stands.length,u1=(slot+.975)/stands.length,v0=dark?.025:.525,v1=dark?.475:.975;
    quad(a,b,c,d,0xffffff,decal,[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
  }
  function shadow(x,z,width,length){
    const y=.016;quad([x-width/2,y,z+length/2],[x+width/2,y,z+length/2],[x+width/2,y,z-length/2],[x-width/2,y,z-length/2],0xffffff,contact,[[0,0],[1,0],[1,1],[0,1]]);
  }
  // Each fuselage is a continuous loft. The shoulder, keel and nose can have different profiles.
  function fuselage(rows,noseColour){
    const count=14,p=[],idx=[],top=[],bottom=[];
    for(const [z,cy,rx,ry] of rows)for(let j=0;j<count;j++){
      const a=j*TAU/count,x=Math.cos(a),y=Math.sin(a);p.push([rx*x*(1+.09* Math.max(0,-y)),cy+ry*y,z]);
    }
    for(let k=0;k<rows.length-1;k++)for(let j=0;j<count;j++){
      const a=k*count+j,b=k*count+(j+1)%count,c=a+count,d=b+count;
      const list=k===0?idx:Math.sin((j+.5)*TAU/count)<-.35?bottom:top;list.push(a,b,c,b,d,c);
    }
    // Keep common normals across colour panels by computing the complete surface before splitting the indices.
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p.flat(),3));g.setIndex([...idx,...top,...bottom]);g.computeVertexNormals();
    for(const [tri,col] of [[idx,noseColour],[top,plane.body],[bottom,plane.lower]]){g.setIndex(tri);append(g,col);}
    g.dispose();
    const last=rows.length-1;
    for(const [k,col] of [[0,noseColour],[last,plane.lower]]){
      const ix=[];for(let j=1;j<count-1;j++)ix.push(0,j+1,j);faces(p.slice(k*count,(k+1)*count),ix,col);
    }
    const cuts=[0,Math.max(1,Math.floor(last*.28)),Math.min(last-1,Math.ceil(last*.69)),last];
    for(let i=1;i<cuts.length;i++)enclose(p.slice(cuts[i-1]*count,(cuts[i]+1)*count));
  }
  function canopy(rows){
    const slices=12,p=[],idx=[];
    for(const [z,y,w,h] of rows)for(let j=0;j<=slices;j++){const a=j*Math.PI/slices;p.push([Math.cos(a)*w,y+Math.sin(a)*h,z]);}
    for(let k=0;k<rows.length-1;k++)for(let j=0;j<slices;j++){
      const a=k*(slices+1)+j;idx.push(a,a+1,a+slices+1,a+1,a+slices+2,a+slices+1);
    }
    faces(p,idx,plane.glass,glass);
    for(const row of [rows[1], rows[Math.floor(rows.length*.64)]]){
      const [z,y,w,h]=row;
      for(let j=0;j<slices;j++){
        const a=j*Math.PI/slices,b=(j+1)*Math.PI/slices;rod([Math.cos(a)*(w+.011),y+Math.sin(a)*(h+.015),z],[Math.cos(b)*(w+.011),y+Math.sin(b)*(h+.015),z],.041,ink);
      }
    }
    enclose(p);
    for(const sign of [-1,1])for(let k=0;k<rows.length-1;k++){
      const a=rows[k],b=rows[k+1];rod([sign*a[2],a[1],a[0]],[sign*b[2],b[1],b[0]],.043,edge);
    }
  }
  function wing(side,stations,hinge,angle,accent){
    // Rings run from the rounded leading edge across the airfoil and back underneath the trailing edge.
    const profile=[[0,0],[.17,.84],[.48,.65],[.84,.28],[1,-.05],[.62,-.44],[.20,-.58]];
    function point(row,chord,thick){
      const [span,lead,trail,y,height]=row,extra=Math.max(0,span-hinge);
      return [side*(span-extra+Math.cos(angle)*extra),y+Math.sin(angle)*extra+thick*height,lead+(trail-lead)*chord];
    }
    const bounds=[[],[]];
    for(let k=0;k<stations.length-1;k++){
      const a=stations[k],b=stations[k+1],tint=k===stations.length-2&&accent?plane.accent:plane.body;
      for(const strip of [profile.slice(0,5),[profile[4],profile[5],profile[6],profile[0]]]){
        const p=[],idx=[],v=strip.length;for(const row of [a,b])for(const f of strip)p.push(point(row,f[0],f[1]));
        for(let j=0;j<v-1;j++){const n=j+1;if(side>0)idx.push(j,n,j+v,n,n+v,j+v);else idx.push(j,j+v,n,n,j+v,n+v);}
        faces(p,idx,tint);bounds[+(a[0]>=hinge)].push(...p);
      }
      if(k<stations.length-2){
        const edgePoint=(row,t,h)=>{const p=point(row,t,h);p[1]+=.010;return p;};
        quad(edgePoint(a,.736,.388),edgePoint(b,.736,.388),edgePoint(b,.750,.373),edgePoint(a,.750,.373),plane.lower);
      }
      if(k===stations.length-2){const p=profile.map(f=>point(b,f[0],f[1])),idx=[];for(let j=1;j<profile.length-1;j++)idx.push(0,j,j+1);faces(p,idx,tint);}
    }
    for(const v of bounds)if(v.length)enclose(v);
    if(hinge<stations[stations.length-1][0]){
      const seam=stations.find(r=>Math.abs(r[0]-hinge)<.001);
      if(seam)rod(point(seam,.12,.84),point(seam,.89,.38),.053,edge);
    }
  }
  function fin(side,baseX,y,z0,z1,z2,z3,height,cant,mark){
    function at(h,t,offset){const x=baseX+side*cant*h;return [x+offset,y+height*h,z0+(z2-z0)*h+(z1-z0+(z3-z2-z1+z0)*h)*t];}
    const bands=[[0,.63,plane.body],[.63,.70,plane.lower],[.70,.78,plane.accent],[.78,.91,plane.body],[.91,1,plane.accent]];
    for(const [a,b,col] of bands){
      for(const s of [-1,1]){const o=.042*s;quad(at(a,0,o),at(a,1,o),at(b,1,o),at(b,0,o),col);}
      quad(at(a,0,-.042),at(b,0,-.042),at(b,0,.042),at(a,0,.042),edge);
    }
    enclose([at(0,0,-.042),at(0,1,.042),at(1,0,-.042),at(1,1,.042)]);
    if(!mark)return;
    for(const s of [-1,1]){
      const o=s*.054,left=s>0?.79:.20,right=s>0?.20:.79;
      label(at(.21,left,o),at(.21,right,o),at(.59,right,o),at(.59,left,o),plane.type==='tandem'||plane.type==='survey');
    }
  }
  function wheel(x,z,top,radius,chocks){
    const y=radius-.003;rod([x*.78,top,z-.11],[x,y,z],.108,steel);
    if(Math.abs(x)>.12)rod([x*.60,top-.04,z+.50],[x,y+.08,z],.071,edge);
    shape(unitWheel,tyre,x,y,z,2*radius,.195,2*radius,0,0,Math.PI/2);
    for(const s of [-1,1])shape(unitWheel,steel,x+s*.102,y,z,radius*.90,.022,radius*.90,0,0,Math.PI/2);
    obstruction(x,y,z,.25,radius*2,radius*2);
    shadow(x,z,radius*1.32,radius*2.45);
    if(chocks)for(const s of [-1,1]){
      const zc=z+s*(radius*.75+.10),o=.19,p=[[x-o,.025,zc-s*.115],[x+o,.025,zc-s*.115],[x+o,.15,zc-s*.10],[x-o,.15,zc-s*.10],[x-o,.025,zc+s*.14],[x+o,.025,zc+s*.14]];
      faces(p,[0,3,2,0,2,1,3,4,5,3,5,2,0,4,3,1,2,5],0xc39749);
    }
  }
  function duct(x,y,z,rx,ry,sign){
    const p=[],idx=[],n=14;
    for(let j=0;j<n;j++){
      const a=TAU*j/n,b=TAU*(j+1)/n,outer=t=>[x+rx*Math.cos(t),y+ry*Math.sin(t),z],inner=t=>[x+rx*.78*Math.cos(t),y+ry*.78*Math.sin(t),z+sign*.025];
      const base=p.length;p.push(outer(a),outer(b),inner(b),inner(a));idx.push(base,base+1,base+2,base,base+2,base+3);
    }
    faces(p,idx,edge);const disk=[[x,y,z+sign*.047]];for(let j=0;j<n;j++){const a=j*TAU/n;disk.push([x+rx*.79*Math.cos(a),y+ry*.79*Math.sin(a),z+sign*.043]);}
    const triangles=[];for(let j=0;j<n;j++)triangles.push(0,j+1,1+(j+1)%n);faces(disk,triangles,0x29363a);
  }
  function jets(tandem){
    if(tandem){
      const rows=[[-5.72,1.23,.055,.06],[-4.64,1.34,.39,.39],[-3.53,1.39,.59,.52],[-1.85,1.43,.78,.61],[.48,1.45,.81,.65],[2.31,1.46,.63,.51],[4.57,1.53,.39,.34],[5.28,1.54,.32,.29]];
      fuselage(rows,plane.accent);
      canopy([[-3.60,1.65,.08,.075],[-3.26,1.69,.38,.30],[-2.59,1.75,.52,.51],[-1.8,1.84,.56,.53],[-1.12,1.92,.55,.46],[-.43,1.96,.47,.41],[.48,1.88,.16,.13]]);
      for(const sign of [-1,1]){
        ribbon(rows,sign,-4.27,3.98,-.30,-.12,plane.accent);
        wing(sign,[[.55,-1.05,2.03,1.29,.14],[2.42,-.23,2.27,1.32,.125],[3.05,.05,2.21,1.34,.105],[4.29,.49,2.12,1.34,.067],[4.70,.71,1.95,1.34,.045]],3.05,plane.fold,true);
        wing(sign,[[.30,3.55,5.03,1.58,.087],[1.52,4.10,5.11,1.57,.057],[2.02,4.29,5.00,1.56,.036]],9,0,false);
        duct(sign*.72,1.42,-1.80,.237,.30,-1);
      }
      fin(1,0,1.58,2.49,5.00,4.00,4.91,1.69,0,true);
      duct(0,1.54,5.30,.31,.29,1);wheel(0,-3.47,1.08,.234,false);
      for(const s of [-1,1])wheel(s*1.12,.98,1.32,.278,true);
      shadow(0,.0,3.24,9.25);
    }else{
      const rows=[[-6.43,1.39,.032,.055],[-4.82,1.49,.48,.38],[-3.44,1.50,.83,.49],[-2.15,1.50,1.02,.56],[-.76,1.52,1.21,.65],[1.14,1.51,1.31,.60],[2.95,1.50,1.05,.52],[4.53,1.46,.74,.46],[5.65,1.44,.50,.42]];
      fuselage(rows,0x626e75);
      canopy([[-4.35,1.71,.12,.09],[-3.80,1.79,.47,.39],[-3.04,1.87,.65,.58],[-2.12,1.92,.67,.59],[-1.49,1.96,.53,.40],[-.82,1.99,.20,.16]]);
      for(const sign of [-1,1]){
        ribbon(rows,sign,-4.23,3.54,.07,.15,plane.lower);
        wing(sign,[[.75,-2.47,3.06,1.63,.19],[2.16,-1.12,3.25,1.56,.15],[3.14,-.13,2.79,1.53,.12],[4.28,.74,2.49,1.53,.082],[4.82,1.26,2.30,1.52,.049]],3.14,plane.fold,true);
        wing(sign,[[.63,3.16,5.66,1.47,.11],[1.94,4.06,5.99,1.46,.079],[2.69,4.98,5.78,1.45,.046]],9,0,false);
        fin(sign,sign*.74,1.78,2.40,5.05,3.85,4.91,1.73,.61,true);
        const x=sign*.96;shape(ball,plane.lower,x,1.39,-.61,.85,.78,2.66);duct(x,1.39,-1.90,.37,.29,-1);
      }
      duct(0,1.44,5.67,.48,.39,1);wheel(0,-3.69,1.08,.258,false);
      for(const side of [-1,1])wheel(side*1.29,1.07,1.42,.305,true);
      shadow(0,.36,3.72,10.53);
    }
  }
  function skinPoint(rows,side,z,angle){
    let i=1;while(i<rows.length-1&&rows[i][0]<z)i++;
    const a=rows[i-1],b=rows[i],f=(z-a[0])/(b[0]-a[0]);const at=k=>a[k]+(b[k]-a[k])*f;
    const step=TAU/14,lo=Math.floor(angle/step)*step,hi=lo+step,t=(angle-lo)/step;
    const xx=a=>Math.cos(a)*(1+.09*Math.max(0,-Math.sin(a)));
    const rx=at(2)*(xx(lo)*(1-t)+xx(hi)*t)+.033*Math.cos(angle);
    const y=at(1)+at(3)*(Math.sin(lo)*(1-t)+Math.sin(hi)*t)+.033*Math.sin(angle);
    return [side*rx,y,z];
  }
  function ribbon(rows,side,start,end,lo,hi,col){
    const zs=[start,...rows.map(r=>r[0]).filter(z=>z>start&&z<end),end];
    for(let i=0;i<zs.length-1;i++)quad(skinPoint(rows,side,zs[i],lo),skinPoint(rows,side,zs[i+1],lo),skinPoint(rows,side,zs[i+1],hi),skinPoint(rows,side,zs[i],hi),col);
  }
  function windowPanel(rows,side,start,end,lo,hi){
    const p=[],ix=[],step=TAU/14;
    const zs=[start,...rows.map(r=>r[0]).filter(z=>z>start&&z<end),end];
    const angles=[lo];for(let k=Math.floor(lo/step)+1;k*step<hi;k++)angles.push(k*step);angles.push(hi);
    for(let i=0;i<zs.length;i++)for(let j=0;j<angles.length;j++){
      p.push(skinPoint(rows,side,zs[i],angles[j]));
      const a=i*angles.length+j,b=a+angles.length;
      if(i<zs.length-1&&j<angles.length-1)ix.push(a,b,a+1,a+1,b,b+1);
    }
    faces(p,ix,plane.glass,glass);
    const last=(zs.length-1)*angles.length;
    for(let i=0;i<angles.length-1;i++){rod(p[i],p[i+1],.028,edge);rod(p[last+i],p[last+i+1],.028,edge);}
  }
  function propeller(x,y,z,radius,phase){
    shape(unitWheel,steel,x,y,z,.235,.22,.235,Math.PI/2);shape(ball,plane.accent,x,y,z-.13,.32,.32,.42);
    obstruction(x,y,z,radius*2,radius*2,.29);
    for(let k=0;k<3;k++){
      const a=phase+k*TAU/3,c=Math.cos(a),s=Math.sin(a);
      function v(r,width){return [x+c*r-s*width,y+s*r+c*width,z-.025-r*.033];}
      quad(v(.15,-.046),v(radius*.79,-.105),v(radius*.79,.074),v(.15,.038),ink);
      quad(v(radius*.79,-.105),v(radius,-.055),v(radius,.046),v(radius*.79,.074),0xd5bc77);
    }
  }
  function survey(){
    const rows=[[-5.33,1.35,.082,.12],[-4.48,1.45,.60,.44],[-3.53,1.55,.86,.69],[-2.05,1.62,.99,.81],[.37,1.66,1.0,.83],[2.22,1.68,.81,.69],[4.19,1.76,.41,.40],[5.40,1.84,.18,.23]];
    fuselage(rows,plane.lower);
    for(const side of [-1,1]){
      ribbon(rows,side,-3.68,4.1,-.34,-.16,plane.accent);
      windowPanel(rows,side,-3.91,-2.91,.18,1.24);windowPanel(rows,side,-2.78,-2.02,.19,.90);
      for(const z of [-1.52,-.64,.24])windowPanel(rows,side,z,z+.62,.19,.69);
      wing(side,[[.55,-1.21,1.48,2.29,.16],[2.20,-1.05,1.40,2.35,.15],[3.12,-.94,1.24,2.37,.11],[4.64,-.59,1.18,2.37,.077],[5.22,-.39,1.05,2.37,.052]],3.12,plane.fold,true);
      wing(side,[[.19,3.86,5.23,2.60,.075],[1.65,4.11,5.18,2.61,.051],[2.24,4.37,5.10,2.63,.035]],9,0,false);
      const x=side*2.02;shape(ball,plane.lower,x,1.98,-.34,.76,.81,3.08);shape(unitWheel,plane.accent,x,1.99,-1.82,.71,.33,.71,Math.PI/2);
      propeller(x,2.0,-2.02,1.04,side>0?.46:1.15);
      wheel(side*1.74,.78,2.15,.295,true);obstruction(x,1.93,-.51,.86,1.05,3.15);
    }
    fin(1,0,1.88,2.73,5.32,4.48,5.34,1.84,0,true);wheel(0,-3.43,1.19,.245,false);
    shadow(0,.05,3.69,9.26);
  }
  function rescue(){
    const rows=[[-3.94,1.24,.14,.22],[-3.38,1.46,.69,.58],[-2.67,1.57,1.04,.83],[-1.54,1.61,1.19,.92],[.40,1.60,1.22,.91],[1.66,1.60,.99,.80],[2.81,1.73,.54,.47],[3.42,1.81,.35,.34]];
    fuselage(rows,plane.body);
    fuselage([[2.37,1.81,.51,.44],[3.54,1.94,.38,.34],[5.10,2.23,.25,.25],[6.58,2.50,.097,.16]],plane.lower);
    for(const side of [-1,1]){
      ribbon(rows,side,-3.19,2.28,-.43,-.25,plane.accent);
      windowPanel(rows,side,-3.33,-2.50,.12,1.40);windowPanel(rows,side,-2.40,-1.48,.09,1.06);
      windowPanel(rows,side,-1.26,-.37,.13,.86);windowPanel(rows,side,-.20,.88,.13,.86);
      const a=skinPoint(rows,side,-1.25,-.38),b=skinPoint(rows,side,.93,-.38),c=skinPoint(rows,side,.93,.91);rod(a,b,.037,edge);rod(b,c,.034,edge);
      shape(ball,plane.lower,side*1.02,.91,.63,.71,.64,2.33);
      wheel(side*1.07,.97,.98,.26,true);
      wing(side,[[.13,4.30,5.43,2.05,.064],[1.01,4.53,5.44,2.07,.049],[1.36,4.64,5.43,2.10,.029]],9,0,true);
    }
    wheel(0,-2.95,.95,.22,false);
    fin(1,0,2.24,4.79,6.57,6.04,6.54,1.50,0,true);
    const tx=-.29,ty=2.86,tz=6.12;shape(unitWheel,steel,tx,ty,tz,.28,.55,.28,0,0,Math.PI/2);
    obstruction(tx-.11,ty,tz,.34,1.67,1.67);
    for(let k=0;k<4;k++){
      const a=.27+k*Math.PI/2,c=Math.cos(a),s=Math.sin(a);
      const q=(r,w)=>[tx-.18,ty+c*r-s*w,tz+s*r+c*w];
      quad(q(.10,-.042),q(.76,-.070),q(.80,.039),q(.10,.037),ink);
      quad(q(.72,-.067),q(.86,-.040),q(.86,.026),q(.76,.039),plane.accent);
    }
    shape(ball,plane.lower,0,2.43,-.04,1.50,.68,2.81);shape(unitWheel,steel,0,3.01,-.20,.21,.91,.21);
    shape(unitWheel,edge,0,3.51,-.20,.73,.19,.73);shape(ball,plane.lower,0,3.61,-.20,.61,.22,.61);
    for(const a of [-.41,.49,Math.PI-.36,Math.PI+.32]){
      const c=Math.cos(a),s=Math.sin(a);const v=(r,w)=>[r*s+w*c,3.53-.022*r, -.20+r*c-w*s];
      rod(v(.21,0),v(.72,0),.105,steel);quad(v(.61,-.12),v(4.13,-.123),v(4.24,.15),v(.61,.164),0x3d4c50);
      quad(v(3.97,-.126),v(4.32,-.107),v(4.32,.13),v(4.04,.15),plane.accent);
      obstruction(2.3*s,3.47,-.20+2.3*c,.31,.17,4.16,a);
    }
    obstruction(0,3.01,-.20,.57,1.28,.57);
    shadow(0,-.06,3.84,8.63);
  }
  for(let i=0;i<stands.length;i++){
    plane=stands[i];slot=i;pose.makeRotationY(plane.yaw);pose.setPosition(plane.x,0,plane.z);
    const starts=Object.fromEntries(Object.keys(chunks).map(k=>[k,chunks[k].i.length]));
    if(plane.type==='survey')survey();else if(plane.type==='rotor')rescue();else jets(plane.type==='tandem');
    for(const key of Object.keys(chunks))chunks[key].ranges.push([starts[key],chunks[key].i.length-starts[key]]);
  }
  function mapFromCanvas(c){const m=new T.CanvasTexture(c);m.colorSpace=T.SRGBColorSpace;m.anisotropy=4;return m;}
  const plate=document.createElement('canvas');plate.width=768;plate.height=192;
  const ctx=plate.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 71px Arial, sans-serif';
  for(let i=0;i<stands.length;i++)for(let r=0;r<2;r++){
    ctx.fillStyle=r?'#3d4e54':'#e6e3ca';ctx.fillText(stands[i].id,i*128+64,47+r*96,111);
    ctx.fillRect(i*128+31,80+r*96,66,3);
  }
  const smudge=document.createElement('canvas');smudge.width=smudge.height=64;
  const sc=smudge.getContext('2d'),g=sc.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(13,20,23,.42)');g.addColorStop(.41,'rgba(15,21,23,.25)');g.addColorStop(1,'rgba(15,21,23,0)');sc.fillStyle=g;sc.fillRect(0,0,64,64);
  const materials={
    skin:new T.MeshStandardMaterial({vertexColors:true,roughness:.67,metalness:.17,side:T.DoubleSide}),
    glass:new T.MeshPhysicalMaterial({vertexColors:true,roughness:.20,metalness:.48,clearcoat:.42,clearcoatRoughness:.18,side:T.DoubleSide}),
    decal:new T.MeshStandardMaterial({map:mapFromCanvas(plate),roughness:.78,transparent:true,forceSinglePass:true,depthWrite:false,alphaTest:.18,polygonOffset:true,polygonOffsetFactor:-1,side:T.DoubleSide}),
    contact:new T.MeshBasicMaterial({map:mapFromCanvas(smudge),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false})
  };
  const names={skin:'蒙皮与起落架',glass:'座舱玻璃',decal:'停机编号',contact:'轮胎接地影'};
  for(const [key,b] of Object.entries(chunks)){
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(b.p,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));
    if(key===skin||key===glass)geometry.setAttribute('color',new T.Float32BufferAttribute(b.c,3));
    if(b.u.length)geometry.setAttribute('uv',new T.Float32BufferAttribute(b.u,2));geometry.setIndex(b.i);
    for(const [start,count] of b.ranges)geometry.addGroup(start,count,0);
    geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,materials[key]);mesh.name=names[key];
    mesh.castShadow=key===skin||key===glass;mesh.receiveShadow=false;
    if(key===decal)mesh.renderOrder=3;else if(key===contact)mesh.renderOrder=2;
    deck.add(mesh);
  }
  unitBar.dispose();unitWheel.dispose();ball.dispose();
}
