"""Bake an approximate source splat shader into standard glTF diffuse textures.

Geometry is never changed. Texture/material association must be a unique exact
source material name (or identical duplicate definitions). Original custom
lighting, normal maps and lightmaps remain outside this approximation.
"""
import argparse,collections,hashlib,io,json,pathlib,struct
import numpy as np
from PIL import Image
import UnityPy
from overlord_database import Database,ROOT

def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
def srgb(a):return np.where(a<=.0031308,a*12.92,1.055*np.maximum(a,0)**(1/2.4)-.055)
def source_image(tex):return np.asarray(tex.read().image.convert('RGBA'),dtype=np.float32)/255
def sample(image,u,v,repeat=True):
    h,w=image.shape[:2]
    if repeat:u=np.mod(u,1);v=np.mod(v,1)
    else:u=np.clip(u,0,1);v=np.clip(v,0,1)
    x=u*w-.5;y=v*h-.5;ix=np.floor(x).astype(np.int32);iy=np.floor(y).astype(np.int32);fx=(x-ix)[...,None];fy=(y-iy)[...,None]
    mode=np.mod if repeat else lambda a,b:np.clip(a,0,b-1)
    x0=mode(ix,w);x1=mode(ix+1,w);y0=mode(iy,h);y1=mode(iy+1,h)
    return (image[y0,x0]*(1-fx)+image[y0,x1]*fx)*(1-fy)+(image[y1,x0]*(1-fx)+image[y1,x1]*fx)*fy

def bake(mat,size):
    texs=dict(mat.m_SavedProperties.m_TexEnvs);colors=dict(mat.m_SavedProperties.m_Colors)
    control=texs.get('_Control')
    if not control or not control.m_Texture.m_PathID:return None
    uv=(np.arange(size,dtype=np.float32)+.5)/size;u,v=np.meshgrid(uv,uv)
    ctrl=sample(source_image(control.m_Texture),u*control.m_Scale.x+control.m_Offset.x,1-((1-v)*control.m_Scale.y+control.m_Offset.y),False)
    controls=[ctrl[:,:,i] for i in range(4)];control2=texs.get('_Control2')
    if control2 and control2.m_Texture.m_PathID:controls.append(sample(source_image(control2.m_Texture),u,v,False)[:,:,0])
    out=np.zeros((size,size,3),dtype=np.float32);weight=np.zeros((size,size),dtype=np.float32);layers=[]
    for i,w in enumerate(controls):
        env=texs.get('_Splat'+str(i))
        if env is None or not env.m_Texture.m_PathID:continue
        tex=env.m_Texture.read();tiling=colors.get('_Tiling'+str(i//2+1))
        scale=(getattr(tiling,'r' if i%2==0 else 'b'),getattr(tiling,'g' if i%2==0 else 'a')) if tiling else (env.m_Scale.x,env.m_Scale.y)
        pixels=tex.image.convert('RGBA')
        # Approximate source mip filtering before repeated UV sampling.
        target=(max(1,min(pixels.width,round(size/max(abs(scale[0]),1)))),max(1,min(pixels.height,round(size/max(abs(scale[1]),1)))))
        pixels=pixels.resize(target,Image.Resampling.LANCZOS)
        sampled=sample(np.asarray(pixels,dtype=np.float32)/255,u*scale[0]+env.m_Offset.x,1-((1-v)*scale[1]+env.m_Offset.y))[:,:,:3]
        out+=linear(sampled)*w[:,:,None];weight+=w
        layers.append({'property':'_Splat'+str(i),'texture':tex.m_Name,'pathId':str(env.m_Texture.m_PathID),'tiling':list(scale),'tilingSource':'_Tiling'+str(i//2+1) if tiling else 'TexEnv.m_Scale','offset':[env.m_Offset.x,env.m_Offset.y]})
    if not layers:return None
    out/=np.maximum(weight[:,:,None],1e-8);out[weight<=1e-8]=.5
    png=io.BytesIO();Image.fromarray(np.uint8(np.clip(srgb(out),0,1)*255+.5),'RGB').save(png,format='PNG')
    return png.getvalue(),{'material':mat.m_Name,'sourceControl':control.m_Texture.read().m_Name,'layers':layers,'bakeResolution':[size,size],'interpretation':'Approximate normalized RGBA layer weights; _Control2 R is fifth layer; source tiling and diffuse pixels in linear blend; standard PBR diffuse only.'}

def run(db,bundle,path,size):
    env=UnityPy.Environment()
    for n in db.dependencies(bundle):env.load_file(db.bytes(n),name=n)
    mats=collections.defaultdict(list)
    for obj in env.objects:
        if obj.type.name=='Material':mats[obj.peek_name()].append(obj)
    raw=path.read_bytes();jlen=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jlen]);data=bytearray(raw[28+jlen:28+jlen+doc['buffers'][0]['byteLength']]);changes=[];errors=[]
    for material in doc.get('materials',[]):
        if material.get('extras',{}).get('sourceSplatBake'):continue
        candidates=mats.get(material.get('name'),[])
        candidates=[o for o in candidates if '_Control' in dict(o.read().m_SavedProperties.m_TexEnvs)]
        if not candidates:continue
        if len({hashlib.sha256(o.get_raw_data()).hexdigest() for o in candidates})>1:
            errors.append({'material':material['name'],'reason':'ambiguous exact-name source materials'});continue
        try:
            result=bake(candidates[0].read(),size)
            if result is None:continue
            png,report=result;data.extend(b'\0'*(-len(data)%4));offset=len(data);data.extend(png);views=doc.setdefault('bufferViews',[]);view=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(png)});imgs=doc.setdefault('images',[]);img=len(imgs);imgs.append({'bufferView':view,'mimeType':'image/png'});textures=doc.setdefault('textures',[]);tid=len(textures);textures.append({'source':img});pbr=material.setdefault('pbrMetallicRoughness',{});pbr['baseColorTexture']={'index':tid};pbr['baseColorFactor']=[1,1,1,1];material.setdefault('extras',{})['sourceSplatBake']=report;changes.append(report)
        except Exception as ex:errors.append({'material':material['name'],'error':str(ex)[:200]})
    if changes:
        doc['buffers'][0]['byteLength']=len(data);j=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*(-len(j)%4);data.extend(b'\0'*(-len(data)%4));out=struct.pack('<III',0x46546c67,2,28+len(j)+len(data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data;tmp=path.with_suffix('.glb.tmp');tmp.write_bytes(out);tmp.replace(path)
    return {'scene':path.stem,'sourceBundle':bundle,'materialsBaked':changes,'errors':errors,'geometryChanged':False,'limitations':['Approximate custom splat shader interpretation; source normal maps, lightmaps and lighting are not reproduced.']}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--scene',action='append');ap.add_argument('--all',action='store_true');ap.add_argument('--size',type=int,default=1024);args=ap.parse_args();db=Database();out=ROOT/'public/overlord/scenes';names=sorted(n for n in db.bundles.values() if n.startswith('scene_')) if args.all else args.scene or ['scene_baihua.ezfunab'];reports=[]
    for n in names:
        path=out/(pathlib.Path(n).stem+'.glb')
        if not path.exists():continue
        try:r=run(db,n,path,args.size)
        except Exception as ex:r={'scene':path.stem,'sourceBundle':n,'error':str(ex)[:200]}
        reports.append(r);print(json.dumps({'scene':path.stem,'baked':len(r.get('materialsBaked',[])),'errors':r.get('errors',r.get('error'))}),flush=True)
        (ROOT/'reference/overlord/analysis/scene-texture-bakes.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
