"""Validate generated scene GLB structure and index/position ranges."""
import json,struct
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    manifest=json.loads((ROOT/'public/overlord/scenes/manifest.json').read_text(encoding='utf-8'))
    reports=[]
    for row in manifest['scenes']:
        p=ROOT/('public'+row['url']);raw=p.read_bytes();magic,version,total=struct.unpack_from('<III',raw)
        assert (magic,version,total)==(0x46546c67,2,len(raw)),p
        n,typ=struct.unpack_from('<II',raw,12);assert typ==0x4e4f534a
        d=json.loads(raw[20:20+n]);size,typ=struct.unpack_from('<II',raw,20+n);assert typ==0x004e4942
        start=28+n
        for a in d['accessors']:
            v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
            assert v['byteOffset']+v['byteLength']<=size,p
            assert a['count']*width*4<=v['byteLength'],p
        for mesh in d['meshes']:
            for primitive in mesh['primitives']:
                pos=d['accessors'][primitive['attributes']['POSITION']];idx=d['accessors'][primitive['indices']];view=d['bufferViews'][idx['bufferView']]
                indices=np.frombuffer(raw,dtype='<u4',count=idx['count'],offset=start+view['byteOffset'])
                assert idx['count']%3==0 and (not len(indices) or indices.max()<pos['count']),p
                view=d['bufferViews'][pos['bufferView']];values=np.frombuffer(raw,dtype='<f4',count=pos['count']*3,offset=start+view['byteOffset']);assert np.isfinite(values).all(),p
        for i,node in enumerate(d['nodes']):
            assert all(0<=c<len(d['nodes']) and c!=i for c in node.get('children',[])),p
            for field in ('translation','rotation','scale'):assert np.isfinite(node[field]).all(),p
        reports.append({'id':row['id'],'nodes':len(d['nodes']),'meshes':len(d['meshes']),'bytes':len(raw),'status':'passed'})
    out={'status':'passed','sceneCount':len(reports),'scenes':reports}
    (ROOT/'reference/overlord/analysis/scene-validation.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
    print(json.dumps({'status':'passed','scenes':len(reports)}))
