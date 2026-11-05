import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const tau=Math.PI*2, clamp=T.MathUtils.clamp;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const pulse=(x,width)=>Math.exp(-x*x/(width*width));

function choreography(move,t) {
  const p={yaw:.85,pitch:.60,reach:0,twist:0,turn:0,jump:0,lean:.04,load:0,drive:0,coil:0,lead:0,trail:0,footLift:0,roll:0,tuck:0};
  if(!move)return p;
  const u=clamp(t/move.dur,0,1), envelope=Math.min(smooth(u/.12),smooth((1-u)/.19));
  const strike=move.hits.reduce((peak,h)=>Math.max(peak,pulse(t-h.t,.042)),0);
  const rise=smooth(u/.48);
  switch(move.anim){
    case 'thrust':
      p.yaw*=1-strike;p.pitch=.25-strike*.24+.15*Math.sin(move.hits.length*tau*u);
      p.reach=.13*strike-.055*envelope;p.twist=-.45*strike;p.lean+=.25*strike;break;
    case 'slash':
      p.yaw+=envelope*(move.dir*(-1.75+3.5*smooth((u-.1)/.58))-.65);
      p.pitch=.28-.18*envelope;p.twist=-move.dir*.78*envelope*(1-2*rise);break;
    case 'spin':
      p.turn=tau*(move.id==='N6'?1:3)*smooth((u-.04)/.82);
      p.yaw+=.72*envelope;
      p.pitch+=move.id==='SK2'
        ? envelope*(.9*pulse(u-.11,.12)-.56+1.48*pulse(u-.87,.09))
        : -.53*envelope;
      p.reach=.04*envelope;break;
    case 'up':
      p.pitch+=envelope*(-1.25+2.35*smooth((u-.12)/.35));
      p.turn=move.id==='C3'?tau*smooth((u-.30)/.52):0;
      p.jump=move.id==='C3'?.26*Math.sin(Math.PI*u):0;break;
    case 'slam':
      p.pitch+=envelope*(1.25-2.50*smooth((u-.29)/.16));
      p.jump=.24*Math.sin(Math.PI*Math.min(u/.43,1));p.lean+=.32*pulse(u-.48,.13);break;
    case 'dash':
      p.yaw*=1-envelope;p.pitch+=envelope*(-.33+.82*smooth((u-.56)/.22));
      p.reach=.105*envelope;p.lean+=.31*envelope;break;
    case 'rampage':
      if(t<3){p.yaw+=1.8*Math.sin(t*16)*envelope;p.twist=.66*Math.sin(t*16)*envelope;}
      else{p.pitch+=envelope*(1.3-2.5*smooth((t-3)/.17));}
      break;
    case 'runningSweep':
      p.yaw+=envelope*(-1.7+3.4*smooth((u-.12)/.53));p.pitch-=.50*envelope;
      p.twist=-.65*Math.sin(tau*u);p.lean=.32*envelope;break;
    case 'jump':
      p.jump=.56*Math.sin(Math.PI*u);p.tuck=.18*Math.sin(Math.PI*u);
      p.pitch+=.40*envelope;p.lean=.21*envelope;break;
    case 'airSweep':
      p.jump=move.launchHeight*(1-u)+.23*Math.sin(Math.PI*u);
      p.turn=tau*smooth((u-.04)/.82);p.pitch-=.69*envelope;
      p.tuck=.17*Math.sin(Math.PI*u);p.roll=-.21*envelope;break;
    case 'plunge':{
      const fall=smooth((u-.14)/.375);
      p.jump=(move.launchHeight+.08*Math.sin(Math.PI*u))*(1-fall);
      p.pitch+=envelope*(.94-2.25*fall);p.lean+=.55*envelope*fall;
      p.tuck=.17*(1-fall);break;
    }
    case 'drill':
      p.jump=.70*Math.sin(Math.PI*smooth((u-.20)/.74));
      p.turn=tau*2*smooth((u-.23)/.65);
      p.pitch+=envelope*(-.61+1.38*smooth((u-.19)/.26));
      p.roll=-.25*envelope;p.tuck=.16*p.jump/.70;p.lean+=.34*pulse(u-.14,.13);break;
    case 'risingSlam':{
      const arc=smooth((u-.10)/.58);
      p.jump=.66*Math.sin(Math.PI*arc);p.turn=tau*smooth((u-.10)/.54);
      p.pitch+=envelope*(.83-2.16*smooth((u-.53)/.16));
      p.tuck=.17*Math.sin(Math.PI*arc);p.lean+=.52*pulse(u-.69,.11);break;
    }
    case 'dodge':p.lean=.5*envelope;p.jump=.09*Math.sin(Math.PI*u);p.pitch-=.55*envelope;break;
  }
  // Load the back leg, take a lead step, then send pelvis, ribs and hands through the attack.
  const plant=smooth(u/.32),recover=smooth((u-.52)/.48),wind=pulse(u-.10,.13);
  if(move.anim==='thrust'||move.anim==='dash'){
    const drive=plant*(1-recover);
    p.load=.075*wind+.071*drive;
    p.drive=-.050*wind+.115*drive;
    p.coil=.28*wind-.46*drive;
    p.lean+=.17*drive;
    p.lead=.135*drive;p.trail=-.115*drive;
    p.footLift=.085*pulse(u-.14,.105);
    p.reach+=.044*drive;
    if(move.id==='C6'){
      p.pitch+=.64*pulse(u-.18,.12)-.94*pulse(u-.80,.10);
      p.yaw-=.65*pulse(u-.70,.11);p.twist-=.47*pulse(u-.78,.13);
    }
  }else{
    p.load=.046*envelope;p.drive=.038*envelope;
    p.coil=.42*p.twist;p.lead=.073*envelope;p.trail=-.067*envelope;
    p.footLift=.055*pulse(u-.18,.11);
  }
  return p;
}

export async function loadFighter(){
  const loader=new GLTFLoader(),base=import.meta.env.BASE_URL+'assets/';
  const [body,weapon]=await Promise.all([loader.loadAsync(base+'hero/zhao_yun_retopology_rigging.glb'),
    loader.loadAsync(base+'weapon/practice-spear.glb')]);
  const actor=new T.Group(),pivot=new T.Group(),bones={},rest={};
  actor.add(pivot);pivot.add(body.scene);
  body.scene.traverse(o=>{
    if(o.isBone){bones[o.name]=o;rest[o.name]=o.quaternion.clone();}
    if(o.isMesh){o.castShadow=true;o.frustumCulled=false;o.material.roughness=Math.max(.76,o.material.roughness);
      o.material.metalness*=.42;o.material.normalScale?.set(.38,.38);
      o.material.envMapIntensity=.60;}
  });
  const staff=new T.Group();pivot.add(staff);staff.add(weapon.scene);
  // The shaft has the same .0125 radius in both transverse axes.
  weapon.scene.position.y=-.24;
  weapon.scene.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=true;
    if(o.material.map)o.material=new T.MeshBasicMaterial({map:o.material.map,toneMapped:false});
    if(o.name.includes('Round')){
      // Use the cylindrical surface normal to roll a lacquer highlight across the barrel.
      o.material=new T.MeshPhongMaterial({color:0x67398c,specular:0x9781a7,shininess:28});
    }
  });
  const up=v(0,1,0),world=new T.Quaternion(),tempQ=new T.Quaternion();
  function bodyPoint(x){return pivot.localToWorld(x.clone())}
  function rotateBone(name,axis,angle){
    const b=bones[name];b.parent.getWorldQuaternion(world);pivot.getWorldQuaternion(tempQ);
    const local=axis.clone().applyQuaternion(tempQ).applyQuaternion(world.invert());
    b.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(local,angle));b.updateWorldMatrix(false,true);
  }
  function aimJoint(b,child,target){
    const start=b.getWorldPosition(v()),current=child.getWorldPosition(v()).sub(start).normalize();
    const desired=target.clone().sub(start).normalize(),delta=new T.Quaternion().setFromUnitVectors(current,desired);
    const parent=b.parent.getWorldQuaternion(new T.Quaternion());
    b.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));b.updateWorldMatrix(false,true);
  }
  // Derive each palm's basis from its own bind-pose knuckles, independent of bone roll.
  function basis(axis,forward){
    const x=axis.clone().normalize(),y=forward.clone().addScaledVector(x,-forward.dot(x)).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,x.clone().cross(y)));
  }
  const palms={};
  for(const side of ['Right','Left']){
    const hand=bones[side+'_Hand'];
    const local=f=>hand.worldToLocal(bones[side+'_'+f+'Proximal'].getWorldPosition(v()));
    const middle=local('Middle');
    palms[side]={middle,bind:basis(local('Index').sub(local('Pinky')),middle).invert()};
  }
  // The rear hand drives from the waist, the guide hand receives from underneath.
  // Roll the knuckles toward their own forearm, so neither wrist has to fold sideways
  // just to make a predetermined palm orientation touch the shaft.
  function gripFrame(side,sign,direction,point){
    const shaft=direction.clone().normalize(),shoulder=pivot.worldToLocal(bones[side+'_UpperArm'].getWorldPosition(v()));
    const elbowPole=v(sign*.48,-.95,-.58);
    const elbowHint=shoulder.clone().addScaledVector(elbowPole,.11);
    const forward=point.clone().sub(elbowHint).normalize();
    const tangent=forward.clone().addScaledVector(shaft,-forward.dot(shaft));
    const fallback=v(-sign*.7,-.45,.8);fallback.addScaledVector(shaft,-fallback.dot(shaft));
    if(tangent.lengthSq()<.035)tangent.addScaledVector(fallback,.25);
    tangent.normalize();
    const radial=tangent.clone().cross(shaft).multiplyScalar(sign);
    // An oblique grip puts the thumb/index slightly nearer the point than the little finger.
    const knuckles=shaft.clone().multiplyScalar(.96).addScaledVector(tangent,sign*.23).normalize();
    const rot=basis(knuckles,tangent).multiply(palms[side].bind);
    const offset=radial.clone().multiplyScalar(.0175).sub(palms[side].middle.clone().applyQuaternion(rot));
    return {side,sign,shaft,rot,offset,elbowPole};
  }
  function grip(frame,point){
    const {side,sign,shaft,rot,offset}=frame;
    const arm=bones[side+'_UpperArm'],fore=bones[side+'_LowerArm'],hand=bones[side+'_Hand'];
    const shoulder=arm.getWorldPosition(v()),elbow=fore.getWorldPosition(v()),wrist=hand.getWorldPosition(v());
    const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist);
    const wristTarget=bodyPoint(point.clone().add(offset));
    const axis=wristTarget.clone().sub(shoulder).normalize();
    const dist=clamp(wristTarget.distanceTo(shoulder),Math.abs(a-b)+.0001,a+b-.0001);
    const along=(a*a-b*b+dist*dist)/(2*dist);
    const pole=frame.elbowPole.clone().applyQuaternion(pivot.getWorldQuaternion(new T.Quaternion()));
    pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const aim=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    aimJoint(arm,fore,aim);aimJoint(fore,hand,wristTarget);
    const parent=hand.parent.getWorldQuaternion(new T.Quaternion());
    hand.quaternion.copy(parent.invert().multiply(pivot.getWorldQuaternion(new T.Quaternion())).multiply(rot));
    hand.updateWorldMatrix(false,true);
    // Each phalanx aims at the next contact around the circular shaft. The thumb opposes the fingers.
    for(const finger of ['Index','Middle','Ring','Pinky','Thumb']){
      const thumb=finger==='Thumb';
      for(const [part,next] of [['Proximal','Intermediate'],['Intermediate','Distal'],['Distal','DistalEnd']]){
        const joint=bones[side+'_'+finger+part],child=bones[side+'_'+finger+next];
        if(!child){
          // Some distal fingertip markers were omitted by the exporter.
          if(joint)joint.quaternion.copy(rest[joint.name]);continue;
        }
        const start=joint.getWorldPosition(v()),local=pivot.worldToLocal(start.clone()).sub(point);
        const along=local.dot(shaft),radial=local.clone().addScaledVector(shaft,-along);
        const len=child.getWorldPosition(v()).distanceTo(start),radius=thumb?.019:.0185;
        const angle=2*Math.asin(clamp(len/(2*radius),0,.87))*sign*(thumb?-1:1);
        const target=radial.normalize().applyAxisAngle(shaft,angle).multiplyScalar(radius)
          .addScaledVector(shaft,along+(thumb?.004:0)).add(point);
        aimJoint(joint,child,bodyPoint(target));
      }
    }
  }
  // One cycle follows the approved 13 frames at 24fps. Contact -> compression ->
  // toe-off -> folded recovery -> forward extension. Both feet use the same curve, half a cycle apart.
  const cycle=13/24, support=.38, contacts={};
  function resetStride(){step=0;carry=0;for(const key in contacts)delete contacts[key];}
  // Cubic Hermite swing with backward velocity on BOTH ends: no kick forward on toe-off,
  // no dead stop when reaching ahead. Unit of length is one cycle of root travel.
  function runFoot(phase,travel){
    if(phase<support)return {z:travel*(support*.5-phase),h:0};
    const u=(phase-support)/(1-support),ease=smooth(u);
    const arc=Math.sin(Math.PI*u)**1.65;
    // Fold the heel first; keep it up under the driving knee before extending to land.
    return {z:travel*(-support*.5+support*ease+(1-support)*(ease-u)+.060*arc*pulse(u-.65,.21)),
      h:.155*arc*(1.15+.22*Math.cos(Math.PI*u))+.053*arc*pulse(u-.66,.20)};
  }
  function placeLeg(side,sign,gait,move,time,p,travel){
    const thigh=bones[side+'_UpperLeg'],shin=bones[side+'_LowerLeg'],foot=bones[side+'_Foot'];
    const phase=T.MathUtils.euclideanModulo(step/tau+(sign===1?0:.5),1);
    const stride=runFoot(phase,travel),stepOut=moveWeight(move,time)*.073;
    const target=bodyPoint(v(sign*(.09-.026*gait),.048+stride.h*gait+(sign===1?p.footLift:0),
      .021+sign*(.054+stepOut)*(1-gait)+stride.z*gait+(sign===1?p.lead:p.trail)+p.tuck*(sign===1?.38:-.48)));
    target.y-=runBob;target.y+=p.tuck*(sign===1?1:.65);
    // Save the actual landing point in world space. Hold through a turn, release into
    // swing with a fading correction instead of snapping back to the local foot path.
    const state=contacts[side]??={plant:null,release:v(),phase:null};
    const running=!move&&gait>.12;
    if(running&&phase<support){
      if(!state.plant||state.phase===null||phase<state.phase)state.plant=target.clone();
      state.release.copy(state.plant).sub(target);state.release.y=0;
      target.x=state.plant.x;target.z=state.plant.z;
    }else if(running){
      state.plant=null;target.addScaledVector(state.release,1-smooth((phase-support)/.26));
    }else{state.plant=null;state.release.set(0,0,0);}
    state.phase=phase;
    const hip=thigh.getWorldPosition(v()),k=shin.getWorldPosition(v()),ankle=foot.getWorldPosition(v());
    const a=hip.distanceTo(k),b=k.distanceTo(ankle);
    const delta=target.clone().sub(hip),d=clamp(delta.length(),Math.abs(a-b)+.001,a+b-.001);
    const axis=delta.normalize(),pole=v(sign*.12,0,1).applyQuaternion(pivot.getWorldQuaternion(new T.Quaternion()));
    pole.addScaledVector(axis,-pole.dot(axis)).normalize();
    const along=(a*a-b*b+d*d)/(2*d);
    const knee=hip.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
    aimJoint(thigh,shin,knee);aimJoint(shin,foot,target);
    const toe=bones[side+'_Toes'],ankleNow=foot.getWorldPosition(v());
    const roll=(.24*pulse(phase-.03,.084)-.8*pulse(phase-.46,.15)+.18*pulse(phase-.90,.12))*gait;
    const toeDir=v(sign*.003,-.023,.040).applyAxisAngle(v(1,0,0),-roll).applyQuaternion(pivot.getWorldQuaternion(new T.Quaternion()));
    aimJoint(foot,toe,ankleNow.add(toeDir));
  }
  const tip=v(),edge=v();
  let carry=0,runBob=0,elapsed=0,step=0,priorMove,previousPose,blendFrom,blendTime=1;
  function pose(dt,gait,move,t,speed=0){
    elapsed+=dt;
    const cadence=(.65+.35*gait)/cycle;
    if(gait>.015)step+=dt*tau*cadence;
    else step=0;
    const travel=move ? .62 : clamp(speed/cadence,0,.82);
    const p=choreography(move,t),wave=Math.sin(step),idle=Math.sin(elapsed*2.5);
    if(previousPose && priorMove!==move){
      blendFrom={...previousPose};
      blendFrom.turn=T.MathUtils.euclideanModulo(blendFrom.turn+Math.PI,tau)-Math.PI;
      blendTime=0;
    }
    blendTime+=dt;
    if(blendFrom && blendTime<.065){
      const mix=smooth(blendTime/.065);
      for(const key in p)p[key]=T.MathUtils.lerp(blendFrom[key],p[key],mix);
    }
    priorMove=move;previousPose={...p};
    for(const name in rest)bones[name].quaternion.copy(rest[name]);
    pivot.rotation.order="YXZ";pivot.rotation.set(0,p.turn,p.roll);
    runBob=gait*(.018-.024*Math.cos(2*step-tau*.19));
    pivot.position.y=p.jump+runBob;
    pivot.updateWorldMatrix(true,true);
    rotateBone('Chest',v(1,0,0),p.lean+.23*gait+.012*idle*(1-gait));
    rotateBone('Chest',up,p.twist-.34*gait+.08*gait*Math.cos(step-.55));
    const hips=bones.Hips;
    if(!hips.userData.basePosition)hips.userData.basePosition=hips.position.clone();
    hips.position.copy(hips.userData.basePosition);
    const down=v(.008*gait*wave,-.024-.069*gait-p.load,p.drive+.012*gait);
    const localDown=bodyPoint(down).sub(bodyPoint(v())).applyQuaternion(hips.parent.getWorldQuaternion(new T.Quaternion()).invert());
    hips.position.add(localDown);hips.updateWorldMatrix(false,true);
    rotateBone('Hips',up,p.coil-.13*gait*Math.cos(step-.55));
    rotateBone('Hips',v(1,0,0),.20*gait);
    rotateBone('Spine',v(1,0,0),.65*p.lean+.09*gait);
    rotateBone('Neck',v(1,0,0),-.48*p.lean-.31*gait);
    rotateBone('Neck',up,.26*gait);
    rotateBone('Left_Shoulder',up,-.32*gait);
    for(const [side,sign] of [['Left',1],['Right',-1]])placeLeg(side,sign,gait,move,t,p,travel);
    carry=T.MathUtils.damp(carry,move?0:gait,18,dt);
    p.yaw+=carry*(-.06+.026*Math.cos(step-.62));
    p.pitch+=carry*(-.18+.024*Math.sin(step*2-.7));
    const dir=v(Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),Math.cos(p.yaw)*Math.cos(p.pitch));
    const rear=v(-.137-.031*carry-.007*carry*wave,.457-p.load*.52+.004*idle*(1-gait)-.056*carry
      +.010*carry*Math.cos(step*2-.9),.116+p.reach+p.drive+.050*carry+.012*carry*wave);
    const spacing=.26+.077*carry;
    const right=gripFrame('Right',-1,dir,rear),left=gripFrame('Left',1,dir,rear.clone().addScaledVector(dir,spacing));
    // Keep both wrists within reach by translating the rigid weapon as one piece.
    for(let pass=0;pass<4;pass++)for(const [frame,distance] of [[right,0],[left,spacing]]){
      const {side,offset}=frame,upper=bones[side+'_UpperArm'],lower=bones[side+'_LowerArm'];
      const shoulder=pivot.worldToLocal(upper.getWorldPosition(v()));
      const reach=lower.position.length()+bones[side+'_Hand'].position.length()-.001;
      const delta=rear.clone().addScaledVector(dir,distance).add(offset).sub(shoulder);
      if(delta.length()>reach)rear.addScaledVector(delta,reach/delta.length()-1);
    }
    const fore=rear.clone().addScaledVector(dir,spacing);
    staff.position.copy(rear);staff.quaternion.setFromUnitVectors(up,dir);
    grip(right,rear);grip(left,fore);
    staff.localToWorld(tip.set(0,.689,0));staff.localToWorld(edge.set(0,.43,0));
  }
  return {actor,pose,tip,edge,resetStride};
}
function moveWeight(move,t){return move?Math.sin(Math.PI*clamp(t/move.dur,0,1)):0}
