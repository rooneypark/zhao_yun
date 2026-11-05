import fs from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Box3,Vector3} from 'three';
globalThis.self=globalThis;
// Texture pixels do not affect CPU skeleton/animation validation.
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const manifest=JSON.parse(await fs.readFile('public/overlord/assets/characters/manifest.json','utf8'));
const rows=[];
for(const entry of manifest.characters){
  const bytes=await fs.readFile('public'+entry.url);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const mixer=new AnimationMixer(gltf.scene);let skins=0,movingClips=0;
  gltf.scene.traverse(o=>{if(o.isSkinnedMesh){skins++;o.skeleton.update();const a=o.geometry.attributes;for(let i=0;i<a.position.count;i++){let sum=0;for(let k=0;k<4;k++){const joint=a.skinIndex.array[i*4+k],weight=a.skinWeight.array[i*4+k];if(!Number.isFinite(weight)||joint>=o.skeleton.bones.length)throw Error(entry.id+':invalid skin');sum+=weight;}if(Math.abs(sum-1)>.02)throw Error(entry.id+':unnormalized weights '+sum);}}});
  if(!skins||!gltf.animations.length)throw Error(entry.id+':missing skin/animation');
  for(const clip of gltf.animations){
    const action=mixer.clipAction(clip);action.play();mixer.setTime(clip.duration*.5);gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))throw Error(entry.id+':nonfinite matrix '+clip.name);});
    if(clip.tracks.some(t=>{const n=t.getValueSize();return t.values.some((v,i)=>i>=n&&Math.abs(v-t.values[i%n])>1e-5)}))movingClips++;
    mixer.stopAllAction();
  }
  const box=new Box3().setFromObject(gltf.scene);const size=box.getSize(new Vector3());
  if(!size.toArray().every(Number.isFinite))throw Error(entry.id+':nonfinite bounds');
  rows.push({id:entry.id,skins,clips:gltf.animations.length,movingClips,bindBounds:size.toArray()});
}
await fs.writeFile('reference/overlord/analysis/character-validation.json',JSON.stringify({status:'passed',characters:rows},null,2));
console.log(JSON.stringify({status:'passed',characters:rows.length,clips:rows.reduce((n,r)=>n+r.clips,0),movingClips:rows.reduce((n,r)=>n+r.movingClips,0)}));
