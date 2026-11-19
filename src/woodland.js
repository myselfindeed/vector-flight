// Coastal stands share their ground-cover mask with the terrain. Both canopy meshes are solid from above.
function addCoastalWoodland(T,world,{seabed,woodlandCover,noise,extent,seaLevel,sun}){
  const atlasMap=new T.TextureLoader();
  const leaves=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,alphaTest:.28,alphaToCoverage:true});
  const ready=new Promise(resolve=>atlasMap.load('@TREE_FOLIAGE@',map=>{
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
    leaves.map=map;leaves.needsUpdate=true;resolve();
  },undefined,()=>{leaves.visible=false;resolve();}));
  function treeGeometry(detailed){
    const vertices=[],colors=[],uv=[],index=[];
    function vertex(x,y,z,u,v,shade){
      vertices.push(x,y,z);uv.push(u,v);colors.push(shade,shade,shade*.97);
    }
    const cards=detailed?3:2;
    for(let i=0;i<cards;i++){
      const angle=i*Math.PI/cards,c=Math.cos(angle),s=Math.sin(angle);
      const base=vertices.length/3,left=(i%2)*.5;
      for(const h of [0,.58,1])for(const side of [-1,1]){
        const bend=h<.6?0:(i%2===0?.12:-.12);
        vertex(.63*side*c-bend*s,h,.63*side*s+bend*c,left+(side+1)*.25,h,.72+.30*h);
      }
      index.push(base,base+2,base+1,base+1,base+2,base+3,base+2,base+4,base+3,base+3,base+4,base+5);
    }
    // A sloping canopy uses the leafy upper part of the same atlas when looking down through the crossed branches.
    const center=vertices.length/3,rays=detailed?10:7;
    vertex(0,.88,0,.257,.68,1.07);
    for(let i=0;i<rays;i++){
      const a=i*Math.PI*2/rays,c=Math.cos(a),s=Math.sin(a),r=.48+.035*Math.sin(3*a+.8);
      vertex(c*r,.55+.055*Math.sin(2*a+.4),s*r,.257+.239*c,.68+.285*s,.91+.06*c);
      index.push(center,center+1+(i+1)%rays,center+1+i);
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(index);
    return g;
  }
  const near=treeGeometry(true),far=treeGeometry(false);
  const canopyA=new T.Color(0xa5b5a0),canopyB=new T.Color(0xe1ebcc);
  const tileSize=460,step=16.5,tiles=new Map(),tint=new T.Color(),pose=new T.Object3D();
  let seed=280721;
  function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
  const atlas=document.createElement('canvas'),size=2048,texels=size/(2*extent);
  atlas.width=atlas.height=size;const ctx=atlas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,size,size);
  const stamp=document.createElement('canvas');stamp.width=stamp.height=24;
  const ink=stamp.getContext('2d'),shadow=ink.createRadialGradient(12,12,1,12,12,12);
  shadow.addColorStop(0,'rgba(0,0,0,.82)');shadow.addColorStop(.55,'rgba(0,0,0,.55)');shadow.addColorStop(1,'rgba(0,0,0,0)');
  ink.fillStyle=shadow;ink.fillRect(0,0,24,24);
  for(let z0=-extent;z0<extent;z0+=step)for(let x0=-extent;x0<extent;x0+=step){
    const x=x0+rand()*step,z=z0+rand()*step,y=seabed(x,z);
    if(y<seaLevel+7)continue;
    const slope=Math.hypot(seabed(x+4,z)-seabed(x-4,z),seabed(x,z+4)-seabed(x,z-4))/8;
    const cover=woodlandCover(x,z,y,slope);
    if(cover<.12||rand()>cover*.92)continue;
    const tx=Math.floor(x/tileSize),tz=Math.floor(z/tileSize),key=tx+'/'+tz;
    let tile=tiles.get(key);
    if(!tile){tile={x:(tx+.5)*tileSize,z:(tz+.5)*tileSize,trees:[]};tiles.set(key,tile);}
    const height=(6.7+7.1*rand())*(.70+.44*cover),width=height*(.68+.44*rand());
    tile.trees.push({x:x-tile.x,y:y-.12,z:z-tile.z,height,width,yaw:rand()*2*Math.PI,
      hue:.49*noise(x*.007,z*.006)+.51*rand()});
    const sx=(x-.55*height*sun.x/sun.y+extent)*texels,sz=(z-.55*height*sun.z/sun.y+extent)*texels;
    const footprint=(width*1.65+2)*texels;
    ctx.drawImage(stamp,sx-footprint*.5,sz-footprint*.5,footprint,footprint);
  }
  for(const tile of tiles.values()){
    const group=new T.LOD();group.name='海岸林地';
    group.position.set(tile.x,0,tile.z);
    const close=new T.InstancedMesh(near,leaves,tile.trees.length),distant=new T.InstancedMesh(far,leaves,tile.trees.length);
    tile.trees.forEach((tree,i)=>{
      pose.position.set(tree.x,tree.y,tree.z);pose.rotation.y=tree.yaw;pose.scale.set(tree.width,tree.height,tree.width*.92);pose.updateMatrix();
      close.setMatrixAt(i,pose.matrix);close.setColorAt(i,tint.copy(canopyA).lerp(canopyB,tree.hue));
    });
    distant.instanceMatrix=close.instanceMatrix;distant.instanceColor=close.instanceColor;
    close.computeBoundingSphere();distant.computeBoundingSphere();
    group.addLevel(close,0);group.addLevel(distant,860,.12);world.add(group);
  }
  const texture=new T.CanvasTexture(atlas);texture.channel=1;texture.flipY=false;
  return {shadows:texture,ready};
}
