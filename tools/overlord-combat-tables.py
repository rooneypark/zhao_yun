"""Derive protobuf schema tags from ARM64 attribute constructors and decode tables."""
from pathlib import Path
import re,json,struct,hashlib,math,sys
from google.protobuf import descriptor_pb2,descriptor_pool,message_factory
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path('reference/overlord/decoded/base/assets/Table')
OUT=Path('reference/overlord/analysis/combat-tables');OUT.mkdir(parents=True,exist_ok=True)
dump=Path('reference/overlord/analysis/il2cppdump/dump.cs').read_text(encoding='utf8')
schemas={}
for chunk in dump.split('// Namespace: ezfun_resource\n')[1:]:
    chunk=chunk.split('// Namespace: ')[0]
    m=re.search(r'public class (\w+) : IExtensible',chunk)
    if not m or '// Properties' not in chunk:continue
    props=chunk.split('// Properties',1)[1].split('// Methods',1)[0]
    addr=None;fields=[]
    for line in props.splitlines():
        a=re.search(r'\[ProtoMemberAttribute\].*RVA: 0x([0-9A-F]+)',line)
        if a:addr=int(a[1],16)
        q=re.search(r'public (.+?) (\w+) \{ get;',line)
        if q and addr is not None:
            fields.append({'name':q[2],'type':q[1],'attributeAddress':addr});addr=None
    schemas[m[1]]=fields

instructions={}
for line in Path('reference/overlord/analysis/resource-proto-attributes.asm').read_text(encoding='utf8').splitlines():
    m=re.match(r'\s*([0-9a-f]+):\s+[0-9a-f]{8}\s+(.+)',line)
    if m:instructions[int(m[1],16)]=m[2].split('//')[0].strip()
failures=[]
for name,fields in schemas.items():
    for f in fields:
        w1=None
        for off in range(f['attributeAddress'],f['attributeAddress']+400,4):
            ins=instructions.get(off,'')
            m=re.match(r'(?:mov\s+w1,|orr\s+w1,\s*wzr,)\s*#(0x[0-9a-f]+|\d+)',ins)
            if m:w1=int(m[1],0)
            if re.match(r'mov\s+w1,\s*wzr',ins):w1=0
            if re.match(r'bl\s+0x17f3fc8\b',ins):
                if w1 is None or not 1<=w1<536870912:
                    failures.append({'type':name,'field':f['name'],'reason':'constructor tag unavailable'})
                else:f.update({'tag':w1,'tagConstructorCall':off})
                break
            if ins=='ret':
                failures.append({'type':name,'field':f['name'],'reason':'constructor call absent'});break
        if 'tag' not in f:continue
    tags=[f['tag'] for f in fields if 'tag' in f]
    if len(tags)!=len(set(tags)):raise ValueError('duplicate tags '+name)
Path('reference/overlord/analysis/resource-schemas.json').write_text(json.dumps({
    'source':'official Il2CppDumper v6.7.46 + ARM64 native ProtoMemberAttribute.ctor at0x17f3fc8',
    'schemas':schemas,'failures':failures},indent=2),encoding='utf8')
descriptor_path=Path('reference/overlord/decoded/base/assets/Lua/LuaSys/ezfun_resource.lua')
descriptor_bytes=descriptor_path.read_bytes()
descriptor_set=descriptor_pb2.FileDescriptorSet()
descriptor_set.ParseFromString(descriptor_bytes)
pool=descriptor_pool.DescriptorPool()
for descriptor in descriptor_set.file:pool.Add(descriptor)
verified=0
for name,fields in schemas.items():
    descriptor=pool.FindMessageTypeByName('ezfun_resource.'+name)
    for field in fields:
        assert field['name'] in descriptor.fields_by_name,(name,field['name'])
        assert field['tag']==descriptor.fields_by_name[field['name']].number,(name,field)
        verified+=1

def exact_typed(raw,name):
    cls=message_factory.GetMessageClass(pool.FindMessageTypeByName('ezfun_resource.'+name))
    obj=cls();obj.ParseFromString(raw)
    def convert(obj):
        result={}
        for field,v in obj.ListFields():
            if field.is_repeated:
                result[field.name]=[convert(x) for x in v] if field.message_type else list(v)
            elif field.message_type:result[field.name]=convert(v)
            else:result[field.name]=v
        return result
    return convert(obj)

def varint(b,p):
    v=0
    for sh in range(0,70,7):
        if p>=len(b):raise ValueError('varint truncated')
        x=b[p];p+=1;v|=(x&127)<<sh
        if x<128:return v,p
    raise ValueError('varint overflow')

def wire(b):
    p=0;out={}
    while p<len(b):
        k,p=varint(b,p);tag,wt=k>>3,k&7
        if tag==0:raise ValueError('zero field')
        if wt==0:v,p=varint(b,p)
        elif wt==2:
            n,p=varint(b,p);v=b[p:p+n];p+=n
            if p>len(b):raise ValueError('bytes truncated')
        elif wt==5:v=struct.unpack_from('<f',b,p)[0];p+=4
        elif wt==1:v=struct.unpack_from('<d',b,p)[0];p+=8
        else:raise ValueError('unknown wire '+str(wt))
        out.setdefault(tag,[]).append((wt,v))
    return out

def scalar(wt,v,kind):
    if kind=='string':return v.decode('utf8')
    if kind=='byte[]':return {'hex':v.hex()}
    if kind=='bool':return bool(v)
    if kind in ('int','long'):
        bits=32 if kind=='int' else 64
        return v-(1<<bits) if isinstance(v,int) and v>=(1<<(bits-1)) else v
    if kind in ('float','double','uint','ulong'):return v
    if kind in schemas:return typed(v,kind)
    return v if not isinstance(v,bytes) else {'rawHex':v.hex()}

def typed(b,kind):
    parsed=wire(b);result={};known=set()
    for field in schemas[kind]:
        if 'tag' not in field:continue
        tag=field['tag'];known.add(tag)
        if tag not in parsed:continue
        typ=field['type'];m=re.fullmatch(r'(?:List|IList)<(.+)>',typ)
        element=m[1] if m else typ
        vals=[]
        for wt,v in parsed[tag]:
            if m and wt==2 and element in ('int','long','uint','ulong','bool'):
                i=0
                while i<len(v):pv,i=varint(v,i);vals.append(scalar(0,pv,element))
            else:vals.append(scalar(wt,v,element))
        result[field['name']]=vals if m else vals[0]
    unknown=set(parsed)-known
    if unknown:result['_unknownFieldNumbers']=sorted(unknown)
    return result

targets=('ResComBoList','ResSkillList','ResSkillDisplayList','ResMonsterModelResourcesList',
    'ResMonsterModelList','ResCardArmyList','ResWeaponList','ResWeaponAnimList','ResCardDetailList',
    'ResCardList','ResCardMonsterModelList','ResExskillList','ResRateExskillList','ResKeysList')
targets=targets+('ResCardStateList','ResCardLevelList','ResWeaponbasicList','ResWeaponSkinList','ResMonsterList')
targets=targets+('ResMonsterBattleList','ResSkillDetailList','ResCardAttrList','ResItemList')
table_reports=[]
for name in targets:
    if name not in schemas:continue
    files=sorted(ROOT.glob(name+'*.bytes'))
    decoded=[];errs=[]
    for path in files:
        # Avoid accidentally matching names with unrelated suffixes.
        if path.stem!=name and not re.fullmatch(re.escape(name)+r'_s\d+',path.stem):continue
        try:
            b=path.read_bytes();d=exact_typed(b,name)
            decoded.append({'source':path.name,'sha256':hashlib.sha256(b).hexdigest(),'data':d})
        except Exception as exc:errs.append({'source':path.name,'error':str(exc)})
    if decoded:
        (OUT/(name+'.json')).write_text(json.dumps({'table':name,'sources':decoded,'failures':errs},ensure_ascii=False),encoding='utf8')
    table_reports.append({'table':name,'files':len(decoded),'rows':sum(len(r['data'].get('list',[])) for r in decoded),'failures':errs})
print(json.dumps({'schemas':len(schemas),'verifiedTags':sum('tag'in f for fs in schemas.values() for f in fs),
    'descriptorSource':str(descriptor_path),'descriptorSha256':hashlib.sha256(descriptor_bytes).hexdigest(),
    'nativeDescriptorTagMatches':verified,
    'schemaFailures':len(failures),'tables':table_reports},ensure_ascii=False,indent=2))
