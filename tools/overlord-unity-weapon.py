"""Export one exact source weapon prefab; association is supplied from decoded tables."""
import argparse,bisect,hashlib,importlib.util,io,json,math,pathlib,zlib
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from overlord_database import Database,ROOT
spec=importlib.util.spec_from_file_location('motion_export',ROOT/'tools/overlord-unity-motion.py');motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(motion)

def export_weapon(db,prefab,output,character=None):
    key=next(k for k,v in db.assets.items() if v.lower()==prefab.lower())
    bundle_ids=db.asset_deps[key];bundle_names=[db.bundles[k] for k in bundle_ids]
    names=list(dict.fromkeys(n for bundle in bundle_names for n in db.dependencies(bundle)))
    env=UnityPy.Environment()
    for name in names:env.load_file(db.bytes(name),name=name)
    roots=[]
    for obj in env.objects:
        if obj.type.name!='AssetBundle':continue
        for path,info in obj.read().m_Container:
            if path.lower()==prefab.lower():roots.append(info.asset)
    if len(roots)!=1:raise ValueError(f'Expected one exact source prefab container root, got {len(roots)}')
    root=roots[0].read();root_transform=next(pair.component for pair in root.m_Component if pair.component.type.name=='Transform')
    glb=motion.GLB();mesh_count=0;skipped=[];node_ids={};pending_skins=[];paths={}
    def walk(ptr,path=''):
        nonlocal mesh_count
        t=ptr.read();go=t.m_GameObject.read();p=t.m_LocalPosition;q=t.m_LocalRotation;s=t.m_LocalScale;idx=len(glb.doc['nodes']);node_ids[ptr.m_PathID]=idx;node={'name':go.m_Name,'translation':[-p.x,p.y,p.z],'rotation':[q.x,-q.y,-q.z,q.w],'scale':[s.x,s.y,s.z]};glb.doc['nodes'].append(node)
        paths[zlib.crc32(path.encode())]=idx
        comps={pair.component.type.name:pair.component for pair in go.m_Component}
        skin_renderer=comps['SkinnedMeshRenderer'].read() if 'SkinnedMeshRenderer' in comps else None
        if 'MeshFilter' in comps or skin_renderer:
            mesh=(skin_renderer.m_Mesh if skin_renderer else comps['MeshFilter'].read().m_Mesh).read();h=MeshHandler(mesh);h.process();attrs={'POSITION':glb.array([(-v[0],v[1],v[2]) for v in h.m_Vertices],3,bounds=True)}
            if h.m_Normals:attrs['NORMAL']=glb.array([(-v[0],v[1],v[2]) for v in h.m_Normals],3)
            if h.m_UV0:attrs['TEXCOORD_0']=glb.array([(v[0],1-v[1]) for v in h.m_UV0],2)
            if skin_renderer and h.m_BoneIndices is not None and h.m_BoneWeights is not None:
                attrs['JOINTS_0']=glb.array(h.m_BoneIndices,4,5123);attrs['WEIGHTS_0']=glb.array(h.m_BoneWeights,4);pending_skins.append((idx,skin_renderer,mesh))
            renderer=skin_renderer or (comps['MeshRenderer'].read() if 'MeshRenderer' in comps else None);prims=[]
            for i,tris in enumerate(h.get_triangles()):
                if not tris:continue
                primitive={'attributes':attrs,'indices':glb.array([v for tri in tris for v in [tri[2],tri[1],tri[0]]],1,5125)}
                if renderer and i<len(renderer.m_Materials):
                    mat=renderer.m_Materials[i].read();texenvs=dict(mat.m_SavedProperties.m_TexEnvs)
                    for prop in ['_MainTex','_MainTex1','_BaseMap']:
                        texref=texenvs.get(prop)
                        if not texref or not texref.m_Texture.m_PathID:continue
                        tex=texref.m_Texture.read();png=io.BytesIO();tex.image.save(png,format='PNG');view=glb.raw(png.getvalue());image_id=len(glb.doc['images']);glb.doc['images'].append({'bufferView':view,'mimeType':'image/png'});texture_id=len(glb.doc['textures']);glb.doc['textures'].append({'source':image_id,'sampler':0});primitive['material']=len(glb.doc['materials']);glb.doc['materials'].append({'name':mat.m_Name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':texture_id},'metallicFactor':0,'roughnessFactor':.7}});break
                prims.append(primitive)
            node['mesh']=len(glb.doc['meshes']);glb.doc['meshes'].append({'name':mesh.m_Name,'primitives':prims});mesh_count+=1
        children=[walk(c,path+'/'+c.read().m_GameObject.read().m_Name if path else c.read().m_GameObject.read().m_Name) for c in t.m_Children]
        if children:node['children']=children
        return idx
    glb.doc['scenes'][0]['nodes']=[walk(root_transform)]
    for idx,renderer,mesh in pending_skins:
        matrices=[[getattr(m,f'e{row}{col}')*((-1 if row==0 else 1)*(-1 if col==0 else 1)) for col in range(4) for row in range(4)] for m in mesh.m_BindPose]
        skin={'joints':[node_ids[b.m_PathID] for b in renderer.m_Bones],'inverseBindMatrices':glb.array(matrices,16)};glb.doc['nodes'][idx]['skin']=len(glb.doc['skins']);glb.doc['skins'].append(skin)
    clip_reports=[]
    for obj in env.objects:
        if obj.type.name!='AnimationClip':continue
        source_name=obj.peek_name()
        if not character or not source_name.lower().startswith(character.lower()+'_weapon_'):continue
        d=obj.read_typetree();muscle=d['m_MuscleClip'];data=muscle['m_Clip']['data'];stream=data['m_StreamedClip'];curves=motion.streamed_curves(stream);curve_times={c:[k[0] for k in keys] for c,keys in curves.items()};dense=data['m_DenseClip'];constants=data['m_ConstantClip']['data'];start=muscle['m_StartTime'];duration=muscle['m_StopTime']-start
        times=sorted(set(min(i/30,duration) for i in range(math.ceil(duration*30)+1)));ta=glb.array(times,1,bounds=True);offset=0;samplers=[];channels=[];omitted=[]
        for binding in d['m_ClipBindingConstant']['genericBindings']:
            attr=binding['attribute'];width={1:3,2:4,3:3,4:3}.get(attr,1) if binding['typeID']==4 else 1;node=paths.get(binding['path']);path={1:'translation',2:'rotation',3:'scale'}.get(attr)
            if node is None or path is None or binding['typeID']!=4:omitted.append(binding);offset+=width;continue
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
            si=len(samplers);samplers.append({'input':ta,'output':glb.array(vals,width),'interpolation':'LINEAR'});channels.append({'sampler':si,'target':{'node':node,'path':path}});offset+=width
        if channels:
            glb.doc['animations'].append({'name':source_name,'samplers':samplers,'channels':channels});clip_reports.append({'name':source_name,'duration':duration,'transformTracks':len(channels),'omittedBindings':omitted,'sourcePathId':str(obj.path_id)})
    if not mesh_count:raise ValueError('No rigid source MeshFilter geometry in this weapon prefab')
    output.parent.mkdir(parents=True,exist_ok=True);glb.save(output)
    return {'prefab':prefab,'assetId':str(key),'sourceBundles':names,'sourceBundleSha256':{n:hashlib.sha256(db.bytes(n)).hexdigest() for n in names},'meshInstances':mesh_count,'skins':len(pending_skins),'clips':clip_reports,'skipped':skipped,'limitations':['Weapon-specific source Transform clips sampled at30FPS where exact bone path CRC matches; runtime controller transitions are not reproduced.'],'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--prefab',required=True);ap.add_argument('--output',required=True);ap.add_argument('--character');args=ap.parse_args();output=pathlib.Path(args.output);report=export_weapon(Database(),args.prefab,output,args.character);output.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='clips'}));print('clips',len(report['clips']))
