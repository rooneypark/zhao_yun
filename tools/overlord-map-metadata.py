"""Read v27 IL2CPP map-format metadata names, without executing target code.

Layout reference: https://github.com/Perfare/Il2CppDumper/blob/master/Il2CppDumper/Il2Cpp/MetadataClass.cs
"""
from pathlib import Path
import struct, re, json, hashlib

p=Path('reference/overlord/extracted/base/assets/bin/Data/Managed/Metadata/global-metadata.dat')
b=p.read_bytes()
assert struct.unpack_from('<II',b)==(0xFAB11BAF,27)
so,sl=struct.unpack_from('<II',b,24)
def string(i):
    assert 0<=i<sl
    return b[so+i:b.index(0,so+i,so+sl)].decode('utf8','replace')
to,tl=struct.unpack_from('<II',b,160)
mo,ml=struct.unpack_from('<II',b,48)
fo,fl=struct.unpack_from('<II',b,96)
do,dl=struct.unpack_from('<II',b,64)
dvo,dvl=struct.unpack_from('<II',b,72)
defaults={}
for k in range(dl//12):
    fi,ti,di=struct.unpack_from('<iii',b,do+k*12)
    defaults[fi]=(di,do+k*12)
assert tl%88==0 and ml%32==0 and fl%12==0
results=[]
for i in range(tl//88):
    off=to+i*88
    vals=struct.unpack_from('<16I8H2I',b,off)
    name=string(vals[0]); ns=string(vals[1])
    if ns != 'tools.MapData' and not re.search(r'MapFile|MapData|HeightData|HeightMap|MapHeight|MapElement|MapComponent|MapObj|MapUnit|GlobalCrypto|XXTEA|BinaryFile|MapLocation|MapNode|PointType|MapItemType|AreaType|GroundType|WalkType|SceneArea|^VInt$',name,re.I):
        continue
    fields=[]
    for j in range(vals[18]):
        foff=fo+(vals[8]+j)*12
        f=struct.unpack_from('<III',b,foff)
        field={'name':string(f[0]),'offset':foff,'typeIndex':f[1]}
        if name in ('PointType','VInt') and vals[8]+j in defaults:
            di,defo=defaults[vals[8]+j]
            if 0<=di<=dvl-4:
                field.update({'constantInt32':struct.unpack_from('<i',b,dvo+di)[0],
                    'constantOffset':dvo+di,'defaultRecordOffset':defo})
        fields.append(field)
    methods=[]
    for j in range(vals[16]):
        mindex=vals[9]+j; moff=mo+mindex*32
        m=struct.unpack_from('<6I4H',b,moff)
        methods.append({'name':string(m[0]),'offset':moff,'index':mindex,'token':m[5],
            'returnTypeIndex':m[2]})
    results.append({'type':ns+'.'+name,'index':i,'offset':off,'fields':fields,'methods':methods})
out=Path('reference/overlord/analysis/map-metadata-names.json')
out.write_text(json.dumps({'source':str(p),'sha256':hashlib.sha256(b).hexdigest(),'types':results},indent=2),encoding='utf8')
point_types=[r for r in results if r['type']=='.PointType']
if point_types:
    pt=point_types[0]
    Path('public/overlord/maps/point-types.json').write_text(json.dumps({
        'source':str(p),'sha256':hashlib.sha256(b).hexdigest(),'typeOffset':pt['offset'],
        'types':{str(f['constantInt32']):f['name'] for f in pt['fields'] if 'constantInt32' in f},
        'coverage':'Static IL2CPP enum field default signed int32 values; no localized names inferred.'},indent=2),encoding='utf8')
print(json.dumps([{'type':r['type'],'fields':[f['name'] for f in r['fields']],'methods':[m['name'] for m in r['methods']][:30]} for r in results],indent=2))
