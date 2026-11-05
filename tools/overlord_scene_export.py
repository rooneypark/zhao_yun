"""Export shipped Unity scene transforms and meshes to self-contained GLB.

Unity left-handed coordinates reflect X, including winding and quaternions.
This is static scene geometry; particles, shaders and lightmaps are not simulated.
"""
import argparse, collections, io, json, struct, sys, time
from pathlib import Path
import numpy as np
import UnityPy
from concurrent.futures import ProcessPoolExecutor, as_completed
from UnityPy.helpers.MeshHelper import MeshHandler
from overlord_database import Database, ROOT

class GLB:
    def __init__(self):
        self.data=bytearray()
        self.doc={'asset':{'version':'2.0','generator':'Overlord source scene exporter'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'bufferViews':[],'accessors':[]}
    def view(self, data):
        self.data.extend(b'\0'*(-len(self.data)%4)); start=len(self.data);self.data.extend(data)
        self.doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(data)})
        return len(self.doc['bufferViews'])-1
    def accessor(self, values, typ, indices=False):
        a=np.asarray(values,dtype='<u4' if indices else '<f4');a=np.nan_to_num(a)
        d={'bufferView':self.view(a.tobytes()),'componentType':5125 if indices else 5126,'count':len(a),'type':typ}
        if not indices and typ=='VEC3':d.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
        self.doc['accessors'].append(d);return len(self.doc['accessors'])-1
    def save(self,path):
        self.data.extend(b'\0'*(-len(self.data)%4));self.doc['buffers']=[{'byteLength':len(self.data)}]
        j=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*(-len(j)%4)
        b=struct.pack('<III',0x46546c67,2,28+len(j)+len(self.data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(self.data),0x004e4942)+self.data
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b)

def export_scene(db,bundle,out):
    env=UnityPy.Environment(); missing=[]
    for name in db.dependencies(bundle):
        try: env.load_file(db.bytes(name),name=name)
        except Exception as ex: missing.append({'bundle':name,'error':str(ex)[:180]})
    source=env.files[bundle]; objects=list(source.get_objects());g=GLB();nodes={};transforms={};meshcache={};rawmeshes={};materials={};errors=[];rendered=0;worldcache={}
    def ident(obj):return (obj.assets_file.name,obj.path_id)
    def world(ptr):
        if not ptr.m_PathID:return np.eye(4)
        ob=ptr.deref();key=ident(ob)
        if key in worldcache:return worldcache[key]
        t=ob.read();q=t.m_LocalRotation;x,y,z,w=q.x,q.y,q.z,q.w
        a=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),t.m_LocalPosition.x],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),t.m_LocalPosition.y],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),t.m_LocalPosition.z],[0,0,0,1]],dtype=float)
        a[:3,:3]=a[:3,:3]@np.diag([t.m_LocalScale.x,t.m_LocalScale.y,t.m_LocalScale.z]);a=world(t.m_Father)@a;worldcache[key]=a;return a
    def material(ptr):
        try:
            obj=ptr.read();key=(ptr.m_FileID,ptr.m_PathID,str(ptr.assetsfile.name))
            if key in materials:return materials[key]
            colors=dict(obj.m_SavedProperties.m_Colors);c=colors.get('_Color') or colors.get('_BaseColor')
            rgba=[getattr(c,k) for k in ('r','g','b','a')] if c else [.65,.68,.72,1]
            d={'name':obj.m_Name,'pbrMetallicRoughness':{'baseColorFactor':[max(0,min(1,v)) for v in rgba],'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True}
            # Original diffuse textures only; shader/lightmap reconstruction stays explicit.
            texenvs=dict(obj.m_SavedProperties.m_TexEnvs)
            tex=texenvs.get('_MainTex') or texenvs.get('_BaseMap')
            if tex and tex.m_Texture.m_PathID:
                try:
                    img=tex.m_Texture.read().image; buf=io.BytesIO(); img.save(buf,format='PNG')
                    imgs=g.doc.setdefault('images',[]);idx=len(imgs);imgs.append({'bufferView':g.view(buf.getvalue()),'mimeType':'image/png'})
                    ts=g.doc.setdefault('textures',[]);tid=len(ts);ts.append({'source':idx})
                    d['pbrMetallicRoughness']['baseColorTexture']={'index':tid}
                except Exception:pass
            idx=len(g.doc['materials']);g.doc['materials'].append(d);materials[key]=idx;return idx
        except Exception:return None
    for obj in objects:
        if obj.type.name!='Transform':continue
        try:
            t=obj.read();go=t.m_GameObject.read();p=t.m_LocalPosition;q=t.m_LocalRotation;s=t.m_LocalScale
            idx=len(g.doc['nodes']);nodes[ident(obj)]=idx;transforms[ident(obj)]=(t,go)
            g.doc['nodes'].append({'name':go.m_Name,'translation':[-p.x,p.y,p.z],'rotation':[q.x,-q.y,-q.z,q.w],'scale':[s.x,s.y,s.z],'extras':{'unityPathId':str(obj.path_id),'active':go.m_IsActive,'layer':go.m_Layer,'sourceBundle':bundle}})
        except Exception as ex:errors.append(str(ex)[:180])
    for key,(t,go) in transforms.items():
        idx=nodes[key];node=g.doc['nodes'][idx]
        try:parent=nodes.get(ident(t.m_Father.deref())) if t.m_Father.m_PathID else None
        except Exception:parent=None
        if parent is None:g.doc['scenes'][0]['nodes'].append(idx)
        else:g.doc['nodes'][parent].setdefault('children',[]).append(idx)
        comps={}
        for pair in go.m_Component:
            try:
                ob=pair.component.deref();comps[ob.type.name]=ob.read()
            except Exception:pass
        f=comps.get('MeshFilter');r=comps.get('MeshRenderer')
        if not f:continue
        try:
            if not f.m_Mesh.m_PathID:continue
            meshobj=f.m_Mesh.deref();mk=ident(meshobj);matids=[material(p) for p in r.m_Materials] if r else []
            batch=r.m_StaticBatchInfo if r else None;batched=batch is not None and batch.subMeshCount>0
            cachekey=(mk,tuple(matids),key if batched else None)
            if cachekey not in meshcache:
                if mk not in rawmeshes:
                    m=meshobj.read();h=MeshHandler(m);h.process();rawmeshes[mk]=(m,h,list(h.get_triangles()))
                m,h,alltris=rawmeshes[mk]
                triangles=alltris[batch.firstSubMesh:batch.firstSubMesh+batch.subMeshCount] if batched else alltris
                flat=np.concatenate([np.asarray(a,dtype=np.uint32).reshape(-1) for a in triangles if len(a)])
                used=np.unique(flat);remap=np.zeros(h.m_VertexCount,dtype=np.uint32);remap[used]=np.arange(len(used),dtype=np.uint32)
                v=np.asarray(h.m_Vertices,dtype=np.float32)[used].copy()
                if not len(v):continue
                local=np.eye(4)
                if batched:
                    # Static-batched vertices are in batch-root coordinates, not object-local.
                    transform_ptr=next(p.component for p in go.m_Component if p.component.deref().type.name=='Transform')
                    local=np.linalg.inv(world(transform_ptr))@world(r.m_StaticBatchRoot)
                    v=(np.c_[v,np.ones(len(v))]@local.T)[:,:3]
                v[:,0]*=-1;attrs={'POSITION':g.accessor(v,'VEC3')}
                if h.m_Normals and len(h.m_Normals)==h.m_VertexCount:
                    a=np.asarray(h.m_Normals,dtype=np.float32)[used,:3].copy()@np.linalg.inv(local[:3,:3]);a[:,0]*=-1;a/=np.maximum(np.linalg.norm(a,axis=1,keepdims=True),1e-8);attrs['NORMAL']=g.accessor(a,'VEC3')
                if h.m_UV0 and len(h.m_UV0)==h.m_VertexCount:
                    a=np.asarray(h.m_UV0,dtype=np.float32)[used,:2].copy();a[:,1]=1-a[:,1];attrs['TEXCOORD_0']=g.accessor(a,'VEC2')
                prims=[]
                for si,tris in enumerate(triangles):
                    a=np.asarray(tris,dtype=np.uint32)
                    if not len(a):continue
                    a=remap[a[:,[2,1,0]].reshape(-1)];pr={'attributes':attrs,'indices':g.accessor(a,'SCALAR',True)}
                    if si<len(matids) and matids[si] is not None:pr['material']=matids[si]
                    prims.append(pr)
                mi=len(g.doc['meshes']);g.doc['meshes'].append({'name':m.m_Name,'primitives':prims});meshcache[cachekey]=mi
            node['mesh']=meshcache[cachekey];node['extras']['rendererEnabled']=bool(r.m_Enabled) if r else True;node['extras']['staticBatchRange']=[batch.firstSubMesh,batch.subMeshCount] if batched else None;rendered+=1
        except Exception as ex:errors.append({'object':go.m_Name,'error':str(ex)[:220]})
    name=Path(bundle).stem;path=out/(name+'.glb');g.save(path)
    return {'id':name,'name':name.removeprefix('scene_'),'url':'/overlord/scenes/'+path.name,'sourceBundle':bundle,'nodes':len(nodes),'meshInstances':rendered,'meshes':len(g.doc['meshes']),'bytes':path.stat().st_size,'missingDependencies':missing,'errors':errors,'limitations':['Static mesh geometry and original transforms; Unity particles, custom shaders, lightmaps and logic are not reproduced.','Inactive source objects retained with active metadata.']}

def worker_scene(name,out):
    return export_scene(Database(),name,Path(out))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--scene',action='append');ap.add_argument('--all',action='store_true');ap.add_argument('--jobs',type=int,default=1);ap.add_argument('--resume',action='store_true');args=ap.parse_args();db=Database();out=ROOT/'public/overlord/scenes';out.mkdir(parents=True,exist_ok=True)
    names=sorted(n for n in db.bundles.values() if n.startswith('scene_')) if args.all else args.scene or ['scene_baihua.ezfunab']
    manifest=out/'manifest.json';previous=json.loads(manifest.read_text()) if manifest.exists() else {};rows=previous.get('scenes',[]) if previous.get('exportVersion')==2 else []
    if args.resume:names=[n for n in names if n not in {r['sourceBundle'] for r in rows}]
    def retain(row):
        global rows
        rows=[r for r in rows if r['sourceBundle']!=row['sourceBundle']]+[row]
        temp=manifest.with_suffix('.tmp');temp.write_text(json.dumps({'schemaVersion':1,'exportVersion':2,'scenes':sorted(rows,key=lambda r:r['id'])},ensure_ascii=False),encoding='utf-8');temp.replace(manifest)
        print(json.dumps({'scene':row['sourceBundle'],'meshes':row['meshes'],'instances':row['meshInstances'],'errors':len(row['errors'])}),flush=True)
    if args.jobs>1:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            futures={pool.submit(worker_scene,n,str(out)):n for n in names}
            for future in as_completed(futures):
                try:retain(future.result())
                except Exception as ex:print(json.dumps({'scene':futures[future],'error':str(ex)}),flush=True)
        sys.exit(0)
    for name in names:
        start=time.time()
        try:
            row=export_scene(db,name,out);retain(row)
        except Exception as ex:print(json.dumps({'scene':name,'error':str(ex)}),flush=True)
