"""Export source Unity generic skeleton clips to self-contained glTF 2 GLB.

Only exact path-CRC Transform bindings are exported. Animator properties and
unresolved binding paths are recorded, never invented or retargeted.
"""
import argparse, bisect, collections, gc, hashlib, io, json, math, pathlib, struct, zlib
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from overlord_database import Database

ROOT = pathlib.Path(__file__).resolve().parents[1]

class GLB:
    def __init__(self):
        self.data=bytearray()
        self.doc={'asset':{'version':'2.0','generator':'Overlord source inspector / UnityPy'},'buffers':[{'byteLength':0}], 'bufferViews':[], 'accessors':[], 'nodes':[], 'meshes':[], 'skins':[], 'animations':[], 'materials':[], 'textures':[], 'images':[], 'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}], 'scenes':[{'nodes':[]}], 'scene':0}
    def raw(self,b):
        while len(self.data)%4:self.data.append(0)
        offset=len(self.data);self.data.extend(b)
        self.doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(b)})
        return len(self.doc['bufferViews'])-1
    def array(self, values, width, component=5126, bounds=False):
        vals=[x for row in values for x in row] if width>1 else list(values)
        view=self.raw(struct.pack('<'+{5126:'f',5125:'I',5123:'H'}[component]*len(vals),*vals))
        a={'bufferView':view,'componentType':component,'count':len(vals)//width,'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'}[width]}
        if bounds:
            a['min']=[min(vals[i::width]) for i in range(width)];a['max']=[max(vals[i::width]) for i in range(width)]
        self.doc['accessors'].append(a);return len(self.doc['accessors'])-1
    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.data)
        j=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*((-len(j))%4)
        b=bytes(self.data);b+=b'\0'*((-len(b))%4)
        path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)

def streamed_curves(data):
    words=data['data'];raw=struct.pack('<'+'I'*len(words),*words);curves=collections.defaultdict(list);at=0
    while at<len(raw):
        time,count=struct.unpack_from('<fi',raw,at);at+=8
        for _ in range(count):
            index,*coeff=struct.unpack_from('<i4f',raw,at);at+=20
            curves[index].append((time,coeff))
    return curves

def source_texture(objects,renderer,mesh_name):
    """Return explicit material texture; else exact normalized mesh-name match.

    Name matching is an inference and is kept distinct in the artifact report.
    """
    for matref in renderer.get('m_Materials',[]):
        obj=objects.get(matref['m_PathID'])
        if obj is None:continue
        mat=obj.read_typetree()
        for key,val in mat['m_SavedProperties']['m_TexEnvs']:
            tex=objects.get(val['m_Texture']['m_PathID'])
            if key in ['_MainTex','_MainTex1','_BaseMap','_BaseColorMap'] and tex is not None and tex.type.name=='Texture2D':
                return tex,{'kind':'source-material-pointer','material':mat['m_Name'],'property':key,'texture':tex.peek_name(),'texturePathId':str(tex.path_id)}
    normalize=lambda s:s.lower().replace('@','_')
    matches=[o for o in objects.values() if o.type.name=='Texture2D' and normalize(o.peek_name())==normalize(mesh_name)]
    if len(matches)==1:
        tex=matches[0];return tex,{'kind':'inferred-exact-normalized-mesh-name','texture':tex.peek_name(),'texturePathId':str(tex.path_id),'note':'Source renderer material texture was null; association inferred from exact case/@/_ normalized mesh-texture name.'}
    return None,{'kind':'missing','note':'No explicit source diffuse material pointer or unique exact mesh-texture name match.'}

def export_character(db, character, output, clip_filter=None, enrich=False):
    names=set(db.bundles.values()) if isinstance(db.bundles,dict) else set()
    bundle='boss_'+character+'.ezfunab'
    if bundle not in db.ids:bundle='model_'+character+'.ezfunab'
    env=UnityPy.Environment()
    # Load dependencies by CAB identity before resolving renderer references.
    for name in dict.fromkeys([bundle,*db.dependencies(bundle)]):
        try:env.load_file(db.bytes(name),name=name)
        except KeyError:pass
    objects={o.path_id:o for o in env.objects}
    transforms={k:o.read_typetree() for k,o in objects.items() if o.type.name=='Transform'}
    go={k:o.read_typetree() for k,o in objects.items() if o.type.name=='GameObject'}
    tnames={k:go[t['m_GameObject']['m_PathID']]['m_Name'] for k,t in transforms.items()}
    renderers=[o.read_typetree() for o in env.objects if o.type.name=='SkinnedMeshRenderer']
    candidates=[]
    for r in renderers:
        if r['m_Mesh']['m_FileID']!=0:continue
        mesh=objects.get(r['m_Mesh']['m_PathID'])
        if mesh is None:continue
        gid=r['m_GameObject']['m_PathID']; tid=next((k for k,t in transforms.items() if t['m_GameObject']['m_PathID']==gid),None)
        if tid is None:continue
        root=tid
        while transforms[root]['m_Father']['m_PathID'] in transforms:root=transforms[root]['m_Father']['m_PathID']
        candidates.append((r,mesh,tid,root))
    if not candidates:raise ValueError('No self-contained skinned mesh')
    # Prefer base D (high resolution) renderer over M/alternate skins.
    r,mo,mesh_tid,root=min(candidates,key=lambda x:('_01_' not in x[1].peek_name().lower(),not x[1].peek_name().lower().endswith('_d'),x[1].peek_name()))
    glb=GLB();nodeids={};paths={}
    def walk(tid,path):
        t=transforms[tid];idx=len(glb.doc['nodes']);nodeids[tid]=idx;paths[zlib.crc32(path.encode())]=idx
        pos=t['m_LocalPosition'];q=t['m_LocalRotation'];s=t['m_LocalScale']
        glb.doc['nodes'].append({'name':tnames[tid] or 'root','translation':[-pos['x'],pos['y'],pos['z']],'rotation':[q['x'],-q['y'],-q['z'],q['w']],'scale':[s['x'],s['y'],s['z']]})
        children=[]
        for child in t['m_Children']:
            k=child['m_PathID']
            if k not in transforms:continue
            children.append(walk(k,path+'/'+tnames[k] if path else tnames[k]))
        if children:glb.doc['nodes'][idx]['children']=children
        return idx
    glb.doc['scenes'][0]['nodes']=[walk(root,'')]
    mesh=mo.read();h=MeshHandler(mesh);h.process()
    positions=[(-v[0],v[1],v[2]) for v in h.m_Vertices]
    attrs={'POSITION':glb.array(positions,3,bounds=True)}
    if h.m_Normals:attrs['NORMAL']=glb.array([(-v[0],v[1],v[2]) for v in h.m_Normals],3)
    if h.m_UV0:attrs['TEXCOORD_0']=glb.array([(v[0],1-v[1]) for v in h.m_UV0],2)
    if h.m_BoneIndices and h.m_BoneWeights:
        attrs['JOINTS_0']=glb.array(h.m_BoneIndices,4,5123);attrs['WEIGHTS_0']=glb.array(h.m_BoneWeights,4)
    # Unity mesh coordinates mirrored into glTF right-handed coordinates.
    inds=[]
    for group in h.get_triangles():
        for tri in group:inds.extend([tri[2],tri[1],tri[0]])
    primitive={'attributes':attrs,'indices':glb.array(inds,1,5125)}
    tex,texture_association=source_texture(objects,r,mesh.m_Name)
    if tex:
        png=io.BytesIO();tex.read().image.save(png,format='PNG');view=glb.raw(png.getvalue())
        glb.doc['images'].append({'bufferView':view,'mimeType':'image/png'});glb.doc['textures'].append({'source':0,'sampler':0})
        glb.doc['materials'].append({'name':tex.peek_name(),'doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.85}});primitive['material']=0
    glb.doc['meshes']=[{'name':mesh.m_Name,'primitives':[primitive]}];glb.doc['nodes'][nodeids[mesh_tid]]['mesh']=0
    joints=[nodeids[b['m_PathID']] for b in r['m_Bones']]
    binds=[]
    for m in mesh.m_BindPose:
        a=[getattr(m,f'e{row}{col}')*((-1 if row==0 else 1)*(-1 if col==0 else 1)) for col in range(4) for row in range(4)];binds.append(a)
    glb.doc['skins']=[{'joints':joints,'inverseBindMatrices':glb.array(binds,16)}];glb.doc['nodes'][nodeids[mesh_tid]]['skin']=0
    direct_names=[n for n in ['ani_'+character+'.ezfunab','ani_boss_'+character+'.ezfunab'] if n in db.ids]
    animation_names=list(dict.fromkeys([*direct_names,*[dep for n in direct_names for dep in db.dependencies(n)]]))
    animation_objects=[]
    for animation_name in animation_names:
        ae=UnityPy.load(db.bytes(animation_name))
        animation_objects.extend((animation_name,obj) for obj in ae.objects if obj.type.name=='AnimationClip' and (animation_name in direct_names or obj.peek_name().lower().startswith(character.lower()+'_')))
    clip_rows=[];seen_clips=set()
    existing_report=output/(character+'.json');existing_glb=output/(character+'.glb')
    if enrich and existing_report.exists() and existing_glb.exists():
        previous=json.loads(existing_report.read_text(encoding='utf-8'));raw=existing_glb.read_bytes();jlen=struct.unpack_from('<I',raw,12)[0];glb.doc=json.loads(raw[20:20+jlen]);glb.data=bytearray(raw[28+jlen:28+jlen+glb.doc['buffers'][0]['byteLength']]);clip_rows=previous['clips'];seen_clips={c['name'] for c in clip_rows};texture_association=previous.get('textureAssociation',texture_association)
    for animation_name,obj in animation_objects:
        if obj.type.name!='AnimationClip':continue
        if clip_filter and clip_filter not in obj.peek_name():continue
        if obj.peek_name() in seen_clips:continue
        seen_clips.add(obj.peek_name())
        d=obj.read_typetree();muscle=d['m_MuscleClip'];data=muscle['m_Clip']['data'];stream=data['m_StreamedClip'];curves=streamed_curves(stream);dense=data['m_DenseClip'];constants=data['m_ConstantClip']['data']
        curve_times={c:[k[0] for k in keys] for c,keys in curves.items()}
        start=muscle['m_StartTime'];stop=muscle['m_StopTime'];duration=stop-start
        times=[min(i/30,duration) for i in range(math.ceil(duration*30)+1)];times=sorted(set(times));timeaccess=glb.array(times,1,bounds=True)
        samplers=[];channels=[];offset=0;matched=0;unresolved=[]
        for binding in d['m_ClipBindingConstant']['genericBindings']:
            attr=binding['attribute'];width={1:3,2:4,3:3,4:3}.get(attr,1) if binding['typeID']==4 else 1
            node=paths.get(binding['path']);path={1:'translation',2:'rotation',3:'scale'}.get(attr)
            if node is None or path is None or binding['typeID']!=4:
                unresolved.append({'pathHash':binding['path'],'attribute':attr,'typeID':binding['typeID']});offset+=width;continue
            vals=[]
            for t in times:
                values=[]
                for c in range(offset,offset+width):
                    if c<stream['curveCount']:
                        keys=curves[c];ki=max(0,bisect.bisect_right(curve_times[c],t+start)-1);kt,co=keys[ki];dt=max(0,t+start-kt);v=((co[0]*dt+co[1])*dt+co[2])*dt+co[3]
                    elif c<stream['curveCount']+dense['m_CurveCount']:
                        cc=c-stream['curveCount'];frame=min(dense['m_FrameCount']-1,max(0,round((t+start-dense['m_BeginTime'])*dense['m_SampleRate'])));v=dense['m_SampleArray'][frame*dense['m_CurveCount']+cc]
                    else:v=constants[c-stream['curveCount']-dense['m_CurveCount']]
                    values.append(v)
                if path=='translation':values[0]*=-1
                elif path=='rotation':
                    values[1]*=-1;values[2]*=-1;norm=math.sqrt(sum(v*v for v in values));values=[v/norm for v in values] if norm>1e-8 else [0,0,0,1]
                    if vals and sum(a*b for a,b in zip(vals[-1],values))<0:values=[-v for v in values]
                vals.append(values)
            sampler=len(samplers);samplers.append({'input':timeaccess,'output':glb.array(vals,width),'interpolation':'LINEAR'});channels.append({'sampler':sampler,'target':{'node':node,'path':path}});offset+=width;matched+=1
        if channels:glb.doc['animations'].append({'name':d['m_Name'],'samplers':samplers,'channels':channels})
        clip_rows.append({'name':d['m_Name'],'duration':duration,'transformTracks':matched,'unexportedBindings':unresolved,'sourceBundle':animation_name,'sourcePathId':str(obj.path_id),'sourceSampleRate':d['m_SampleRate'],'exportSampleRate':30})
    output.mkdir(parents=True,exist_ok=True);path=output/(character+'.glb');glb.save(path)
    report={'character':character,'modelBundle':bundle,'animationBundles':animation_names,'mesh':mesh.m_Name,'meshPathId':str(mo.path_id),'vertices':len(positions),'triangles':len(inds)//3,'bones':len(joints),'nodes':len(nodeids),'clips':clip_rows,'glb':str(path.relative_to(ROOT)).replace('\\','/'),'glbSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'limitations':['Generic Transform curves sampled at 30 FPS; original clips retained in source APK.','Animator root-motion and float/event curves are listed as unexported; hit timing and skill bindings are not inferred.','One base high-resolution skinned mesh selected per character; alternate costumes and effects are not included.']}
    report['textureAssociation']=texture_association
    report['sourceBundleSha256']={n:hashlib.sha256(db.bytes(n)).hexdigest() for n in [bundle,*animation_names]}
    (output/(character+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--character',default='zhaoyun');ap.add_argument('--clip');ap.add_argument('--all',action='store_true');ap.add_argument('--enrich',action='store_true');args=ap.parse_args();db=Database();output=ROOT/'public/overlord/assets/characters'
    names=set(db.bundles.values())
    ids=sorted({n[5:-8] for n in names if n.startswith('boss_') and n.endswith('.ezfunab') and 'ani_'+n[5:] in names}|({'qilin'} if 'model_qilin.ezfunab' in names else set())) if args.all else [args.character]
    manifest={'schemaVersion':1,'source':'Installed com.emagroups.zs split_asset_pack_1.apk','characters':[],'failures':[],'limitations':['Character IDs derive from shipped bundle names, not an authoritative playable roster.','Exported clip names do not establish skill button assignments or combat timing.']}
    for character in ids:
        try:
            r=export_character(db,character,output,args.clip,args.enrich)
            row={'id':character,'url':f'/overlord/assets/characters/{character}.glb','reportUrl':f'/overlord/assets/characters/{character}.json','clipCount':sum(c['transformTracks']>0 for c in r['clips']),'sourceClipCount':len(r['clips']),'status':'exported','vertices':r['vertices'],'bones':r['bones'],'sha256':r['glbSha256']}
            manifest['characters'].append(row);print(json.dumps(row),flush=True)
        except Exception as ex:
            row={'id':character,'error':type(ex).__name__+': '+str(ex)};manifest['failures'].append(row);print(json.dumps(row),flush=True)
        if args.all:(output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        gc.collect()
