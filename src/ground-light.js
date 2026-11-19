// Soft contact shadows anchor the tyres on the carrier deck.
function createGroundLight(THREE, scene, coast) {
  const vertex = `varying vec2 tex;
    void main(){ tex=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  function decal(width, depth, fragment, uniforms) {
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader:vertex, fragmentShader:fragment,
      transparent:true, depthWrite:false, toneMapped:false,
      polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width,depth),material);
    plane.rotation.x=-Math.PI/2;plane.renderOrder=1;
    return plane;
  }
  const ambient={height:{value:0},gear:{value:1}};
  const contact=decal(15,19,`uniform float height, gear;varying vec2 tex;
    float oval(vec2 p,vec2 c,vec2 size){vec2 d=(p-c)/size;return exp(-dot(d,d)*1.8);}
    void main(){
      vec2 p=vec2(tex.x-.5,.5-tex.y)*vec2(15.,19.);
      float spread=height*.30;
      float body=.27*oval(p,vec2(0.,-.25),vec2(1.95,5.1)+spread);
      float wing=.10*oval(p,vec2(0.,.8),vec2(4.4,2.15)+spread);
      float wheels=oval(p,vec2(0.,-4.26),vec2(.28,.33)+spread)
                 +oval(p,vec2(-1.42,1.45),vec2(.39,.43)+spread)
                 +oval(p,vec2(1.42,1.45),vec2(.39,.43)+spread);
      float opacity=(body+wing)*exp(-height*.60)+wheels*gear*.49*exp(-height*3.8);
      gl_FragColor=vec4(.025,.031,.033,clamp(opacity,0.,.76));
      #include <colorspace_fragment>
    }`,ambient);
  const frame=new THREE.Group(); frame.add(contact);scene.add(frame);
  function update(s){
    const p=s.position;
    frame.visible=s.phase!=="crashed" && s.agl<6 && coast.isDeck(p.x,p.z);
    if(frame.visible){
      frame.position.set(p.x,coast.groundHeight(p.x,p.z)+.027,p.z);frame.rotation.y=-s.heading;
      ambient.height.value=s.agl;ambient.gear.value=s.gear;
    }
  }
  return {update};
}
