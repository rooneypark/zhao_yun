import * as T from 'three';
import {loadFighter} from './rig.js';
import {makeArena,effects} from './arena.js';
import {ZY_MOVES,ZY_SKILLS,RAMPAGE} from './moves.js';

const dodge={anim:'dodge',name:'회피',dur:.35,cancel:.35,lunge:[0,.26,9],hits:[]};
const rampage={name:'창룡난무',anim:'rampage',dur:RAMPAGE.dur,cancel:RAMPAGE.dur,hits:[]};
for(let t=.18;t<RAMPAGE.finishAt;t+=RAMPAGE.tick)rampage.hits.push({...RAMPAGE.tickHit,t});
rampage.hits.push({...RAMPAGE.finish,t:RAMPAGE.finishAt});
const sector=(t,r,a,fx='slash')=>({t,shape:{type:'sector',r,a},fx});
const ring=(t,r,fx='burst')=>({t,shape:{type:'circle',r},fx});
const drills=[.15,.31,.41,.51,.61,.73].map(t=>sector(t,3,95,'up'));
const specials={
  RUN:{name:'질주 횡소',anim:'runningSweep',dur:.52,cancel:.28,lunge:[.04,.39,6],hits:[sector(.18,2.9,170),sector(.33,2.8,125)]},
  JUMP:{name:'도약',anim:'jump',dur:.76,cancel:.13,lunge:[.12,.60,2.7],hits:[]},
  AIR_J:{name:'공중 선회베기',anim:'airSweep',dur:.64,cancel:.31,lunge:[.04,.41,3.4],hits:[sector(.23,3.2,185)]},
  AIR_K:{name:'낙룡격',anim:'plunge',dur:.72,cancel:.59,lunge:[.09,.35,5],hits:[ring(.37,4.6)]},
  EX1:{name:'승룡 관통',anim:'drill',dur:1.16,cancel:1.02,lunge:[.06,.29,10],hits:drills},
  EX2:{name:'회룡 낙참',anim:'risingSlam',dur:1.04,cancel:.89,lunge:[.12,.43,4.7],hits:[sector(.31,3.2,175),ring(.71,4.5)]}
};
const moveBook={...ZY_MOVES,...specials,DODGE:dodge,RAMPAGE:rampage};
const names=['찌르기','가로베기','이연 찌르기','역베기','연속 찌르기','회전베기'];
const bindings={KeyJ:'attack',KeyK:'charge',KeyU:'SK1',KeyO:'SK2',KeyI:'RAMPAGE',Space:'DODGE',KeyL:'DODGE',KeyF:'JUMP'};
const hud=document.querySelector('#action'),history=document.querySelector('#sequence'),cooldowns=document.querySelector('#cooldown');
async function start(){
  const arena=makeArena(document.querySelector('canvas')),fx=effects(arena.scene),fighter=await loadFighter();
  const keys=new Set(),cd={SK1:0,SK2:0};let move=null,time=0,nextHit=0,buffer=null,gait=0,chain=[],yaw=0;
  let clock=0,lastActionEnd=-1,runSpeed=0;const actor=fighter.actor;arena.scene.add(actor);
  function enter(id){
    move={...moveBook[id],id,launchHeight:Math.max(0,actor.children[0].position.y)};time=0;nextHit=0;
    if(id==='SK1'||id==='SK2')cd[id]=ZY_SKILLS[id.toLowerCase()].cd;
    if(id==='N1'||id==='C1'||chain.length>=7||(!id.match(/^[NC]/)&&!['EX1','EX2','AIR_J','AIR_K'].includes(id)))chain=[];
    chain.push(id);history.textContent=chain.join(' → ');
    hud.textContent=move.name||(id.startsWith('N')?names[Number(id.slice(1))-1]:id);
  }
  function consume(){
    if(!buffer)return;
    if(clock>buffer.until){buffer=null;return;}
    if(move&&time<move.cancel)return;
    const input=buffer.kind,n=move?.id==='RUN'?1:move?.id.startsWith('N')?Number(move.id.slice(1)):0;
    const canAirAttack=move?.id==='JUMP'&&time<.54;
    let id=input;
    if(input==='attack'){
      if(!move)id=gait>.78&&keys.size?'RUN':'N1';
      else if(canAirAttack)id='AIR_J';
      else if(move.id==='C3')id='EX1';
      else if(move.id==='C1')id='EX2';
      else id=n>0&&n<6?'N'+(n+1):null;
    }
    if(input==='charge'){
      if(canAirAttack||move?.id==='AIR_J'&&time<.42)id='AIR_K';
      else id=!move?'C1':n>0&&n<6?'C'+(n+1):null;
    }
    if(move?.id==='JUMP'&&!canAirAttack)return;
    if(move&&input==='JUMP')id=null;
    if(id&&!(cd[id]>0)){buffer=null;enter(id);}
  }
  function reset(){
    actor.position.set(0,0,0);yaw=.55;actor.rotation.y=yaw;
    move=null;buffer=null;chain=[];cd.SK1=cd.SK2=0;lastActionEnd=-1;
    keys.clear();history.textContent='';fx.clear();gait=0;runSpeed=0;fighter.resetStride();
  }
  reset();document.querySelector('#reset').onclick=reset;
  addEventListener('keydown',e=>{
    if(e.ctrlKey||e.altKey||e.metaKey)return;
    if(bindings[e.code]||e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault();
    keys.add(e.code);if(e.repeat)return;
    if(e.code==='KeyR'){reset();return;}
    if(bindings[e.code]){buffer={kind:bindings[e.code],until:clock+.34};consume();}
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  addEventListener('blur',()=>{keys.clear();buffer=null;});
  let previous=performance.now();
  function frame(now){
    const dt=Math.min(.04,(now-previous)/1000);previous=now;clock+=dt;
    cd.SK1=Math.max(0,cd.SK1-dt);cd.SK2=Math.max(0,cd.SK2-dt);
    const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const z=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    const moving=x!==0||z!==0;
    if(moving)yaw=Math.atan2(x,z);
    if(!move||move.steer||time<.12){
      const delta=T.MathUtils.euclideanModulo(yaw-actor.rotation.y+Math.PI,Math.PI*2)-Math.PI;
      actor.rotation.y+=T.MathUtils.clamp(delta,-dt*(move?.steer??8),dt*(move?.steer??8));
    }
    // Move along the turning body; brake into a reversal instead of immediately sliding sideways.
    const before=actor.position.clone();
    const facing=moving?(x*Math.sin(actor.rotation.y)+z*Math.cos(actor.rotation.y))/Math.hypot(x,z):0;
    const desired=(!move&&moving)?1.48*Math.max(0,facing):0;
    runSpeed=T.MathUtils.damp(runSpeed,desired,desired>runSpeed?9:14,dt);
    if(!move&&runSpeed>.008)actor.position.addScaledVector(new T.Vector3(Math.sin(actor.rotation.y),0,Math.cos(actor.rotation.y)),dt*runSpeed);
    if(move){
      const last=time;time+=dt;
      if(move.lunge){
        const [a,b,speed]=move.lunge;
        const ease=t=>{const u=T.MathUtils.clamp((t-a)/(b-a),0,1);return u*u*(3-2*u)};
        const span=(b-a)*(ease(time)-ease(last));
        actor.position.addScaledVector(new T.Vector3(Math.sin(actor.rotation.y),0,Math.cos(actor.rotation.y)),span*speed*.48);
      }
      while(nextHit<move.hits.length&&move.hits[nextHit].t<=time)fx.impact(move.hits[nextHit++],actor);
      consume();
      if(move&&time>=move.dur){move=null;time=0;lastActionEnd=clock;}
    }
    consume();
    if(actor.position.length()>7.4)actor.position.setLength(7.4);
    const speed=dt>0?actor.position.distanceTo(before)/dt:0;
    const attackRun=['dash','rampage','runningSweep'].includes(move?.anim);
    gait=T.MathUtils.damp(gait,move?(attackRun?1:0):Math.min(1,speed/1.48),15,dt);
    fighter.pose(dt,gait,move,time,speed);fx.wind(move,time,actor);fx.update(dt,move&&move.anim!=='dodge',fighter);
    if(!move){hud.textContent=moving?'달리기':'창술 대기';if(clock-lastActionEnd>1.1){history.textContent='';chain=[];}}
    cooldowns.textContent=[['SK1','용아돌'],['SK2','창룡선풍']].filter(([id])=>cd[id]>0).map(([id,name])=>name+' '+cd[id].toFixed(1)+'초').join('   ');
    arena.draw(actor,dt);requestAnimationFrame(frame);
  }
  document.querySelector('#loading').hidden=true;requestAnimationFrame(frame);
}
start().catch(err=>{console.error(err);document.querySelector('#loading').textContent='연무장을 열 수 없습니다. '+err.message;});
