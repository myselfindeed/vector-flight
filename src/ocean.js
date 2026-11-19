/* World-space swell, wind chop and foam for the offshore flight range. */
function createOpenSea(THREE,world,options){
  'use strict';
  const {seaLevel,sun,noise,reflection,skyReady,skyLookup,depths,depthSpan,hull}=options;
  const compact=typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;

  // Sample an original, periodic directional wave spectrum once. The GPU can filter its slopes at any altitude.
  function waveAtlas(){
    const n=256,mask=n-1,real=new Float32Array(n*n),imag=new Float32Array(n*n);
    let seed=925307;
    function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;}
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const i=z*n+x,mirror=((-z)&mask)*n+((-x)&mask);if(i>=mirror)continue;
      const kx=x<n/2?x:x-n,kz=z<n/2?z:z-n,k=Math.hypot(kx,kz);
      const along=(kx*.92+kz*.39)/k;
      const direction=.22+.78*Math.pow(Math.abs(along),2.3);
      const band=Math.exp(-Math.pow(3.05/k,2)-Math.pow(k/57,2));
      const amplitude=direction*band*Math.sqrt(-2*Math.log(rand()))/Math.pow(k,1.94);
      const phase=rand()*Math.PI*2;
      real[i]=real[mirror]=amplitude*Math.cos(phase);imag[i]=amplitude*Math.sin(phase);imag[mirror]=-imag[i];
    }
    const reverse=new Uint16Array(n),co=new Float32Array(n/2),si=new Float32Array(n/2);
    for(let i=0;i<n;i++)reverse[i]=(reverse[i>>1]>>1)|((i&1)*(n>>1));
    for(let i=0;i<n/2;i++){co[i]=Math.cos(i*2*Math.PI/n);si[i]=Math.sin(i*2*Math.PI/n);}
    function transform(offset,stride){
      for(let i=1;i<n;i++){
        const j=reverse[i];if(j<=i)continue;const a=offset+i*stride,b=offset+j*stride;
        let temp=real[a];real[a]=real[b];real[b]=temp;temp=imag[a];imag[a]=imag[b];imag[b]=temp;
      }
      for(let width=2;width<=n;width*=2){
        const half=width/2,interval=n/width;
        for(let base=0;base<n;base+=width)for(let j=0;j<half;j++){
          const a=offset+(base+j)*stride,b=a+half*stride,k=j*interval;
          const re=real[b]*co[k]-imag[b]*si[k],im=real[b]*si[k]+imag[b]*co[k];
          real[b]=real[a]-re;imag[b]=imag[a]-im;real[a]+=re;imag[a]+=im;
        }
      }
    }
    for(let k=0;k<n;k++)transform(k*n,1);
    for(let k=0;k<n;k++)transform(k,n);
    const dx=new Float32Array(n*n),dz=new Float32Array(n*n);let xs=0,zs=0,hs=0;
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const i=z*n+x;dx[i]=real[z*n+((x+1)&mask)]-real[z*n+((x-1)&mask)];
      dz[i]=real[((z+1)&mask)*n+x]-real[((z-1)&mask)*n+x];xs+=dx[i]*dx[i];zs+=dz[i]*dz[i];hs+=real[i]*real[i];
    }
    xs=Math.sqrt(xs/(n*n));zs=Math.sqrt(zs/(n*n));hs=Math.sqrt(hs/(n*n));
    const bytes=new Uint8Array(n*n*4),points=[];
    for(let i=0;i<14*14;i++)points.push([.14+rand()*.72,.14+rand()*.72]);
    const source=noise.image.data;
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const i=z*n+x,k=i*4;
      bytes[k]=Math.max(0,Math.min(255,128+dx[i]/xs*40));bytes[k+1]=Math.max(0,Math.min(255,128+dz[i]/zs*40));
      bytes[k+2]=Math.max(0,Math.min(255,128+real[i]/hs*43));
      const fx=x*14/n+.32*real[i]/hs,fz=z*14/n+(source[k]/255-.5)*1.9;
      const ix=Math.floor(fx),iz=Math.floor(fz);let closest=10,second=10;
      for(let j=-1;j<=1;j++)for(let h=-1;h<=1;h++){
        const cell=points[((iz+j+28)%14)*14+(ix+h+28)%14];
        const u=ix+h+cell[0]-fx,v=iz+j+cell[1]-fz,d=u*u+v*v;
        if(d<closest){second=closest;closest=d;}else if(d<second)second=d;
      }
      const lace=Math.exp(-6.1*(Math.sqrt(second)-Math.sqrt(closest)));
      bytes[k+3]=Math.min(255,255*(.16+.59*lace+.25*source[k+1]/255));
    }
    const map=new THREE.DataTexture(bytes,n,n);map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;return map;
  }

  // One continuous radial mesh shares every ring. Its origin moves smoothly while wave phases stay in world space.
  function surfaceGrid(){
    const spokes=compact?120:168,radii=[];let r=0;
    while(r<51000){
      const step=r<55?1.65:r<125?2.7:r<230?4.5:r<450?8.9:r<900?17:r<1500?37:Math.max(70,r*.134);
      r+=step*(compact?1.23:1);radii.push(r);
    }
    const pos=new Float32Array((1+radii.length*spokes)*3),idx=[];
    for(let j=0;j<radii.length;j++)for(let i=0;i<spokes;i++){
      const a=i*Math.PI*2/spokes,v=1+j*spokes+i,next=1+j*spokes+(i+1)%spokes;
      pos[v*3]=Math.cos(a)*radii[j];pos[v*3+2]=Math.sin(a)*radii[j];
      if(!j)idx.push(0,next,v);else idx.push(v-spokes,next-spokes,v,next-spokes,next,v);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(idx);return g;
  }
  const uniforms={uTime:{value:0},uOrigin:{value:new THREE.Vector2()},uLevel:{value:seaLevel},uSun:{value:sun},
    uWind:{value:new THREE.Vector3(4,-2,.5)},uAdvection:{value:new THREE.Vector2()},uNoise:{value:noise},uSpectrum:{value:waveAtlas()},
    uReflection:reflection,uSkyReady:skyReady,uHull:{value:hull},uDepth:{value:depths},uDepthSpan:{value:depthSpan},
    uWash:{value:new THREE.Vector4(0,0,0,5)}};
  const location=`uniform vec4 uWash;uniform float uTime;uniform float uLevel;
    varying vec3 vWater;varying vec3 vLargeNormal;varying vec3 vBreaking;`;
  const material=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:`${location}
      uniform vec2 uOrigin;uniform vec3 uWind;
      float swell(vec2 p,vec2 d,float k,float a,float omega,float offset,float radius,float endRadius,
                 inout vec3 moved,inout vec3 tx,inout vec3 tz,inout float compression){
        float visible=1.0-smoothstep(endRadius*.42,endRadius,radius);
        float phase=dot(p,d)*k-uTime*omega+offset;
        float h=a*visible,ss=sin(phase),cc=cos(phase),ak=h*k;
        moved.y+=h*ss;moved.xz+=d*(.38*h*cc);
        tx+=vec3(-.38*ak*d.x*d.x*ss,ak*d.x*cc,-.38*ak*d.x*d.y*ss);
        tz+=vec3(-.38*ak*d.x*d.y*ss,ak*d.y*cc,-.38*ak*d.y*d.y*ss);
        compression+=ak*ss;return ss*visible;
      }
      void main(){
        vec2 p=position.xz+uOrigin;float r=length(position.xz);
        float groupA=sin(dot(p,vec2(.011,.0065))-.105*uTime),groupB=sin(dot(p,vec2(-.008,.014))+.073*uTime);
        vec3 moved=vec3(0.),tx=vec3(1.,0.,0.),tz=vec3(0.,0.,1.);float compression=0.;
        swell(p,vec2(.875,-.484),.112,.82,1.03,1.10+groupB*.38,r,1240.,moved,tx,tz,compression);
        swell(p,vec2(.527,-.850),.175,.52,1.29,-1.29+groupA*.74,r,770.,moved,tx,tz,compression);
        swell(p,vec2(-.355,-.935),.243,.35,1.52,2.83+groupB*.91,r,540.,moved,tx,tz,compression);
        float spilling=swell(p,vec2(.994,.109),.379,.24,1.89,.77+groupA*.92,r,345.,moved,tx,tz,compression);
        swell(p,vec2(.655,.756),.61,.13,2.48,-.52+groupB*.83,r,195.,moved,tx,tz,compression);
        swell(p,vec2(.241,-.971),.81,.075,2.81,2.18+groupA*.82,r,108.,moved,tx,tz,compression);
        vec2 q=p+moved.xz;float distWash=length(q-uWash.xy),washWidth=max(2.,uWash.w);
        float basin=exp(-distWash*distWash/(washWidth*washWidth*.65));
        moved.y+=uWash.z*(-.30*basin+.095*cos(distWash*1.02-uTime*4.5)*exp(-abs(distWash-washWidth)*.27));
        vWater=vec3(q.x,uLevel+moved.y,q.y);vLargeNormal=normalize(cross(tz,tx));
        vBreaking=vec3(moved.y,compression,spilling);gl_Position=projectionMatrix*viewMatrix*vec4(vWater,1.0);
      }`,
    fragmentShader:`${location}
      uniform vec3 uSun;uniform vec3 uWind;uniform vec2 uAdvection;uniform sampler2D uNoise;uniform sampler2D uSpectrum;
      uniform sampler2D uReflection;uniform float uSkyReady;uniform sampler2D uHull;
      uniform sampler2D uDepth;uniform float uDepthSpan;
      ${skyLookup}
      mat2 spin(float c,float s){return mat2(c,s,-s,c);}
      void main(){
        vec2 p=vWater.xz;vec3 delta=cameraPosition-vWater;float distanceToEye=length(delta);vec3 view=delta/max(distanceToEye,.001);
        vec2 adv=uAdvection;float t=uTime;
        vec4 patchNoise=texture2D(uNoise,spin(.884,.468)*p*.0033+adv*.00034);
        float windPatch=smoothstep(.22,.76,patchNoise.r*.64+patchNoise.b*.36);
        float longRange=1.-smoothstep(650.,2200.,distanceToEye);
        vec2 drift=vec2(patchNoise.r-.5,patchNoise.b-.5)*.176;
        mat2 rotA=spin(.862,-.507),rotB=spin(.585,.811),rotC=spin(-.114,.993);
        vec4 chop=texture2D(uSpectrum,rotA*(p-adv*.35)/43.+drift);
        vec4 ripple=texture2D(uSpectrum,rotB*(p+vec2(-t*.58,t*.29)-adv*.13)/17.4+drift*.81);
        vec4 capillary=texture2D(uSpectrum,rotC*(p-adv*.18+vec2(t*.12,-t*.18))/5.65);
        mat2 swellAxis=spin(.937,-.349);
        vec4 offshore=texture2D(uSpectrum,swellAxis*(p-adv*.29)/246.+drift*.55);
        vec2 slopes=(chop.rg-.5)*rotA*(.73+.22*windPatch)+(ripple.rg-.5)*rotB*(.36+.22*windPatch);
        slopes+=(capillary.rg-.5)*rotC*(.20+.30*windPatch)*(1.-smoothstep(42.,270.,distanceToEye));
        slopes*=mix(.54,1.,longRange)*(.84+.23*uWind.z);
        slopes+=(offshore.rg-.5)*swellAxis*(.23+.12*windPatch);
        vec3 macro=normalize(vLargeNormal);
        vec2 washDelta=p-uWash.xy;float washDist=length(washDelta),washWidth=max(2.,uWash.w);
        float washBand=exp(-abs(washDist-washWidth)*.31)*uWash.z;
        float washCenter=exp(-dot(washDelta,washDelta)/(washWidth*washWidth*.65))*uWash.z;
        slopes*=1.-.70*washCenter;
        slopes+=washDelta/max(washDist,.24)*washBand*(.15*sin(washDist*1.66-t*6.6+chop.b*2.)+.06*cos(washDist*2.92-t*8.));
        vec3 normal=normalize(vec3(macro.x-slopes.x,macro.y,macro.z-slopes.y));
        float nDotV=max(0.,dot(normal,view));vec3 reflected=reflect(-view,normal);
        reflected.y=.007+.5*(reflected.y+sqrt(reflected.y*reflected.y+.0013));
        float sunAzimuth=max(0.,dot(normalize(reflected.xz+vec2(.0001)),normalize(uSun.xz)));
        vec3 skyLight=coastalSky(uReflection,reflected,uSun,uSkyReady);
        float fresnel=.021+.979*pow(1.-nDotV,5.);
        float sunSlope=max(0.,dot(macro,uSun)),outgoing=max(0.,dot(normal,uSun));
        float waveShade=clamp(.66+.34*sunSlope+.073*vBreaking.x+.11*patchNoise.b,.44,1.14);
        float swellLight=.62*patchNoise.r+.23*windPatch+.15*offshore.b;
        vec3 deep=mix(vec3(.004,.040,.076),vec3(.010,.108,.158),swellLight)*waveShade;
        vec2 depthUV=p/uDepthSpan+.5;float hasMap=1.-smoothstep(.489,.499,max(abs(depthUV.x-.5),abs(depthUV.y-.5)));
        float seabed=texture2D(uDepth,clamp(depthUV,.001,.999)).r*hasMap;
        float depth=13.-17.*seabed+vBreaking.x,shoal=1.-smoothstep(1.,10.,depth);
        vec3 shallows=mix(vec3(.016,.173,.181),vec3(.089,.327,.257),shoal);
        deep=mix(deep,shallows*waveShade,shoal*.91);
        vec3 water=mix(deep,skyLight,fresnel);
        float rim=smoothstep(.13,.54,vBreaking.y)*smoothstep(.04,.35,outgoing)*longRange;
        water+=vec3(.006,.026,.029)*rim;
        vec3 halfLight=normalize(view+uSun);float microSun=max(0.,dot(normal,halfLight));
        float reliefVis=smoothstep(-.11,.18,dot(macro,uSun));
        float sheen=pow(microSun,78.)*.085+pow(microSun,260.)*.51;
        float fleck=pow(microSun,990.)*(.50+.71*smoothstep(.33,.67,capillary.b));
        water+=vec3(1.,.92,.76)*(sheen+fleck)*reliefVis*(.73+.32*sunAzimuth);
        float ofx=abs(p.x),aft=max(0.,p.y-110.);
        float halfHull=texture2D(uHull,vec2(clamp((p.y+126.)/252.,.001,.999),.5)).r*24.;
        vec2 edge=vec2(ofx-halfHull,max(-118.-p.y,p.y-115.));float hullGap=length(max(edge,0.))+min(max(edge.x,edge.y),0.);
        float hullShade=exp(-max(0.,hullGap)*.115)*(1.-smoothstep(115.,139.,abs(p.y)));
        water*=1.-hullShade*(.25+.09*smoothstep(-.3,.7,-macro.x));
        vec2 foamUV=spin(.913,.407)*(p-adv*.18)/vec2(8.7,4.6);
        vec4 froth=texture2D(uSpectrum,foamUV+vec2(ripple.b*.14+chop.r*.08,patchNoise.r*.11+chop.b*.17));
        float lace=.16+.52*smoothstep(.21,.70,froth.a*.61+capillary.a*.39)+.32*smoothstep(.27,.75,froth.b);
        float crestSignal=vBreaking.y+.30*(chop.b-.50)+.15*(ripple.b-.50)+.078*(windPatch-.4);
        float windSpill=smoothstep(.76,.97,vBreaking.z)*smoothstep(.09,.29,crestSignal)*smoothstep(.34,.68,.55*windPatch+.45*chop.b);
        float whitecap=max(smoothstep(.27,.46,crestSignal),windSpill*.70)*(.27+.73*lace)*(.32+.59*uWind.z);
        whitecap*=1.-smoothstep(700.,2400.,distanceToEye);
        whitecap+=.13*smoothstep(.68,.89,offshore.b)*smoothstep(.45,.75,chop.b)*windPatch;
        float shoreBroken=smoothstep(.28,.68,.55*chop.b+.45*patchNoise.g);
        float breaker=exp(-abs(depth-(1.22+.56*sin(t*.67+patchNoise.b*5.)+vBreaking.x*.46))*.91);
        float shoreFoam=shoal*(.76*breaker+.25*(1.-smoothstep(.05,1.55,depth)))*(.18+.82*lace)*(.40+.60*shoreBroken);
        float waterline=(1.-smoothstep(-.22,1.5+1.15*chop.b,hullGap+vBreaking.x*.39))*(.26+.58*lace);
        float shoulder=exp(-abs(hullGap-2.8-.8*vBreaking.x-chop.b)*.71)*(.17+.34*lace);
        shoulder*=smoothstep(-114.,-92.,p.y)*(1.-smoothstep(88.,123.,p.y));
        float wakeWidth=12.+.145*aft,trailOffset=ofx-wakeWidth-(chop.b-.5)*4.5-sin(aft*.077+t*.31)*.9;
        float wakeEdge=exp(-abs(trailOffset)/1.55)*exp(-aft*.016)*(.17+.53*lace);
        float centerWake=exp(-p.x*p.x/(60.+.10*aft*aft))*exp(-aft*.025)*(.06+.23*lace)*smoothstep(.32,.71,ripple.b+.19*chop.b);
        float wake=smoothstep(0.,8.,aft)*(wakeEdge+centerWake);
        float downwash=0.;
        if(uWash.z>.003 && washDist<washWidth*2.7+4.){
          vec2 radial=washDelta/max(.28,washDist);
          vec2 flowBase=foamUV+vec2(chop.b,ripple.b)*.12;float cycle=fract(t*.24);
          vec4 flowA=texture2D(uSpectrum,flowBase-radial*cycle*.58);
          vec4 flowB=texture2D(uSpectrum,flowBase-radial*fract(cycle+.5)*.58);
          vec4 entrained=mix(flowB,flowA,1.-abs(2.*cycle-1.));
          float strands=smoothstep(.29,.73,.54*entrained.b+.27*entrained.a+.19*froth.b);
          float uneven=washWidth*(1.+.12*(chop.b-.50)+.055*dot(radial,normalize(uWind.xy+vec2(.001))));
          float front=exp(-abs(washDist-uneven)*.66)*uWash.z;
          float outward=smoothstep(.68,1.14,washDist/washWidth)*exp(-max(0.,washDist-uneven)*.34)*uWash.z;
          downwash=front*(.075+.37*strands)*(.68+.32*cos(washDist*2.35-t*6.1+entrained.b*2.7))+outward*.20*strands;
        }
        float foam=clamp(whitecap+shoreFoam+waterline+shoulder+wake+downwash,0.,.94);
        vec3 foamLight=mix(vec3(.35,.45,.49),vec3(.89,.93,.90),.26+.45*sunSlope+.18*lace);
        water=mix(water,foamLight,foam);
        float fetch=length(delta.xz),grazing=1.-smoothstep(.023,.16,view.y);
        float veil=(1.-exp(-fetch*.000075))*(.12+.39*grazing);
        float meetSky=grazing*smoothstep(5500.,39000.,fetch);
        if(veil>.001){
          vec3 horizon=coastalSky(uReflection,vec3(-view.x,.014,-view.z),uSun,uSkyReady);
          water=mix(water,horizon,mix(veil,1.,meetSky));
        }
        gl_FragColor=vec4(max(water,vec3(0.)),1.);
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(surfaceGrid(),material);mesh.name='外海 · 涌浪与白沫';mesh.frustumCulled=false;
  mesh.onBeforeRender=(_renderer,_scene,camera)=>{uniforms.uOrigin.value.set(camera.position.x,camera.position.z);};
  world.add(mesh);
  let previousTime=0;
  function update(state,floor){
    const t=Number.isFinite(state.time)?state.time:0,wx=Number.isFinite(state.windX)?state.windX:4,wz=Number.isFinite(state.windZ)?state.windZ:-2;
    if(t<previousTime)uniforms.uAdvection.value.set(0,0);
    const dt=Math.max(0,Math.min(.25,t-previousTime));previousTime=t;uniforms.uTime.value=t;
    uniforms.uAdvection.value.x+=wx*dt;uniforms.uAdvection.value.y+=wz*dt;
    uniforms.uWind.value.set(wx,wz,Math.min(1,Math.hypot(wx,wz)/9));
    const p=state.position;if(!p)return;
    const height=Math.max(0,Number.isFinite(state.agl)?state.agl:p.y-seaLevel-1.6);
    const down=Math.max(0,Math.sin(state.nozzle||0)),engine=Number.isFinite(state.engine)?state.engine:1;
    const mix=Math.min(1,Math.max(0,(height-3)/27));
    const strength=!state.onGround&&Math.abs(floor-seaLevel)<.12?down*down*engine*(state.thrust||0)*(1-mix*mix*(3-2*mix)):0;
    const heading=state.heading||0;
    uniforms.uWash.value.set(p.x-Math.sin(heading)*2.8+wx*height*.012,p.z+Math.cos(heading)*2.8+wz*height*.012,strength,3.0+Math.min(height,28)*.24);
  }
  return {update};
}
