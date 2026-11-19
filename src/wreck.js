// Both aircraft retain their velocity and bank when a hit starts a crash.
function createWreckMotion(T,coast){
  const velocity=new T.Vector3(),angles=new T.Euler(0,0,0,'YXZ');
  let spin=0;
  function start(quaternion,initialVelocity){
    velocity.copy(initialVelocity);
    angles.setFromQuaternion(quaternion,'YXZ');
    spin=angles.z<0?-1:1;
  }
  function step(position,quaternion,dt){
    velocity.x*=Math.exp(-.26*dt);velocity.z*=Math.exp(-.26*dt);
    velocity.y=Math.max(-110,velocity.y-18*dt);
    position.addScaledVector(velocity,dt);
    angles.x+=(-1.23-angles.x)*(1-Math.exp(-.72*dt));
    angles.z+=spin*1.8*dt;
    quaternion.setFromEuler(angles);
    const floor=coast.groundHeight(position.x,position.z);
    if(position.y<=floor+.65){
      position.y=floor+.08;
      return floor<=coast.seaLevel+.15&&!coast.isDeck(position.x,position.z)?'water':'crash';
    }
    if(coast.obstacleAt(position.x,position.y,position.z,1.5))return 'crash';
    return '';
  }
  return {start,step,velocity};
}
