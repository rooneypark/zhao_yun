import {mapNames} from './map-names.js';
import {generalNames} from './names.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {resolveClip,findSourcePath} from './combat.js';
import './style.css';

const $=s=>document.querySelector(s);
$('#app').innerHTML=`
<header><div><span class="eyebrow">OVERLORD / RESOURCE LAB</span><h1>진삼국무쌍 · 리소스 연구실</h1></div><div class="header-right"><span class="muted">맵 구성과 캐릭터 동작을 한 공간에서</span><span class="pill">로컬 분석 작업실</span><a href="/">기존 조운 연무장 ↗</a></div></header>
<main class="layout">
<aside><nav class="tabs"><button data-mode="map" class="active">맵 메이커</button><button data-mode="motion">모션 체커</button></nav>
<div class="section-heading"><h2 id="catalog-title">맵 리소스 목록</h2><span class="count" id="catalog-count">—</span></div>
<div class="stats"><div><strong id="map-count">—</strong><span>맵 파일 항목</span></div><div><strong id="char-count">—</strong><span>캐릭터 파일명 후보</span></div></div>
<input id="search" class="search" type="search" placeholder="파일명 검색…" aria-label="리소스 검색"><select id="map-kind" class="full"><option value="scene">원작 3D 장면</option><option value="recovered">해석한 맵 배치</option><option value="area">원본 영역 코드 격자</option><option value="map">맵 파일 전체</option></select><div id="catalog" class="catalog" style="margin-top:10px"></div>
<div class="note">목록은 APK 리소스 명세의 파일명입니다. 원작의 전체 맵·캐릭터 수나 변환 완료 여부를 뜻하지 않습니다.</div>
<details><summary>확보 범위와 분석 근거</summary><p id="coverage">명세를 읽는 중입니다.</p></details>
</aside>
<section class="viewport"><canvas id="view" aria-label="맵과 캐릭터 3D 미리보기" tabindex="0"></canvas><div class="toolbar"><div><button id="fit">전체 보기</button><button id="top">평면 보기</button><button id="perspective">입체 보기</button></div><div><button id="grid-toggle">격자 켜짐</button><button id="wire">와이어 꺼짐</button></div></div><div class="view-label" id="view-label">MAP WORKSPACE · 가져온 장면 없음</div>
<div class="empty" id="empty"><div class="symbol">◇</div><strong>원작 리소스를 확인할 작업 공간</strong><p>왼쪽에서 출처를 확인하고, 변환한 GLB·glTF 파일을 가져오세요. 지형·지물·컴포넌트와 애니메이션을 직접 검사합니다.</p></div>
<div class="busy" id="busy" hidden>리소스를 읽고 있습니다…</div>
<div class="timeline" id="timeline"><div class="row"><button id="play" disabled>▶ 재생</button><select id="clip" aria-label="애니메이션 클립" disabled><option value="">애니메이션 없음</option></select><select id="speed" aria-label="재생 속도"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><label class="layer"><input id="loop" type="checkbox" checked>반복</label></div><div class="row"><button id="step" disabled title="다음 프레임">+1F</button><input id="scrub" type="range" min="0" max="1" value="0" step="0.0001" disabled aria-label="애니메이션 타임라인"><span class="time" id="time">0.00 / 0.00s</span></div></div>
</section>
<aside class="right"><div class="section-heading"><h2>작업 리소스</h2><span class="status" id="asset-status">미가져오기</span></div><div class="detail" id="selected-source">목록에서 항목을 선택하면 파일 출처가 표시됩니다.</div>
<label class="file-label">GLB · glTF 가져오기<input id="model-files" type="file" multiple accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.basis"></label><p class="note">glTF는 .bin과 텍스처도 함께 선택하세요. 가져온 파일은 이 브라우저에서 처리됩니다.</p>
<div id="map-tools"><h3>표시 레이어</h3><div class="row"><label class="layer"><input type="checkbox" data-layer="terrain" checked>지형</label><label class="layer"><input type="checkbox" data-layer="props" checked>지물</label><label class="layer"><input type="checkbox" data-layer="components" checked>컴포넌트</label><label class="layer"><input type="checkbox" data-layer="sky">하늘</label><label class="layer"><input type="checkbox" data-layer="debug">충돌</label><label class="layer"><input type="checkbox" data-layer="regions">영역 코드</label></div><div id="area-legend" class="note" hidden>영역 원시 코드: <span style="color:#999">● 0</span> <span style="color:#71b8f0">● 1</span> <span style="color:#89d09b">● 2</span> <span style="color:#e98585">● 3</span><br>좌표 격자에 투영한 원본 값입니다. 이동·전투 가능 여부의 의미는 확정되지 않았습니다.</div><h3>장면 계층 <span class="count" id="object-count">0</span></h3><input id="object-search" class="search" type="search" placeholder="장면 오브젝트 검색…" aria-label="장면 오브젝트 검색"><div class="objects" id="objects"></div><div id="object-editor" hidden><h3 id="object-name">선택 오브젝트</h3><label class="field">레이어<select id="object-layer"><option value="">분류 없음</option><option value="terrain">지형</option><option value="props">지물</option><option value="components">컴포넌트</option><option value="sky">하늘</option><option value="debug">충돌 디버그</option><option value="regions">영역 코드</option></select></label><label class="layer" style="margin-top:10px"><input id="object-visible" type="checkbox" checked>오브젝트 표시</label><div class="transforms"><span></span><span>X</span><span>Y</span><span>Z</span>${['p','r','s'].map((k,i)=>`<span>${['위치','회전°','크기'][i]}</span>${['x','y','z'].map(a=>`<input aria-label="${['위치','회전','크기'][i]} ${a}" data-transform="${k}${a}" type="number" step="${k==='r'?1:0.1}">`).join('')}`).join('')}</div></div><div class="bottom-actions"><button id="export-scene">장면 저장</button><button id="import-scene">장면 열기</button></div><input id="scene-file" type="file" accept=".json" hidden><p class="note">장면 JSON은 메시·재질·계층·편집값과 클립을 저장합니다. 원본 게임 형식으로 다시 패킹하지는 않습니다.</p></div>
<div id="motion-tools" hidden><label><input type="checkbox" id="show-weapon" checked> 무기 표시</label><span id="weapon-info"></span><h3>동작 연결</h3><div id="source-combat" class="detail" hidden><strong>원작 입력 경로</strong><div id="source-combat-summary"></div><label class="layer"><input id="source-chain" type="checkbox" checked>원작 A 연계 검사</label><div id="source-sequence"></div><div id="combo-paths"></div><button id="source-reset" style="margin-top:8px">연계 초기화</button></div><div class="bindings" style="margin-top:10px">${[['attack','공격 J'],['skill1','스킬1 U'],['skill2','스킬2 O']].map(([id,label])=>`<label for="bind-${id}">${label}</label><select id="bind-${id}" data-binding="${id}" disabled><option value="">연결 안 함</option></select>`).join('')}</div><div class="bottom-actions"><button data-action="attack">공격</button><button data-action="skill1">스킬1</button><button data-action="skill2">스킬2</button></div><h3>공격 콤보 순서</h3><div class="row"><select id="combo-clip" class="full" disabled><option value="">클립 없음</option></select><button id="queue-add" disabled>+</button></div><div id="queue" class="queue" style="margin-top:10px"></div><div class="bottom-actions"><button id="queue-play" disabled>콤보 재생</button><button id="queue-clear">비우기</button></div><p class="note">클립 선택 → +로 순서 추가. 항목을 누르면 제거됩니다. <kbd>J</kbd> 공격 · <kbd>U</kbd>/<kbd>O</kbd> 스킬. 원본 연결 정보가 있으면 자동 지정됩니다. 슬롯을 바꾸면 사용자 지정 재생으로 전환됩니다.</p><h3>클립 정보</h3><div class="detail" id="clip-info">가져온 GLB·glTF에 실제 AnimationClip이 있어야 재생할 수 있습니다.</div></div>
<div class="divider"></div><button id="clear" class="full">작업 장면 비우기</button></aside></main><footer class="footer"><span id="message" role="status">목록을 불러오는 중입니다.</span><span>드래그 회전 · 휠 확대 · 우클릭 이동</span></footer>`;

const canvas=$('#view'), renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#1a222d');
const camera=new THREE.PerspectiveCamera(45,1,.01,100000);camera.position.set(10,8,12);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(0,1,0);
scene.add(new THREE.HemisphereLight(0xd7e8ff,0x67715d,2));const sun=new THREE.DirectionalLight(0xffe6be,3);sun.position.set(8,15,10);scene.add(sun);
const grid=new THREE.GridHelper(30,30,0x566777,0x303e4c);scene.add(grid);
const axes=new THREE.AxesHelper(1);scene.add(axes);
const content=new THREE.Group();scene.add(content);
let sourceCombat=null,combatIndex=null,sourcePlayingCombo=null,sourceQueue=[],clipMetadata=null,pointTypes={},catalog=null,mapIndex=null,sceneIndex=null,characterIndex=null,mode='map',source=null,clips=[],mixer=null,action=null,playing=false,queue=[],queueIndex=-1,selected=null,wire=false,loadGeneration=0;
const bindings={attack:'',skill1:'',skill2:''}, layerVisibility={terrain:true,props:true,components:true,sky:false,debug:false,regions:false};
const bindingOrigins={attack:'manual',skill1:'manual',skill2:'manual'};
const message=(text,error=false)=>{ $('#message').textContent=text;$('#message').classList.toggle('error',error); };
const name=o=>o.name||`${o.type} · ${o.uuid.slice(0,6)}`;
const safeText=(node,text)=>{node.textContent=text;return node;};
function resourcePath(row){return typeof row==='string'?row:row?.path||'—';}
function setMode(next){mode=next;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#map-tools').hidden=mode!=='map';$('#motion-tools').hidden=mode!=='motion';$('#map-kind').hidden=mode!=='map';$('#catalog-title').textContent=mode==='map'?'맵 리소스 목록':'캐릭터 리소스 후보';$('#view-label').textContent=`${mode==='map'?'MAP WORKSPACE':'MOTION WORKSPACE'} · ${content.children.length?`${content.children.length}개 루트`:'가져온 장면 없음'}`;renderCatalog();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function renderCatalog(){const box=$('#catalog');box.replaceChildren();if(!catalog)return;const recovered=mode==='map'&&$('#map-kind').value==='recovered',area=mode==='map'&&$('#map-kind').value==='area';const query=$('#search').value.toLowerCase().trim();const rows=mode==='motion'?[...(characterIndex?.characters||[]),...catalog.characterCandidates.filter(r=>!characterIndex?.characters?.some(c=>c.id===r.resourceId))]:area?(mapIndex?.areas||[]):recovered?(mapIndex?.maps||[]):$('#map-kind').value==='map'?catalog.mapFiles:(sceneIndex?.scenes?.length?sceneIndex.scenes:catalog.sceneBundles);const filtered=rows.filter(r=>String((r.resourceId||r.path||r.id||r.name)+' '+(mode==='motion'?(generalNames[r.resourceId||r.id]||''):(mapNames[r.id]||''))).toLowerCase().includes(query));$('#catalog-count').textContent=`${filtered.length.toLocaleString()}개`;for(const row of filtered.slice(0,300)){const b=document.createElement('button');b.className='resource';b.classList.toggle('selected',source===row);const title=document.createElement('strong');title.textContent=(mode==='motion'?generalNames[row.resourceId||row.id]:mapNames[row.id])||row.resourceId||row.path?.split('/').pop()||row.id;b.append(title,safeText(document.createElement('span'),mode==='motion'?(row.url?`${row.clipCount}개 원본 클립 · 스킨 모델`:'모델·동작 파일명 짝 후보'):area?`원시 코드 ${Object.keys(row.codeCounts||{}).join(' · ')} · 높이 격자 투영`:recovered?`${row.itemCount}개 배치 · ${row.terrainId?'지형 연결 후보':'배치 보기'}`:row.url?`${row.meshInstances}개 메시 · 원작 장면 변환`:'명세에 포함 · 변환 상태 별도'));b.onclick=()=>{source=row;$('#selected-source').replaceChildren();for(const text of mode==='motion'?[`후보 ID: ${row.resourceId}`,`모델: ${resourcePath(row.modelBundle)}`,`동작: ${resourcePath(row.animationBundle)}`,`스킬 이펙트: ${resourcePath(row.skillEffectBundle)}`]:area?[`영역: ${row.id}`,`지형: ${row.terrainId}`,`출처: ${row.source?.path}`]:recovered?[`맵: ${row.id}`,`장면: ${row.scenePath}`,`배치: ${row.itemCount}개`,`원본 SHA-256: ${row.source?.sha256||row.sourceSha256||'—'}`]:row.url?[`장면: ${mapNames[row.id]||row.id}`,`원본: ${row.sourceBundle}`,`변환 크기: ${(row.bytes||0).toLocaleString()} bytes`,`메시 인스턴스: ${row.meshInstances}`]:[`파일: ${row.path}`,`명세 크기: ${(row.manifestBytes||0).toLocaleString()} bytes`,`명세 MD5: ${row.manifestMd5||'없음'}`]){const line=document.createElement('div');line.textContent=text;$('#selected-source').append(line);}if(area)loadArea(row);else if(recovered)loadMap(row);else if(mode==='motion'&&row.url)loadCharacter(row);else if(mode==='map'&&row.url)loadRemoteAsset(row);else message('출처 선택됨. 대응하는 변환 GLB·glTF를 가져오면 미리볼 수 있습니다.');renderCatalog();};box.append(b);}if(filtered.length>300)box.append(safeText(document.createElement('p'),'앞 300개 표시 · 검색으로 범위를 좁히세요.'));if(!filtered.length)box.append(safeText(document.createElement('p'),recovered?'해석한 맵 목록을 준비 중입니다.':'일치하는 파일이 없습니다.'));}
$('#search').oninput=renderCatalog;$('#map-kind').onchange=renderCatalog;
fetch('/overlord/catalog.json').then(r=>{if(!r.ok)throw Error(`목록 HTTP ${r.status}`);return r.json();}).then(data=>{catalog=data;$('#map-count').textContent=(data.summary.mapFileEntries||0).toLocaleString();$('#char-count').textContent=(data.summary.characterFilenamePairs||0).toLocaleString();$('#coverage').textContent=`출처: ${data.source.path}\nSHA-256: ${data.source.sha256}\n${(data.limitations||[]).join(' ')}`;renderCatalog();message('원본 명세 목록을 읽었습니다. 3D 변환 상태와 전체 수록 범위는 별도 확인이 필요합니다.');}).catch(e=>{$('#coverage').textContent=e.message;message(`목록을 불러올 수 없습니다: ${e.message}`,true);});
fetch('/overlord/maps/index.json').then(r=>{if(!r.ok)throw Error('해석한 맵 목록 대기');return r.json();}).then(data=>{mapIndex=data;renderCatalog();}).catch(()=>{});
fetch('/overlord/scenes/manifest.json').then(r=>{if(!r.ok)throw Error('장면 변환 목록 대기');return r.json();}).then(data=>{sceneIndex=data;renderCatalog();if(mode==='map'&&!content.children.length&&!source&&data.scenes?.length){const first=data.scenes.find(s=>s.id==='scene_baihua')||data.scenes[0];source=first;renderCatalog();loadRemoteAsset(first);}}).catch(()=>{});
fetch('/overlord/assets/characters/manifest.json').then(r=>{if(!r.ok)throw Error('캐릭터 변환 목록 대기');return r.json();}).then(data=>{characterIndex=data;renderCatalog();}).catch(()=>{});
fetch('/overlord/maps/point-types.json').then(r=>r.json()).then(data=>{pointTypes=data.types||{};}).catch(()=>{});

function dispose(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}
function stop(){playing=false;queueIndex=-1;if(action)action.paused=true;$('#play').textContent='▶ 재생';}
function clearScene(){equippedWeapons=[];sourceCombat=null;sourcePlayingCombo=null;sourceQueue=[];$('#source-combat').hidden=true;clipMetadata=null;stop();if(mixer){mixer.stopAllAction();mixer.uncacheRoot(content);}mixer=null;action=null;clips=[];queue=[];selected=null;for(const root of [...content.children]){content.remove(root);dispose(root);}$('#empty').hidden=false;$('#asset-status').textContent='미가져오기';$('#object-editor').hidden=true;$('#area-legend').hidden=true;refreshClips();refreshObjects();setMode(mode);}
$('#clear').onclick=()=>{++loadGeneration;clearScene();$('#busy').hidden=true;message('작업 장면을 비웠습니다.');};
function visibleBounds(){content.updateMatrixWorld(true);const box=new THREE.Box3();content.traverseVisible(o=>{if(!o.isMesh)return;if(o.skeleton)o.skeleton.update();if(o.isSkinnedMesh)o.boundingBox=null;const local=new THREE.Box3().setFromObject(o);box.union(local);});return box;}
function fit(top=false){const box=visibleBounds();if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const radius=Math.max(size.length()/2,.1);const distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.15;controls.target.copy(center);camera.near=Math.max(.001,radius/10000);camera.far=Math.max(1000,radius*100);camera.updateProjectionMatrix();camera.position.copy(center).add(new THREE.Vector3(top?0:1,top?1:.7,top?.0001:1).normalize().multiplyScalar(distance));controls.update();grid.position.set(center.x,box.min.y,center.z);axes.position.set(center.x,box.min.y,center.z);grid.scale.setScalar(Math.max(1,Math.max(size.x,size.z)/25));}
$('#fit').onclick=()=>fit();$('#top').onclick=()=>fit(true);$('#perspective').onclick=()=>fit();$('#grid-toggle').onclick=()=>{grid.visible=!grid.visible;axes.visible=grid.visible;$('#grid-toggle').textContent=`격자 ${grid.visible?'켜짐':'꺼짐'}`;};
function applyWire(){content.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if('wireframe'in m)m.wireframe=wire;});}
$('#wire').onclick=()=>{wire=!wire;applyWire();$('#wire').textContent=`와이어 ${wire?'켜짐':'꺼짐'}`;};
function install(root,newClips,label){clearScene();content.add(root);root.traverse(o=>{o.userData.labLayer??=(/^sky(?:box|dome)?[_\s]/i.test(o.name)?'sky':/(?:^|_)collider(?:_|$)|^ColliderBox/i.test(o.name)?'debug':o.isMesh?'components':'');o.userData.labVisible??=(o.visible&&o.userData.active!==false&&o.userData.rendererEnabled!==false);});clips=newClips;mixer=new THREE.AnimationMixer(content);mixer.addEventListener('finished',()=>{if(sourcePlayingCombo){if(sourceQueue.length){playSourceCombo(sourceQueue.shift());return;}stop();return;}if(queueIndex>=0){queueIndex++;if(queueIndex<queue.length){selectClip(queue[queueIndex],true,true);return;}}stop();});$('#empty').hidden=true;$('#asset-status').textContent='실제 3D 가져옴';$('#asset-status').title=label;refreshObjects();refreshClips();applyLayers();applyWire();fit();setMode(mode);message(`${label} · ${clips.length}개 실제 애니메이션 클립을 읽었습니다.`);}
async function fetchJson(url){const r=await fetch(url);if(!r.ok)throw Error(`리소스 HTTP ${r.status}: ${url}`);return r.json();}
function nearestIndex(values,value){let lo=0,hi=values.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(values[mid]<value)lo=mid+1;else hi=mid;}return lo>0&&Math.abs(values[lo-1]-value)<Math.abs(values[lo]-value)?lo-1:lo;}
function regionMesh(area,terrain){const mesh=terrainMesh(terrain),colors=new Float32Array(terrain.cols*terrain.rows*3),palette=[new THREE.Color('#7f8791'),new THREE.Color('#318dde'),new THREE.Color('#52b96d'),new THREE.Color('#dc5252')];for(let x=0;x<terrain.cols;x++)for(let z=0;z<terrain.rows;z++){const ax=nearestIndex(area.xCoords,terrain.xCoords[x]),az=nearestIndex(area.zCoords,terrain.zCoords[z]),code=area.codes[ax*area.rows+az],i=x*terrain.rows+z;const color=palette[code]||new THREE.Color().setHSL((Math.abs(code)*.17)%1,.65,.55);colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;}mesh.material.dispose();mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));mesh.material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});mesh.name=`${area.id} · 원시 영역 코드`;mesh.userData={labLayer:'regions',source:area.source,codeCounts:area.codeCounts,coverage:area.coverage,representation:'raw-region-codes-projected-to-nearest-height-grid'};mesh.renderOrder=3;return mesh;}
async function loadArea(row){const generation=++loadGeneration;$('#busy').hidden=false;const root=new THREE.Group();root.name=`${row.id} · 영역 코드`;try{const terrainEntry=mapIndex.terrains.find(t=>t.id===row.terrainId);if(!terrainEntry)throw Error('대응 높이 격자를 찾을 수 없습니다.');const [area,terrain]=await Promise.all([fetchJson(row.url),fetchJson(terrainEntry.url)]);root.add(terrainMesh(terrain),regionMesh(area,terrain));if(generation!==loadGeneration){dispose(root);return;}layerVisibility.regions=true;document.querySelector('[data-layer="regions"]').checked=true;install(root,[],String(row.id));source=row;$('#area-legend').hidden=false;$('#asset-status').textContent='원시 영역 코드';$('#selected-source').replaceChildren();for(const text of [`영역: ${row.id}`,`지형: ${row.terrainId}`,`원시 코드 개수: ${JSON.stringify(row.codeCounts)}`,`출처: ${row.source?.path}`,`SHA-256: ${row.source?.sha256}`])$('#selected-source').append(safeText(document.createElement('div'),text));message(`${row.id} · 원본 영역 코드 표시. 게임에서의 의미는 미확정이며 높이 격자에 최근접 투영했습니다.`);}catch(e){dispose(root);message(`영역 코드 열기 실패: ${e.message}`,true);}finally{if(generation===loadGeneration)$('#busy').hidden=true;}}
async function loadRemoteAsset(row){const generation=++loadGeneration;$('#busy').hidden=false;try{const gltf=await new GLTFLoader().loadAsync(row.url);if(generation!==loadGeneration){dispose(gltf.scene);return;}gltf.scene.traverse(o=>{if(!o.isMesh)return;let ancestor=o,layer='props';while(ancestor){if(/^sky(?:box|dome)?[_\s]/i.test(ancestor.name)){layer='sky';break;}if(/(?:^|_)collider(?:_|$)|^ColliderBox/i.test(ancestor.name)){layer='debug';break;}if(/terrain/i.test(ancestor.name))layer='terrain';ancestor=ancestor.parent;}o.userData.labLayer=layer;o.userData.labLayerBasis='source-node-name-visual-grouping';});install(gltf.scene,gltf.animations,row.name||row.id);source=row;$('#asset-status').textContent='원작 장면 변환';$('#selected-source').replaceChildren();for(const text of [`장면: ${mapNames[row.id]||row.id}`,`원본: ${row.sourceBundle}`,`노드 ${row.nodes} · 메시 인스턴스 ${row.meshInstances}`,`누락 의존성: ${row.missingDependencies?.length||0} · 변환 경고: ${row.errors?.length||0}`,...(row.limitations||[])])$('#selected-source').append(safeText(document.createElement('div'),text));message(`${mapNames[row.id]||row.id} · 원작 장면 ${row.meshInstances}개 메시 인스턴스 표시. ${row.missingDependencies?.length||0}개 의존성 누락.`);}catch(e){message(`원작 장면 열기 실패: ${e.message}`,true);}finally{if(generation===loadGeneration)$('#busy').hidden=true;}}
let equippedWeapons=[];
let weaponManifest;
$('#show-weapon').onchange=()=>{
  for(const object of equippedWeapons)object.visible=object.userData.labVisible=$('#show-weapon').checked;
};
async function equipWeapons(id,root,generation){
  $('#weapon-info').textContent=' · 불러오는 중';
  try{
    weaponManifest??=await fetchJson('/overlord/assets/weapons/manifest.json');
    for(const slot of weaponManifest[id]||[]){
      const side=slot.anchor==='weaponNodeLeft'?'L':'R';
      const anchor=root.getObjectByName(slot.anchor)||root.getObjectByName('bone_RF_'+side+'_Weapon');
      if(!anchor)continue;
      const weapon=(await new GLTFLoader().loadAsync(slot.url)).scene;
      if(generation!==loadGeneration){dispose(weapon);return;}
      anchor.add(weapon);
      equippedWeapons.push(weapon);
      weapon.visible=weapon.userData.labVisible=$('#show-weapon').checked;
    }
    if(generation===loadGeneration)$('#weapon-info').textContent=equippedWeapons.length?' · 장착됨':' · 장착 가능한 모델 없음';
  }catch(error){if(generation===loadGeneration)$('#weapon-info').textContent=' · 무기 로딩 실패: '+error.message;}
}
async function loadCharacter(row){const generation=++loadGeneration;$('#busy').hidden=false;try{const [gltf,report]=await Promise.all([new GLTFLoader().loadAsync(row.url),row.reportUrl?fetchJson(row.reportUrl):Promise.resolve({})]);if(generation!==loadGeneration){dispose(gltf.scene);return;}install(gltf.scene,gltf.animations,row.id);clipMetadata=report;selectClip($('#clip').value,false);source=row;applyCombat(row.id);equipWeapons(row.id,gltf.scene,generation);$('#asset-status').textContent='원작 스킨·클립 변환';$('#selected-source').replaceChildren();for(const text of [`장수: ${generalNames[row.id]||row.id} (${row.id})`,`모델: ${report.modelBundle||row.modelBundle||'원작 변환 모델'}`,`동작: ${report.animationBundles?.join(', ')||report.animationBundle||'원작 변환 클립'}`,`${report.bones||'—'} 본 · ${gltf.animations.length}개 실제 클립`,`텍스처 연결: ${({'source-material-pointer':'원본 재질 포인터','inferred-exact-normalized-mesh-name':'정규화 파일명 일치 추론','missing':'누락 · 기본 재질 표시'})[report.textureAssociation?.kind]||'보고서 확인'}`,...(report.limitations||[])])$('#selected-source').append(safeText(document.createElement('div'),text));message(`${row.id} · 원작 모델과 ${gltf.animations.length}개 변환 클립. 공격·스킬 슬롯은 클립을 확인한 뒤 연결하세요.`);}catch(e){message(`캐릭터 열기 실패: ${e.message}`,true);}finally{if(generation===loadGeneration)$('#busy').hidden=true;}}
function terrainMesh(data){const {cols,rows,heights,bounds,xCoords,zCoords}=data;if(!cols||!rows||cols*rows!==heights.length)throw Error('지형 격자 크기가 일치하지 않습니다.');const positions=new Float32Array(cols*rows*3),indices=[];for(let x=0;x<cols;x++)for(let z=0;z<rows;z++){const i=x*rows+z;positions[i*3]=xCoords?.[x]??(bounds.xMin+x*.5);positions[i*3+1]=heights[i]??0;positions[i*3+2]=zCoords?.[z]??(bounds.zMin+z*.5);if(x<cols-1&&z<rows-1){const a=i,b=i+rows,c=i+1,d=i+rows+1;if([a,b,c].every(j=>heights[j]!=null))indices.push(a,c,b);if([b,c,d].every(j=>heights[j]!=null))indices.push(b,c,d);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const validBounds=new THREE.Box3();for(let i=0;i<heights.length;i++)if(heights[i]!=null)validBounds.expandByPoint(new THREE.Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]));g.boundingBox=validBounds;g.boundingSphere=new THREE.Sphere();validBounds.getBoundingSphere(g.boundingSphere);const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x77836e,roughness:.95,metalness:0,side:THREE.DoubleSide}));mesh.name=`${data.id} · 해석 지형 높이`;mesh.userData.labLayer='terrain';mesh.userData.source=data.source;mesh.userData.coverage=data.coverage;return mesh;}
async function loadMap(row){const generation=++loadGeneration;$('#busy').hidden=false;const root=new THREE.Group();root.name=String(row.id);root.userData.labLayer='';try{const data=await fetchJson(row.url);const itemGroup=new THREE.Group();itemGroup.name='원본 좌표 배치 · 참조 마커';itemGroup.userData.labLayer='';const palette=[0x82bdcb,0xd3ab6a,0xa994c8,0xe28d83,0x9bc795,0xc4bc7e];for(const item of data.items||[]){const radius=THREE.MathUtils.clamp(Number(item.radius)||.6,.3,3),geometry=new THREE.ConeGeometry(radius,Math.max(.7,radius*1.8),5),material=new THREE.MeshStandardMaterial({color:palette[Math.abs(Number(item.pointType)||0)%palette.length],roughness:.8});const marker=new THREE.Mesh(geometry,material);marker.name=`${pointTypes[String(item.pointType)]||'타입 '+item.pointType} · ID ${item.id} · Lv ${item.level}`;const p=item.position||{};marker.position.set(p.x||0,p.y||0,p.z||0);const rotation=item.rotation;if(rotation&&typeof rotation==='object')marker.rotation.set(THREE.MathUtils.degToRad(rotation.x||0),THREE.MathUtils.degToRad(rotation.y||0),THREE.MathUtils.degToRad(rotation.z||0));marker.userData={labLayer:'components',pointType:item.pointType,originalItem:item,representation:'reference-marker-not-original-mesh'};itemGroup.add(marker);}root.add(itemGroup);let terrainNote='지형 연결 없음';if(row.terrainId){const terrain=mapIndex.terrains?.find(t=>t.id===row.terrainId);if(terrain){try{const terrainData=await fetchJson(terrain.url);root.add(terrainMesh(terrainData));const area=mapIndex.areas?.find(a=>a.id===terrain.areaId);if(area)root.add(regionMesh(await fetchJson(area.url),terrainData));terrainNote='해석 지형 포함 · 장면 연결 후보';}catch(e){terrainNote=`지형 읽기 실패: ${e.message}`;}}}if(generation!==loadGeneration){dispose(root);return;}install(root,[],String(row.id));source=row;$('#area-legend').hidden=!root.children.some(o=>o.userData.labLayer==='regions');$('#asset-status').textContent='원본 배치 해석';message(`${row.id} · ${data.items?.length||0}개 원본 좌표 마커 · ${terrainNote}. 마커는 원작 지물 메시가 아닙니다.`);}catch(e){dispose(root);message(`맵 읽기 실패: ${e.message}`,true);}finally{if(generation===loadGeneration)$('#busy').hidden=true;}}
function refreshObjects(){const box=$('#objects');box.replaceChildren();const query=$('#object-search').value.trim().toLowerCase();let count=0,shown=0;function add(o,depth){count++;if(name(o).toLowerCase().includes(query)&&shown<300){shown++;const b=document.createElement('button');b.style.paddingLeft=String(7+Math.min(depth,12)*10)+'px';b.textContent=(o.isMesh?'◇ ':o.isBone?'⌁ ':'▸ ')+name(o);b.classList.toggle('active',selected===o);b.onclick=()=>selectObject(o);box.append(b);}o.children.forEach(c=>add(c,depth+1));}content.children.forEach(o=>add(o,0));$('#object-count').textContent=count.toLocaleString();if(shown===300)box.append(safeText(document.createElement('p'),'앞 300개 표시 · 검색으로 오브젝트를 찾으세요.'));}
$('#object-search').oninput=refreshObjects;
function selectObject(o){selected=o;$('#object-editor').hidden=false;$('#object-name').textContent=name(o);$('#object-layer').value=o.userData.labLayer||'';$('#object-visible').checked=o.userData.labVisible!==false;for(const input of document.querySelectorAll('[data-transform]')){const[k,a]=input.dataset.transform;input.value=(k==='p'?o.position[a]:k==='r'?THREE.MathUtils.radToDeg(o.rotation[a]):o.scale[a]).toFixed(3);}refreshObjects();}
function applyLayers(){content.traverse(o=>{if(o===content)return;o.visible=o.userData.labVisible!==false&&(o.userData.labLayer?layerVisibility[o.userData.labLayer]:true);});}
document.querySelectorAll('[data-layer]').forEach(input=>input.onchange=()=>{layerVisibility[input.dataset.layer]=input.checked;applyLayers();});
$('#object-layer').onchange=e=>{if(selected){selected.userData.labLayer=e.target.value;applyLayers();}};$('#object-visible').onchange=e=>{if(selected){selected.userData.labVisible=e.target.checked;applyLayers();}};
document.querySelectorAll('[data-transform]').forEach(input=>input.onchange=()=>{if(!selected)return;const value=Number(input.value);if(!Number.isFinite(value))return;const[k,a]=input.dataset.transform;const target=k==='p'?selected.position:k==='r'?selected.rotation:selected.scale;target[a]=k==='r'?THREE.MathUtils.degToRad(value):value;});
async function loadFiles(files){if(!files.length)return;const main=files.find(f=>/\.(glb|gltf)$/i.test(f.name));if(!main){message('GLB 또는 glTF 파일을 함께 선택하세요.',true);return;}const generation=++loadGeneration;$('#busy').hidden=false;const urls=[],manager=new THREE.LoadingManager(),lookup=new Map();for(const file of files){const url=URL.createObjectURL(file);urls.push(url);lookup.set((file.webkitRelativePath||file.name).replace(/\\/g,'/'),url);lookup.set(file.name,url);}manager.setURLModifier(url=>{if(url.startsWith('data:')||url.startsWith('blob:'))return url;const decoded=decodeURIComponent(url).replace(/\\/g,'/').replace(/^\.\//,'');const found=lookup.get(decoded)||lookup.get(decoded.split('/').pop());if(!found)throw Error(`동반 파일을 찾을 수 없습니다: ${decoded}`);return found;});try{const data=await main.arrayBuffer();const gltf=await new GLTFLoader(manager).parseAsync(/\.gltf$/i.test(main.name)?new TextDecoder().decode(data):data,'');if(generation!==loadGeneration){dispose(gltf.scene);return;}install(gltf.scene,gltf.animations,main.name);}catch(e){message(`가져오기 실패: ${e.message}`,true);}finally{urls.forEach(url=>URL.revokeObjectURL(url));if(generation===loadGeneration)$('#busy').hidden=true;}}
$('#model-files').onchange=e=>{loadFiles([...e.target.files]);e.target.value='';};
canvas.addEventListener('dragover',e=>e.preventDefault());canvas.addEventListener('drop',e=>{e.preventDefault();loadFiles([...e.dataTransfer.files]);});

function motionInfo(name=''){
  const match=name.match(/^(?:[^_]+_)?(attack|skill)(\d+)(?:_(.+))?$/i);
  if(!match)return {group:4,number:0,label:name||'이름 없음'};
  const attack=match[1].toLowerCase()==='attack',number=Number(match[2]),variant=match[3];
  let label=attack?`기본 공격 ${number}타`:`스킬 ${number}`;
  if(variant)label+=' · '+({zhongji:'강공격',start:'시작',end:'마무리',loop:'반복'}[variant]||variant);
  return {group:(variant?2:0)+(attack?0:1),number,label};
}
function clipOptions(select,empty='클립 없음'){
  select.replaceChildren();
  if(!clips.length){select.add(new Option(empty,''));select.disabled=true;return;}
  const entries=clips.map((clip,index)=>({clip,index,...motionInfo(clip.name)}));
  entries.sort((a,b)=>a.group-b.group||a.number-b.number||a.index-b.index);
  for(const {clip,index,label} of entries){
    const option=new Option(`${label} · ${clip.duration.toFixed(2)}초`,String(index));
    option.title=clip.name;select.add(option);
  }
  select.disabled=false;
}
function showComboPaths(data){
  const panel=$('#combo-paths');panel.replaceChildren();
  const rows=data.combos.filter(row=>row.clipName&&/^(A+|A*B)$/.test(row.inputSequence));
  for(const [heading,items] of [['기본 공격 연계',rows.filter(r=>r.key==='A')],['스킬 분기',rows.filter(r=>r.key==='B')]]){
    if(!items.length)continue;
    panel.append(safeText(document.createElement('h3'),heading));
    for(const row of items.sort((a,b)=>a.inputSequence.length-b.inputSequence.length)){
      const path=findSourcePath(data.combos,row.id);
      const button=document.createElement('button');
      button.textContent=motionInfo(row.clipName).label;
      if(row.key==='B')button.textContent+=' ('+row.inputSequence.split('').join('→')+')';
      button.title='이 단계까지 연속 재생';
      button.disabled=!path.length||path.some(c=>!c.clipName||resolveClip(clips,data.resourceId,c.clipName)==null);
      button.onclick=()=>{sourceQueue=path.slice(1);playSourceCombo(path[0]);};
      panel.append(button);
    }
  }
}
function refreshClips(){clipOptions($('#clip'));clipOptions($('#combo-clip'));for(const input of document.querySelectorAll('[data-binding]')){clipOptions(input);input.insertBefore(new Option('연결 안 함',''),input.firstChild);input.value='';bindings[input.dataset.binding]='';}for(const id of ['play','step','scrub','queue-add'])$('#'+id).disabled=!clips.length;renderQueue();if(clips.length){const idle=clips.findIndex(c=>/(?:^|_)idle$/i.test(c.name));selectClip(idle>=0?idle:0,false);}else{$('#scrub').value=0;$('#time').textContent='0.00 / 0.00s';$('#clip-info').textContent='실제 애니메이션 클립이 없습니다.';}}
function selectClip(index,autoplay=false,inQueue=false,preserveSource=false){if(!preserveSource){sourcePlayingCombo=null;sourceQueue=[];}const clip=clips[Number(index)];if(!clip||!mixer)return;if(!inQueue)queueIndex=-1;mixer.stopAllAction();action=mixer.clipAction(clip);action.reset();action.clampWhenFinished=true;action.setLoop(inQueue||!$('#loop').checked?THREE.LoopOnce:THREE.LoopRepeat,inQueue||!$('#loop').checked?1:Infinity);action.play();playing=autoplay;action.paused=!autoplay;$('#clip').value=String(index);$('#play').textContent=autoplay?'Ⅱ 일시정지':'▶ 재생';mixer.update(0);$('#scrub').value=0;$('#clip-info').textContent=`${motionInfo(clip.name).label} · ${clip.duration.toFixed(3)}초 · ${clip.tracks.length.toLocaleString()} 트랙. 원작 공격·스킬 구분은 별도 매핑 검증이 필요합니다.`;const metadata=clipMetadata?.clips?.find(c=>c.name===clip.name);if(metadata)$('#clip-info').textContent+=` 원본 샘플링 ${metadata.sourceSampleRate||'—'} FPS → 변환 ${metadata.exportSampleRate||'—'} FPS. 미포함 바인딩 ${Array.isArray(metadata.unexportedBindings)?metadata.unexportedBindings.length:metadata.unexportedBindings||0}개.`;}
$('#clip').onchange=e=>selectClip(e.target.value,playing);$('#play').onclick=()=>{if(!action)return;queueIndex=-1;if(action.time>=action.getClip().duration)action.reset().play();playing=!playing;action.paused=!playing;$('#play').textContent=playing?'Ⅱ 일시정지':'▶ 재생';};
$('#loop').onchange=()=>{if(action)action.setLoop($('#loop').checked?THREE.LoopRepeat:THREE.LoopOnce,$('#loop').checked?Infinity:1);};
function seek(t){if(!action||!mixer)return;stop();action.enabled=true;action.time=THREE.MathUtils.clamp(t,0,action.getClip().duration);mixer.update(0);}
$('#scrub').oninput=e=>seek(Number(e.target.value)*action.getClip().duration);$('#step').onclick=()=>seek(action.time+1/30);
document.querySelectorAll('[data-binding]').forEach(input=>input.onchange=()=>{bindings[input.dataset.binding]=input.value;bindingOrigins[input.dataset.binding]='manual';input.title='사용자 지정 클립';});
function invokeAction(key){if(bindingOrigins[key]==='source'&&sourceCombat&&$('#source-chain').checked){invokeSourceAction(key);return;}const index=bindings[key];if(index===''){message('해당 동작에 실제 클립을 먼저 연결하세요.');return;}selectClip(index,true);}

async function applyCombat(resourceId){
  const expectedSource=source;
  try{
    combatIndex??=await fetchJson('/overlord/combat/index.json');
    if(source!==expectedSource)return;
    const data=combatIndex.characters?.find(c=>c.resourceId===resourceId);
    if(!data)return;
    sourceCombat=data;showComboPaths(data);
    $('#source-combat').hidden=false;
    $('#source-combat-summary').textContent='J: A 공격 연계 · U: B 차지 · O: A→B 차지 경로. 클립 확인용이며 원작의 해금·판정·입력 시간을 시뮬레이션하지 않습니다.';
    for(const key of Object.keys(bindings)){
      const binding=data.bindings?.[key];
      const index=binding?resolveClip(clips,resourceId,binding.clipName||binding.animationName):null;
      bindings[key]=index==null?'':String(index);
      bindingOrigins[key]=index==null?'manual':'source';
      const input=$('#bind-'+key);input.value=bindings[key];input.title=binding?.label||'사용자 지정 클립';
    }
    $('#source-sequence').textContent='연계 대기';
  }catch(error){message('기본 클립 재생 가능 · 원작 연결 목록을 읽지 못했습니다: '+error.message,true);}
}

function playSourceCombo(combo){
  const index=resolveClip(clips,sourceCombat.resourceId,combo.clipName||combo.animationName);
  if(index==null){sourceQueue=[];message('대응하는 클립이 없어 이 연계를 재생할 수 없습니다.',true);return;}
  sourcePlayingCombo=combo;
  selectClip(index,true,true,true);
  action.setLoop(THREE.LoopOnce,1);
  $('#source-sequence').textContent=`${combo.inputSequence||combo.key} · ${motionInfo(clips[index].name).label}`;
}

function invokeSourceAction(key){
  const binding=sourceCombat.bindings?.[key];
  if(!binding){message('원작 연결이 없는 동작입니다. 클립을 직접 선택하세요.');return;}
  const combos=sourceCombat.combos||[];
  let target=combos.find(c=>c.id===binding.id);
  if(key==='attack'&&sourcePlayingCombo){
    target=combos.find(c=>(sourcePlayingCombo.nextIds||[]).includes(c.id)&&c.key==='A'&&c.clipName)||target;
  }
  if(!target)return;
  if(key==='attack'&&sourcePlayingCombo){sourceQueue=[];playSourceCombo(target);return;}
  const path=findSourcePath(combos,target.id);
  const playable=(path.length?path:[target]).filter(c=>resolveClip(clips,sourceCombat.resourceId,c.clipName||c.animationName)!=null);
  sourceQueue=playable.slice(1);
  if(playable.length)playSourceCombo(playable[0]);
}

$('#source-reset').onclick=()=>{sourcePlayingCombo=null;sourceQueue=[];stop();$('#source-sequence').textContent='연계 대기';};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>invokeAction(b.dataset.action));
addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||mode!=='motion')return;const key={KeyJ:'attack',KeyU:'skill1',KeyO:'skill2'}[e.code];if(key){e.preventDefault();invokeAction(key);}});
function renderQueue(){const target=$('#queue');target.replaceChildren();queue.forEach((index,i)=>{const b=document.createElement('button');b.textContent=`${i+1}. ${motionInfo(clips[index]?.name).label}`;b.title='누르면 순서에서 제거';b.onclick=()=>{stop();queue.splice(i,1);renderQueue();};target.append(b);});$('#queue-play').disabled=!queue.length;}
$('#queue-add').onclick=()=>{if(clips.length){queue.push(Number($('#combo-clip').value));renderQueue();}};$('#queue-clear').onclick=()=>{stop();queue=[];renderQueue();};$('#queue-play').onclick=()=>{queueIndex=0;selectClip(queue[0],true,true);};
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-scene').onclick=()=>{if(!content.children.length){message('저장할 장면을 먼저 가져오세요.');return;}try{download({format:'overlord-lab-scene',version:1,source,scene:content.toJSON(),clips:clips.map(c=>THREE.AnimationClip.toJSON(c)),bindings,queue,layerVisibility},'overlord-scene.json');message('현재 장면과 클립을 JSON으로 저장했습니다.');}catch(e){message(`장면 저장 실패: ${e.message}`,true);}};
$('#import-scene').onclick=()=>$('#scene-file').click();$('#scene-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const generation=++loadGeneration;$('#busy').hidden=false;try{const data=JSON.parse(await file.text());if(data.format!=='overlord-lab-scene'||data.version!==1||!data.scene)throw Error('연구실에서 저장한 버전 1 장면 JSON이 아닙니다.');const root=await new THREE.ObjectLoader().parseAsync(data.scene);const parsedClips=(data.clips||[]).map(THREE.AnimationClip.parse);if(generation!==loadGeneration){dispose(root);return;}install(root,parsedClips,file.name);source=data.source||null;$('#selected-source').textContent='저장한 작업 장면 · '+(source?.id||source?.resourceId||source?.sourceBundle||file.name);for(const key of Object.keys(layerVisibility)){layerVisibility[key]=data.layerVisibility?.[key]??layerVisibility[key];document.querySelector(`[data-layer="${key}"]`).checked=layerVisibility[key];}for(const key of Object.keys(bindings)){const value=data.bindings?.[key];bindings[key]=value!==''&&Number.isInteger(Number(value))&&clips[Number(value)]?String(value):'';$('#bind-'+key).value=bindings[key];}queue=(data.queue||[]).filter(i=>Number.isInteger(i)&&clips[i]);renderQueue();applyLayers();}catch(err){message(`장면 열기 실패: ${err.message}`,true);}finally{if(generation===loadGeneration)$('#busy').hidden=true;e.target.value='';}};
const observer=new ResizeObserver(()=>{const rect=canvas.parentElement.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(rect.height,1);camera.updateProjectionMatrix();});observer.observe(canvas.parentElement);
let previous=performance.now();function frame(now){const dt=Math.min((now-previous)/1000,.1);previous=now;if(mixer&&playing)mixer.update(dt*Number($('#speed').value));if(action){const duration=action.getClip().duration;$('#scrub').value=duration?action.time/duration:0;$('#time').textContent=`${action.time.toFixed(2)} / ${duration.toFixed(2)}s`;}controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);
