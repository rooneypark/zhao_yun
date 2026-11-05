"""Join exact decrypted source tables into character/combo/weapon inspection data."""
from pathlib import Path
import json,hashlib,re,collections
ROOT=Path('reference/overlord/analysis/combat-tables')
OUT=Path('public/overlord/combat');OUT.mkdir(parents=True,exist_ok=True)
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf8')
def rows(name):
    d=json.loads((ROOT/(name+'.json')).read_text(encoding='utf8'))
    def order(s):
        m=re.search(r'_s(\d+)\.',s['source']);return int(m[1]) if m else 0
    return [(r,{'table':name,'file':s['source'],'decodedSha256':s['sha256']})
        for s in sorted(d['sources'],key=order) for r in s['data']['list']]
def byid(name):
    result={}
    for row,src in rows(name):result[json.dumps(row['ID'],sort_keys=True)]=(row,src)
    return result
def lookup(d,key):return d.get(json.dumps(key,sort_keys=True),(None,None))
cards=byid('ResCardStateList'); monsters=byid('ResMonsterList');models=byid('ResMonsterModelResourcesList')
weapons=byid('ResWeaponList');skills=byid('ResSkillList');displays=byid('ResSkillDisplayList')
details=rows('ResSkillDetailList');combos=rows('ResComBoList')
names=json.loads(Path('reference/overlord/extracted/base/assets/Table/ResCardNameList.json').read_text(encoding='utf8'))['list']
name_lookup={n['ID']:n for n in names}
catalog=json.loads(Path('public/overlord/catalog.json').read_text(encoding='utf8'))
characters=[]
for candidate in catalog['characterCandidates']:
    resource_id=candidate['resourceId'];variants=[]
    for card,card_src in cards.values():
        monster,monster_src=lookup(monsters,card.get('monsterID'))
        if not monster:continue
        model,model_src=lookup(models,monster.get('monsterModelResourcesID'))
        if not model or model.get('modelPath')!='monster_boss_'+resource_id:continue
        variants.append((card,card_src,monster,monster_src,model,model_src))
    if not variants:
        characters.append({'resourceId':resource_id,'bindings':{},'combos':[],
            'coverage':'No exact CardState→Monster→ModelResources prefab-name relationship recovered.'});continue
    variants.sort(key=lambda v:v[0]['ID'])
    card,card_src,monster,monster_src,model,model_src=variants[0]
    card_id=card['ID'];weapon,weapon_src=lookup(weapons,monster.get('weaponID'))
    relevant_details=[(r,s) for r,s in details if r['ID']['cardid']==card_id]
    detail_by_skill={r.get('skillID'):(r,s) for r,s in relevant_details}
    matched=[]
    manifest_path=Path('public/overlord/assets/characters')/(resource_id+'.json')
    manifest=json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {}
    clip_names={c['name'] for c in manifest.get('clips',[])}
    for combo,combo_src in combos:
        skill_id=combo.get('SkillID')
        if skill_id not in detail_by_skill:continue
        # Shared dodge/mount rows may be referenced by other characters too;
        # retain only the direct source entry, without unrelated buff variants.
        conditions=combo.get('condition',[])
        if combo['ID'].get('ComboID',0)>=100:continue
        skill,skill_src=lookup(skills,skill_id)
        if not skill:continue
        display,display_src=lookup(displays,skill_id)
        detail,detail_src=detail_by_skill[skill_id]
        prefix_conditions=[c for c in conditions if c.get('type')==1]
        prefix=prefix_conditions[0].get('strParam','') if len(prefix_conditions)==1 else None
        animation=skill.get('AnimName','')
        clip=resource_id+'_'+animation
        if clip not in clip_names:clip=animation if animation in clip_names else None
        row={'id':str(combo['ID']['ID'])+':'+str(combo['ID']['ComboID']),
            'groupId':combo['ID']['ID'],'comboId':combo['ID']['ComboID'],
            'skillId':skill_id,'animationName':animation,'clipName':clip,
            'clipAssociation':'exact character-prefix + source animation-state name' if clip else None,
            'key':combo.get('Key',''),'begin':combo.get('Begin',0),
            'priority':combo.get('Priority',0),'conditions':conditions,
            'inputPrefix':prefix,'inputSequence':prefix+combo.get('Key','') if prefix is not None else None,
            'skillType':detail.get('skillType',0),'site':detail.get('site',0),
            'nameKey':skill.get('Name'),'descriptionKey':skill.get('Describe'),
            'timingRaw':{k:v for k,v in (display or {}).items() if k in ('HardTime','InputTime','SuperArmorTime','showtime')},
            'nextIds':[],'source':[combo_src,skill_src,detail_src]+([display_src] if display_src else [])}
        matched.append(row)
    # Direct edges follow actual source condition.type1 key-history strings.
    for row in matched:
        seq=row['inputSequence']
        if seq is not None:
            row['nextIds']=[n['id'] for n in matched if n['inputPrefix']==seq and n['key'] in ('A','B')]
    matched.sort(key=lambda r:(r['begin'],r['groupId'],r['comboId']))
    def binding(key,prefix):
        options=[r for r in matched if r['key']==key and r['inputPrefix']==prefix and r['clipName']]
        # Base laboratory preview only: additional source conditions remain shown.
        options.sort(key=lambda r:(len(r['conditions']),r['priority'],r['begin']))
        if not options:return None
        r=options[0]
        return {'id':r['id'],'clipName':r['clipName'],'animationName':r['animationName'],
            'originalKey':key,'requiredPrefix':prefix,'conditions':r['conditions'],
            'label':('A · 일반 공격' if key=='A' else ('B · 차지 1' if prefix=='' else prefix+'→B · 차지 2')),
            'coverage':'Source key/sequence verified; preview bypasses progression and gameplay conditions.'}
    bindings={k:v for k,v in {'attack':binding('A',''),'skill1':binding('B',''),'skill2':binding('B','A')}.items() if v}
    weapon_out=None
    if weapon:
        weapon_out={k:weapon[k] for k in ('ID','ctrlName','fx','fx_r','monsterLeftWeapon','monsterRightWeapon','set') if k in weapon}
        weapon_out['source']=weapon_src
    result={'resourceId':resource_id,'cardId':card_id,'sourceName':name_lookup.get(card_id,{}).get('name',card.get('name')),
        'sourcePinyin':name_lookup.get(card_id,{}).get('pinyin'),
        'monsterId':monster['ID'],'modelResourceId':model['ID'],'modelPath':model['modelPath'],
        'variantCardIds':[v[0]['ID'] for v in variants],
        'bindings':bindings,'combos':matched,'weapon':weapon_out,
        'sourceRefs':[card_src,monster_src,model_src],
        'coverage':'Exact native-verified protobuf character/monster/model/weapon/skill references; clip association separately named.',
        'limitations':['Skill slots1/2 preview the first two source B-key charge branches; slot2 requires original A→B input.',
            'Graph edges use source key-history conditions; other source unlock, cooldown, state and buff conditions are retained but not simulated.',
            'Character animation state to clip name association is name-based unless controller evidence is supplied.']}
    save(OUT/(resource_id+'.json'),result);characters.append(result)
index={'schemaVersion':1,'characters':characters,
    'summary':{'characters':len(characters),'charactersWithExactCardLink':sum('cardId'in c for c in characters),
        'charactersWithAttackBinding':sum('attack'in c['bindings'] for c in characters),
        'charactersWithTwoChargeBindings':sum('skill1'in c['bindings'] and 'skill2'in c['bindings'] for c in characters),
        'comboEntries':sum(len(c['combos']) for c in characters)},
    'keyDefinitions':{'A':'SkillKey.SkillKeyA / UIEnums.SkillType.Normal',
        'B':'SkillKey.SkillKeyB / UIEnums.SkillType.ForceEnergia','D':'SkillKey.Peerless','O':'SkillKey.ExSkill','N':'SkillKey.Dodge'},
    'sources':{'nativeSchemaTags':'reference/overlord/analysis/resource-schemas.json',
        'descriptor':'reference/overlord/decoded/base/assets/Lua/LuaSys/ezfun_resource.lua',
        'keyUiMapping':'Lua/UI/Controller/BattleUI/BattleCastSkillUICtrl.lua:57',
        'keyHistoryCondition':'Lua/LuaSys/QteSys.lua:155'},
    'limitations':['Game code may select other forms/skills based on player progression; lowest source CardState ID is the default inspected form.',
        'All source raw clips remain available independently of source table bindings.']}
save(OUT/'index.json',index)
print(json.dumps(index['summary'],indent=2))
