"""Recover protobuf map markers and validated RLE height grids from shipped bytes.

No game execution. Map schema names corroborated by map-metadata-names.json;
protobuf field-number associations and fixed point scale remain static inferences.
"""
from pathlib import Path
from collections import Counter
import struct, json, hashlib, math

ROOT=Path('reference/overlord/extracted/pack/assets/MapFile')
OUT=Path('public/overlord/maps')
OUT.mkdir(parents=True,exist_ok=True)

def save(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf8')

def varint(b,p):
    value=0
    for shift in range(0,70,7):
        if p>=len(b): raise ValueError('truncated varint')
        v=b[p]; p+=1; value|=(v&127)<<shift
        if v<128: return value,p
    raise ValueError('varint overflow')

def message(b):
    p=0; fields={}
    while p<len(b):
        key,p=varint(b,p); number,wire=key>>3,key&7
        if not number: raise ValueError('zero field')
        offset=p
        if wire==0: value,p=varint(b,p)
        elif wire==5:
            value=struct.unpack_from('<f',b,p)[0]; p+=4
            if not math.isfinite(value): raise ValueError('nonfinite float')
        elif wire==1:
            value=struct.unpack_from('<d',b,p)[0]; p+=8
        elif wire==2:
            size,p=varint(b,p)
            if size>len(b)-p: raise ValueError('truncated payload')
            value=b[p:p+size]; p+=size
        else: raise ValueError(f'unsupported wire {wire}')
        fields.setdefault(number,[]).append((wire,value,offset))
    return fields

def value(m,n,default=0):
    return m[n][0][1] if n in m else default

def vector(raw):
    m=message(raw)
    return dict(zip(('x','y','z'),(value(m,i,0) for i in (1,2,3))))

def source(path,raw):
    return {'path':str(path).replace('\\','/'),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

def terrain(path):
    raw=path.read_bytes()
    if len(raw)%4 or len(raw)<24: raise ValueError('invalid i32 height buffer')
    a=memoryview(raw).cast('i')
    fixed=all((int(a[j+1])-int(a[j]))%5000==0 for j in (0,2))
    if fixed:
        x0,x1,z0,z1=(int(v)/10000 for v in a[:4])
        sentinel=-5000000
        encoding='little-endian signed i32 / 10000; RLE run count is i32'
    else:
        x0,x1,z0,z1=struct.unpack_from('<4f',raw)
        sentinel=struct.unpack('<i',struct.pack('<f',-500.0))[0]
        encoding='little-endian IEEE754 float32; RLE run count is i32'
    dx,dz=(x1-x0)/.5,(z1-z0)/.5
    if not all(math.isfinite(v) for v in (x0,x1,z0,z1,dx,dz)) or dx!=int(dx) or dz!=int(dz):
        raise ValueError('bounds not half-unit aligned')
    nx,nz=int(dx),int(dz)
    if nx<=0 or nz<=0 or nx*nz>100_000_000: raise ValueError('invalid grid dimensions')
    total=nx*nz
    # Select evenly spaced original sample indices, retaining the last index.
    stride=max(1,math.ceil(math.sqrt(total/60000)))
    xs=sorted(set(range(0,nx,stride))|{nx-1})
    zs=sorted(set(range(0,nz,stride))|{nz-1})
    selected={x*nz+z:(ix*len(zs)+iz) for ix,x in enumerate(xs) for iz,z in enumerate(zs)}
    heights=[None]*len(selected)
    p=4; sample=0; runs=0; valid_count=0; min_h=None; max_h=None
    while sample<total:
        if p>=len(a): raise ValueError('grid truncated')
        v=int(a[p]); p+=1
        if v==sentinel:
            if p>=len(a): raise ValueError('run truncated')
            count=int(a[p])+1; p+=1; runs+=1
            if count<=0 or sample+count>total: raise ValueError('invalid run length')
            sample+=count
        else:
            h=v/10000 if fixed else struct.unpack_from('<f',raw,(p-1)*4)[0]
            if not math.isfinite(h): raise ValueError('nonfinite height')
            if sample in selected: heights[selected[sample]]=h
            valid_count+=1
            min_h=h if min_h is None else min(min_h,h)
            max_h=h if max_h is None else max(max_h,h)
            sample+=1
    result={'id':path.stem,'source':source(path,raw),
        'bounds':{'xMin':x0,'xMax':x1,'zMin':z0,'zMax':z1},
        'cols':len(xs),'rows':len(zs),
        'xCoords':[x0+i*.5 for i in xs],
        'zCoords':[z0+i*.5 for i in zs],
        'heights':heights,'step':0.5,'indexOrder':'x-major-z-fastest',
        'originalCols':nx,'originalRows':nz,'originalSamples':total,
        'decodedSamples':sample,'validSamples':valid_count,'nullValue':-500,
        'sampleEncoding':encoding,
        'heightRange':[min_h,max_h], 'rleRuns':runs,
        'footerOffset':p*4,'footerBytes':len(raw)-p*4,
        'coverage':'RLE sample count exactly equals bounds-derived grid. Preview downsamples original grid; null means no height sample.',
        'inferences':['Coordinate and height divisor 10000 inferred from grid alignment and matching protobuf world positions.',
            'Sample order x-major/z-fastest inferred from flat-grid layout; runtime coordinate lookup not traced.',
            'Trailing bytes preserved in source and counted, not decoded as terrain.']}
    return result

terrains=[]; failures=[]
for path in sorted(ROOT.glob('*.mhd')):
    if '_area' in path.stem.lower(): continue
    try:
        t=terrain(path); save(OUT/(path.stem+'.terrain.json'),t)
        terrains.append({k:t[k] for k in ('id','source','bounds','cols','rows','originalCols','originalRows','originalSamples','validSamples','heightRange','footerBytes','coverage')})
        terrains[-1]['url']='/overlord/maps/'+path.stem+'.terrain.json'
    except Exception as exc: failures.append({'path':str(path),'error':str(exc)})

lookup={t['id'].lower():t['id'] for t in terrains}
areas=[]
for path in sorted(ROOT.glob('*.mhd')):
    if not path.stem.lower().endswith('_area'): continue
    try:
        raw=path.read_bytes()
        if len(raw)%4: raise ValueError('area buffer not i32 aligned')
        a=memoryview(raw).cast('i')
        terrain_id=lookup.get(path.stem[:-5].lower())
        if not terrain_id: raise ValueError('area has no exact terrain stem match')
        t=json.loads((OUT/(terrain_id+'.terrain.json')).read_text(encoding='utf8'))
        total=t['originalSamples']; nz=t['originalRows']
        xs=[round((x-t['bounds']['xMin'])/.5) for x in t['xCoords']]
        zs=[round((z-t['bounds']['zMin'])/.5) for z in t['zCoords']]
        selected={x*nz+z:ix*len(zs)+iz for ix,x in enumerate(xs) for iz,z in enumerate(zs)}
        selected_sorted=sorted(selected); sel=0; codes=[None]*len(selected)
        p=0; sample=0; counts=Counter(); merged_runs=[]
        while p<len(a):
            code=int(a[p]); p+=1
            if code==0:
                if p>=len(a): raise ValueError('area zero run truncated')
                count=int(a[p])+1; p+=1
            else: count=1
            if count<=0 or sample+count>total: raise ValueError('area samples exceed matching height grid')
            end=sample+count
            while sel<len(selected_sorted) and selected_sorted[sel]<end:
                idx=selected_sorted[sel]
                if idx<sample: raise ValueError('area sample selection out of order')
                codes[selected[idx]]=code; sel+=1
            counts[code]+=count
            if merged_runs and merged_runs[-1][0]==code: merged_runs[-1][1]+=count
            else: merged_runs.append([code,count])
            sample=end
        if sample!=total or sel!=len(selected): raise ValueError('area count does not equal grid')
        area={'id':path.stem,'terrainId':terrain_id,'source':source(path,raw),
            'bounds':t['bounds'],'cols':t['cols'],'rows':t['rows'],
            'xCoords':t['xCoords'],'zCoords':t['zCoords'],'codes':codes,
            'indexOrder':t['indexOrder'],'originalCols':t['originalCols'],'originalRows':t['originalRows'],
            'originalSamples':total,'decodedSamples':sample,'codeCounts':dict(counts),
            'fullResolutionRuns':merged_runs,
            'coverage':'All little-endian int32 area codes decoded; zero marker is followed by count minus one. Expanded count exactly matches paired height grid.',
            'limitations':['Region code meanings are not established; codes 0/1/2/3 must not be labelled walkable, blocked, safe, or combat without code evidence.',
                'Terrain association and coordinate orientation are the same explicit static inferences as the paired height preview.']}
        save(OUT/(path.stem+'.area.json'),area)
        areas.append({k:area[k] for k in ('id','terrainId','source','originalSamples','codeCounts','coverage')})
        areas[-1]['url']='/overlord/maps/'+path.stem+'.area.json'
        for entry in terrains:
            if entry['id']==terrain_id: entry['areaId']=path.stem
    except Exception as exc: failures.append({'path':str(path),'error':str(exc)})

maps=[]
for path in sorted(ROOT.glob('*.mapFile')):
    try:
        raw=path.read_bytes(); m=message(raw)
        scene=value(m,1,b'').decode('utf8'); items=[]
        for _,item_raw,item_offset in m.get(2,[]):
            item=message(item_raw)
            items.append({'pointType':value(item,1),'id':value(item,2),'level':value(item,3),
                'radius':value(item,4),
                'position':vector(value(item,5,b'')),
                'scale':vector(value(item,6,b'')),
                'rotation':vector(value(item,7,b'')),
                'sourceLengthPrefixOffset':item_offset})
        terrain_id=lookup.get(Path(scene).stem.lower())
        result={'id':path.stem,'scenePath':scene,'items':items,'source':source(path,raw),
            'terrainId':terrain_id,'terrainLinkBasis':'case-insensitive exact Unity scene stem / .mhd stem match' if terrain_id else None,
            'wireFieldNumbers':sorted(m),
            'coverage':'Source protobuf wire messages decoded completely; selected fields named by matching generated metadata field order.',
            'limitations':['Protobuf field-number/name associations inferred from generated metadata field order and observed wire shapes; attributes not decoded.',
                'Markers are gameplay points, not rendered scene meshes or all static scene components.',
                'Scene-stem terrain pairing is a filename association; runtime loading not traced.']}
        save(OUT/(path.stem+'.map.json'),result)
        maps.append({k:result[k] for k in ('id','scenePath','source','terrainId','terrainLinkBasis','coverage')})
        maps[-1].update({'url':'/overlord/maps/'+path.stem+'.map.json','itemCount':len(items),
            'pointTypes':dict(Counter(str(it['pointType']) for it in items))})
    except Exception as exc: failures.append({'path':str(path),'error':str(exc)})

index={'schemaVersion':1,'source':'user-installed com.emagroups.zs split_asset_pack_1.apk / assets/MapFile',
    'maps':maps,'terrains':terrains,'areas':areas,'failures':failures,
    'summary':{'mapsDecoded':len(maps),'heightGridsDecoded':len(terrains),
        'mapsWithTerrainFilenameMatch':sum(bool(m['terrainId']) for m in maps),
        'markerCount':sum(m['itemCount'] for m in maps),
        'areaGridsDecoded':len(areas),
        'nonzeroAreaGrids':sum(any(int(k)!=0 and v>0 for k,v in area['codeCounts'].items()) for area in areas),
        'failures':len(failures)},
    'limitations':['Height scales/orientation and generated-protobuf field associations are explicit static inferences.',
        'These files supply terrain/markers; original scene meshes, materials, and component runtime behaviors are separate asset-bundle work.']}
save(OUT/'index.json',index)
save(Path('reference/overlord/analysis/map-export-summary.json'),{'summary':index['summary'],'failures':failures})
print(json.dumps(index['summary'],indent=2))
if failures: print(json.dumps(failures[:12],indent=2))
