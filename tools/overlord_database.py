"""Read the shipped ABDatabase protobuf wire records (despite .json suffix).

Field meanings are observed from repeated path/id/dependency records, not a
recovered .proto schema. Preserve uint64 IDs exactly, including signed encodings.
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'reference/overlord/apks/split_asset_pack_1.apk'

def varint(data, offset):
    value = shift = 0
    while offset < len(data):
        b = data[offset]
        offset += 1
        value |= (b & 127) << shift
        if b < 128:
            return value, offset
        shift += 7
        if shift > 70:
            raise ValueError('invalid protobuf varint')
    raise ValueError('truncated protobuf varint')

def fields(data):
    offset = 0
    while offset < len(data):
        key, offset = varint(data, offset)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, offset = varint(data, offset)
        elif wire == 2:
            size, offset = varint(data, offset)
            value = data[offset:offset + size]
            if len(value) != size:
                raise ValueError('truncated protobuf bytes')
            offset += size
        else:
            raise ValueError(f'unsupported wire {wire}')
        yield number, value

class Database:
    def __init__(self, pack=PACK):
        self.zip = zipfile.ZipFile(pack)
        def rows(name):
            return [list(fields(v)) for n,v in fields(self.zip.read('assets/AssetBundle/ABDatabase_'+name+'.json')) if n == 1]
        self.bundles = {r[0][1]: r[1][1].decode('utf-8') for r in rows('bundle')}
        self.assets = {r[0][1]: r[1][1].decode('utf-8') for r in rows('asset')}
        self.bundle_deps = {r[0][1]: [v for n,v in r[1:] if n == 2] for r in rows('bundleDep')}
        self.asset_deps = {r[0][1]: [v for n,v in r[1:] if n == 2] for r in rows('dep')}
        self.ids = {v:k for k,v in self.bundles.items()}

    def dependencies(self, bundle):
        found = set()
        def visit(key):
            if key in found:
                return
            found.add(key)
            for dep in self.bundle_deps.get(key, []):
                visit(dep)
        visit(self.ids[bundle])
        return [self.bundles[k] for k in sorted(found) if k in self.bundles]

    def bytes(self, bundle):
        return self.zip.read('assets/AssetBundle/'+bundle)

if __name__ == '__main__':
    db = Database()
    out = ROOT/'reference/overlord/analysis/bundle-database.json'
    out.write_text(json.dumps({'bundles':db.bundles,'assets':db.assets,'bundleDependencies':db.bundle_deps,'assetDependencies':db.asset_deps},ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'bundles':len(db.bundles),'assets':len(db.assets),'scene_baihua_dependencies':db.dependencies('scene_baihua.ezfunab')},ensure_ascii=False))
