import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

export function makeArena(canvas){
  const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.VSMShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  const scene=new T.Scene();scene.background=new T.Color(0xc7d4cd);scene.fog=new T.FogExp2(0xc7d4cd,.034);
  const studio=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(studio,.065).texture;scene.environmentIntensity=.36;
  pmrem.dispose();studio.dispose();
  const camera=new T.OrthographicCamera(-2,2,2,-2,.1,90);let size=1.28;
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.top=size;camera.bottom=-size;
    camera.right=size*w/h;camera.left=-camera.right;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);canvas.addEventListener('wheel',e=>{e.preventDefault();size=T.MathUtils.clamp(size+e.deltaY*.0015,1.05,4);resize()},{passive:false});
  scene.add(new T.HemisphereLight(0xfff4e1,0x9ab7b8,1.75));
  const sun=new T.DirectionalLight(0xffebca,1.65);sun.position.set(5,9,4);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius=4;sun.shadow.blurSamples=6;sun.shadow.bias=-.0005;sun.shadow.normalBias=.009;scene.add(sun);
  const floor=new T.Mesh(new T.PlaneGeometry(180,180),new T.MeshStandardMaterial({color:0x9daea7,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const grid=new T.GridHelper(48,48,0x91a297,0x91a297);grid.position.y=.002;grid.material.opacity=.30;grid.material.transparent=true;scene.add(grid);
  function boundary(radius,width,color){
    const ring=new T.Mesh(new T.RingGeometry(radius-width,radius,192),new T.MeshBasicMaterial({color,transparent:true,opacity:.64}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.005;scene.add(ring);
  }
  boundary(7.8,.036,0xdbd4b1);boundary(7.66,.012,0xdbd4b1);boundary(1,.014,0xc9cdba);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=96;
  const ctx=shadowCanvas.getContext('2d'),shade=ctx.createRadialGradient(48,48,0,48,48,46);
  shade.addColorStop(0,'rgba(43,54,58,.56)');shade.addColorStop(.48,'rgba(43,54,58,.28)');shade.addColorStop(1,'rgba(43,54,58,0)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,96,96);
  const shadow=new T.Mesh(new T.PlaneGeometry(.66,.46),new T.MeshBasicMaterial({
    map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false
  }));
  shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const focus=new T.Vector3(0,.49,0),offset=new T.Vector3(0,2.65,4.8);
  function draw(actor,dt){
    const height=Math.max(0,actor.children[0].position.y);
    shadow.position.set(actor.position.x,.009,actor.position.z);
    shadow.scale.setScalar(1+height*.80);shadow.material.opacity=.66/(1+height*3);
    focus.lerp(new T.Vector3(actor.position.x,.49+.42*height,actor.position.z),1-Math.exp(-dt*8));
    camera.position.copy(focus).add(offset);camera.lookAt(focus);renderer.render(scene,camera);
  }
  return {scene,draw};
}

export function effects(scene){
  const active=[],trail=[];
  const ribbon=new T.BufferGeometry(),positions=new Float32Array(6*3*30);
  ribbon.setAttribute('position',new T.BufferAttribute(positions,3));ribbon.setDrawRange(0,0);
  const sweep=new T.Mesh(ribbon,new T.MeshBasicMaterial({color:0x8ee8ff,transparent:true,opacity:.72,side:T.DoubleSide,depthWrite:false}));
  sweep.frustumCulled=false;scene.add(sweep);
  function impact(hit,actor){
    const s=hit.shape,big=hit.fx==='burst'||hit.fx==='ring';
    const mat=new T.MeshBasicMaterial({color:big?0xffdb84:0xb5f5ff,side:T.DoubleSide,transparent:true,opacity:.7,depthWrite:false});
    const range=(s.r??s.len)*.48;
    let geo,mesh;
    if(s.type==='line'){
      geo=new T.PlaneGeometry(s.w*.34,range);mesh=new T.Mesh(geo,mat);
    }else{
      const arc=s.type==='sector'?s.a*Math.PI/180:Math.PI*2;
      geo=new T.RingGeometry(Math.max(.01,range-.045),range,72,1,Math.PI/2-arc/2,arc);mesh=new T.Mesh(geo,mat);
    }
    const group=new T.Group();group.position.copy(actor.position);group.position.y=.025;group.rotation.y=actor.rotation.y;
    group.add(mesh);mesh.rotation.x=Math.PI/2;
    mesh.position.z=s.type==='line'?range/2:(s.off??0)*.48;
    scene.add(group);active.push({group,mesh,time:0,life:big?.37:.17});
  }
  // Two rising ribbons turn around the spear during vortex and musou techniques.
  const winds=[0,1].map(index=>{
    const geometry=new T.PlaneGeometry(1,1,48,1);
    const material=new T.MeshBasicMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,
      color:index?0xbbfaff:0x2b9dc2,blending:T.NormalBlending});
    const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);return mesh;
  });
  function wind(move,time,actor){
    const power=move && ['C3','C5','C6','SK1','SK2','RAMPAGE','N6','EX1','EX2','AIR_J','AIR_K'].includes(move.id);
    winds.forEach((mesh,index)=>{
      mesh.visible=Boolean(power);
      if(!power)return;
      const progress=Math.min(1,time/move.dur),burst=move.anim==='dash';
      mesh.material.opacity=(index?.72:.55)*Math.sin(Math.PI*progress);
      mesh.position.copy(actor.position);mesh.position.y+=actor.children[0].position.y;
      mesh.rotation.y=actor.rotation.y;
      const pos=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
      for(let i=0;i<pos.count;i++){
        const u=uv.getX(i),edge=uv.getY(i),angle=index*Math.PI+time*13+u*4.1;
        const radius=.33+u*.54+.15*Math.sin(Math.PI*progress);
        const h=.18+u*.57+edge*.07*Math.sin(Math.PI*u);
        if(move.id==='EX1'){
          // Energy twists from the leading hand out along the line of the charge, then climbs.
          const climb=T.MathUtils.smoothstep(progress,.22,.48);
          const cork=angle+u*5.2,spread=(.12+.28*u)*Math.sin(Math.PI*u);
          pos.setXYZ(i,Math.sin(cork)*spread,.34+u*climb*.8+Math.cos(cork)*spread+edge*.045,
            .12+u*(1.05-.65*climb));
        }else if(move.id==='EX2'||move.id==='AIR_K'){
          const landing=T.MathUtils.smoothstep(progress,.53,.83);
          const r=radius*(.63+landing),blade=Math.sin(Math.PI*u);
          pos.setXYZ(i,Math.sin(angle)*r,(1-landing)*(.18+.74*u)+.025+edge*.065*blade,Math.cos(angle)*r);
        }else{
          pos.setXYZ(i,Math.sin(angle)*radius,burst?.30+Math.cos(angle)*.20+edge*.025:h,
            burst?u*1.1-.65:Math.cos(angle)*radius);
        }
      }
      pos.needsUpdate=true;
    });
  }
  function update(dt,fx,fighter){
    for(let i=active.length-1;i>=0;i--){const a=active[i];a.time+=dt;
      a.mesh.material.opacity=.68*(1-a.time/a.life);a.group.scale.setScalar(.74+.26*a.time/a.life);
      if(a.time>=a.life){scene.remove(a.group);a.mesh.geometry.dispose();a.mesh.material.dispose();active.splice(i,1);}
    }
    for(const x of trail)x.age+=dt;
    while(trail.length&&(trail[0].age>.11||trail.length>=30))trail.shift();
    if(fx)trail.push({a:fighter.tip.clone(),b:fighter.edge.clone(),age:0});
    let n=0;
    for(let i=1;i<trail.length;i++){
      const last=trail[i-1],cur=trail[i];
      for(const point of [last.a,last.b,cur.b,last.a,cur.b,cur.a]){point.toArray(positions,n);n+=3;}
    }
    ribbon.attributes.position.needsUpdate=true;ribbon.setDrawRange(0,n/3);
  }
  function clear(){trail.length=0;for(const a of active){scene.remove(a.group);a.mesh.geometry.dispose();a.mesh.material.dispose();}active.length=0;}
  return {impact,update,wind,clear};
}
