"""Copy the installed package split APKs, then verify remote/local SHA-256.

Use with BlueStacks running and ADB enabled. Does not modify or stop the app.
Private app data is not copied. APK CRCs and per-member inventories are recorded.
"""
import argparse,hashlib,json,subprocess,zipfile
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def run(*args):
    return subprocess.run(args,check=True,capture_output=True,text=True,encoding='utf-8').stdout.strip()

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--serial',default='127.0.0.1:5555');ap.add_argument('--package',default='com.emagroups.zs');ap.add_argument('--offline',action='store_true');a=ap.parse_args()
    dest=ROOT/'reference/overlord';(dest/'apks').mkdir(parents=True,exist_ok=True);(dest/'analysis').mkdir(exist_ok=True)
    paths=[];remote={}
    if not a.offline:
        paths=[v.removeprefix('package:') for v in run('adb','-s',a.serial,'shell','pm','path',a.package).splitlines()]
        for p in paths:
            target=dest/'apks'/Path(p).name
            size=int(run('adb','-s',a.serial,'shell','stat','-c','%s',p))
            if not target.exists() or target.stat().st_size!=size:subprocess.run(['adb','-s',a.serial,'pull',p,str(target)],check=True)
            remote[target.name]={'path':p,'sha256':run('adb','-s',a.serial,'shell','sha256sum',p).split()[0]}
    rows=[]
    for p in sorted((dest/'apks').glob('*.apk')):
        with zipfile.ZipFile(p) as z:
            bad=z.testzip()
            if bad:raise ValueError(f'CRC failure: {p.name}:{bad}')
            members=[{'path':i.filename,'bytes':i.file_size,'crc32':f'{i.CRC:08x}'} for i in z.infolist()]
        digest=sha(p);r=remote.get(p.name)
        if r and r['sha256']!=digest:raise ValueError('Remote hash mismatch: '+p.name)
        row={'name':p.name,'bytes':p.stat().st_size,'sha256':digest,'zipCrcVerified':True,'memberCount':len(members),'remote':r}
        rows.append(row);(dest/'analysis'/(p.stem+'-members.json')).write_text(json.dumps(members,ensure_ascii=False),encoding='utf-8')
        print(p.name,p.stat().st_size,digest,flush=True)
    report={'package':a.package,'timestampUtc':datetime.now(timezone.utc).isoformat(),'apks':rows,'limitations':['Includes installed APK splits, not resources never downloaded from the server.','Private /data/data is inaccessible to the ADB shell and was not copied.','No package-specific external Android/data or Android/obb directories were present at acquisition.']}
    (dest/'analysis/acquisition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
