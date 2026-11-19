// Metre-scaled ground photographs. Each cliff projection has two independent axes, even on a vertical face.
function createCoastalGround(T,noise,shadowMap,seaLevel){
  const material=new T.MeshStandardMaterial({aoMap:shadowMap,roughness:1,metalness:0,envMapIntensity:.30});
  const loader=new T.TextureLoader(),loads=[];
  function photograph(url,rgb){
    const fallback=new T.DataTexture(new Uint8Array([...rgb,255]),1,1);
    fallback.colorSpace=T.SRGBColorSpace;fallback.needsUpdate=true;
    const uniform={value:fallback};
    loads.push(new Promise(resolve=>loader.load(url,map=>{
      map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;
      map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.anisotropy=4;
      uniform.value=map;fallback.dispose();resolve();
    },undefined,()=>resolve())));
    return uniform;
  }
  const uniforms={
    grassPhoto:photograph('@GROUND_GRASS@',[93,109,64]),meadowPhoto:photograph('@GROUND_MEADOW@',[83,106,57]),
    rockPhoto:photograph('@GROUND_ROCK@',[111,103,90]),soilPhoto:photograph('@GROUND_SOIL@',[94,78,60]),
    groundNoise:{value:noise},groundSeaLevel:{value:seaLevel}
  };
  const varyings='varying vec3 terrainPosition; varying vec3 terrainNormal; varying vec2 terrainCover;';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute vec2 landCover;\n'+varyings+'\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      terrainPosition=position;terrainNormal=normal;terrainCover=landCover;`);
    shader.fragmentShader=varyings+`
      uniform sampler2D grassPhoto,meadowPhoto,rockPhoto,soilPhoto,groundNoise;
      uniform float groundSeaLevel;
      mat2 chartRotation(float tile){
        float angle=tile*2.3999632;
        return mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
      }
      vec3 surfaceSample(sampler2D photo,vec3 p,vec3 weights,mat2 rotation){
        return texture2D(photo,rotation*p.zy).rgb*weights.x+texture2D(photo,rotation*p.xz).rgb*weights.y+texture2D(photo,rotation*p.xy).rgb*weights.z;
      }
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 p=terrainPosition,face=abs(normalize(terrainNormal));
      vec3 weights=pow(face,vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
      mat2 turn=mat2(.819,.574,-.574,.819);
      vec3 broad=texture2D(groundNoise,turn*p.xz/1250.+vec2(.24,.48)).rgb;
      vec3 edge=texture2D(groundNoise,p.xz/164.+broad.rb*.16).rgb;
      float steep=1.-face.y;
      float outcrop=smoothstep(.15,.36,steep+.17*(broad.b-.50)+.13*(edge.g-.50));
      float shore=1.-smoothstep(.5,7.5,p.y-groundSeaLevel);
      float woods=terrainCover.x;
      float openings=smoothstep(.48,.74,.40*broad.b+.42*edge.r+.18*edge.b+.13*woods+.15*outcrop);
      float patchId=broad.g*7.,tile=floor(patchId),blend=smoothstep(.10,.90,fract(patchId));
      mat2 first=chartRotation(tile),second=chartRotation(tile+1.);
      vec3 stride=vec3(.331,.713,.573),shift=fract(tile*stride),next=fract((tile+1.)*stride);
      vec3 grass=texture2D(grassPhoto,turn*p.xz/5.6+vec2(.13,.62)).rgb*vec3(.90,1.32,.86);
      vec2 meadowUV=p.xz/37.;
      vec3 meadow=mix(texture2D(meadowPhoto,first*meadowUV+shift.xz).rgb,
        texture2D(meadowPhoto,second*meadowUV+next.xz).rgb,blend)*vec3(1.16,1.26,1.11);
      grass=mix(grass,meadow,.29+.37*broad.g)*mix(vec3(1.12,1.07,.93),vec3(.60,.82,.68),woods);
      vec3 offset=broad*1.35;
      vec3 soil=mix(surfaceSample(soilPhoto,p/8.8+shift,weights,first),surfaceSample(soilPhoto,p/8.8+next,weights,second),blend)*vec3(1.17,1.01,.84);
      vec3 stoneUV=p/23.+offset;
      vec3 stone=mix(surfaceSample(rockPhoto,stoneUV+shift,weights,first),surfaceSample(rockPhoto,stoneUV+next,weights,second),blend);
      stone*=vec3(.88,.93,1.)*(.87+.24*broad.b);
      vec3 cover=mix(grass,soil,max(openings*.78,shore*.72));
      cover=mix(cover,stone,max(outcrop,shore*(.38+.50*edge.b)));
      float wet=1.-smoothstep(.1,1.9,p.y-groundSeaLevel);
      diffuseColor.rgb*=cover*(1.-.31*wet)*terrainCover.y;
    `);
  };
  return {material,ready:Promise.all(loads)};
}
