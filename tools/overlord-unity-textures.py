"""Fill exported previews from explicit diffuse pointers or recorded exact-name inference."""
import argparse,hashlib,importlib.util,io,json,pathlib,struct
import UnityPy
from overlord_database import Database,ROOT
spec=importlib.util.spec_from_file_location('motion_export',ROOT/'tools/overlord-unity-motion.py');motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(motion)
out=ROOT/'public/overlord/assets/characters'
ap=argparse.ArgumentParser();ap.add_argument('--character');args=ap.parse_args();db=Database()
reports=[out/(args.character+'.json')] if args.character else [p for p in out.glob('*.json') if p.name!='manifest.json']
counts={}
for report_path in reports:
    report=json.loads(report_path.read_text(encoding='utf-8'));env=UnityPy.Environment()
    for name in db.dependencies(report['modelBundle']):env.load_file(db.bytes(name),name=name)
    objects={o.path_id:o for o in env.objects};mesh_id=int(report['meshPathId'])
    renderer=next(o.read_typetree() for o in env.objects if o.type.name=='SkinnedMeshRenderer' and o.read_typetree()['m_Mesh']['m_PathID']==mesh_id)
    tex,assoc=motion.source_texture(objects,renderer,report['mesh']);report['textureAssociation']=assoc
    counts[assoc['kind']]=counts.get(assoc['kind'],0)+1
    path=out/(report['character']+'.glb');raw=path.read_bytes();jlen=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jlen]);boff=28+jlen
    if tex and not doc.get('images'):
        glb=motion.GLB();glb.doc=doc;glb.data=bytearray(raw[boff:boff+doc['buffers'][0]['byteLength']]);png=io.BytesIO();tex.read().image.save(png,format='PNG');view=glb.raw(png.getvalue());doc['images']=[{'bufferView':view,'mimeType':'image/png'}];doc['textures']=[{'source':0,'sampler':0}];doc['materials']=[{'name':tex.peek_name(),'doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.85}}]
        for mesh in doc['meshes']:
            for p in mesh['primitives']:p['material']=0
        glb.save(path)
    report['glbSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    report['sourceBundleSha256']={n:hashlib.sha256(db.bytes(n)).hexdigest() for n in [report['modelBundle'],*report.get('animationBundles',[])]}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
manifest_path=out/'manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
for row in manifest['characters']:
    p=out/(row['id']+'.json')
    if p.exists():
        report=json.loads(p.read_text(encoding='utf-8'));row['sha256']=report['glbSha256'];row['textureAssociation']=report.get('textureAssociation',{'kind':'pending'})
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(counts))
