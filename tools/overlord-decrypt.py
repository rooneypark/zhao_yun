"""Decode local asset files using source-resolved GlobalCrypto key/IV.

Requires the official Il2CppDumper script.json generated for this exact binary.
No authentication material or remote data is read. Raw extracted files stay intact.
"""
from pathlib import Path
import json,gzip,hashlib
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes

ROOT=Path('reference/overlord/extracted/base/assets')
OUT=Path('reference/overlord/decoded/base/assets')
script=Path('reference/overlord/analysis/il2cppdump/script.json')
entries=json.loads(script.read_text(encoding='utf8'))['ScriptString']
# ARM64 GlobalCrypto.cctor 0x1681c84 writes this same literal to IV and Key.
# GOT slot0x3a4d670 has R_AARCH64_RELATIVE addend0x3c41f58.
literal=next(row for row in entries if row['Address']==0x3c41f58)
key=bytes.fromhex(literal['Value'])
assert len(key)==16
records=[]; failures=[]
for folder in ('Table','Lua','Json','ColliderData'):
    for path in sorted((ROOT/folder).rglob('*')):
        if not path.is_file(): continue
        raw=path.read_bytes()
        if len(raw)<4 or (len(raw)-4)%16: continue
        size=int.from_bytes(raw[:4],'big')
        if not 0<=len(raw)-4-size<16: continue
        try:
            dec=Cipher(algorithms.AES(key),modes.CBC(key)).decryptor()
            data=(dec.update(raw[4:])+dec.finalize())[:size]
            compressed=data.startswith(b'\x1f\x8b')
            if compressed: data=gzip.decompress(data)
            dest=OUT/path.relative_to(ROOT)
            dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            records.append({'path':str(path.relative_to(ROOT)).replace('\\','/'),
                'sourceSha256':hashlib.sha256(raw).hexdigest(),'decodedSha256':hashlib.sha256(data).hexdigest(),
                'sourceBytes':len(raw),'headerLength':size,'decodedBytes':len(data),'gzip':compressed})
        except Exception as exc: failures.append({'path':str(path),'error':str(exc)})
report={'sourceBinary':'reference/overlord/extracted/arm64/lib/arm64-v8a/libil2cpp.so',
    'sourceBinarySha256':hashlib.sha256(Path('reference/overlord/extracted/arm64/lib/arm64-v8a/libil2cpp.so').read_bytes()).hexdigest(),
    'cipher':'AES-128-CBC','ivEqualsKey':True,'keySourceUsageAddress':'0x3c41f58',
    'keySourceGotSlot':'0x3a4d670','globalCryptoCctor':'0x1681c84',
    'keySha256':hashlib.sha256(key).hexdigest(),
    'fileFraming':'4-byte BE plaintext length followed by16-byte-aligned AES ciphertext; optional GZIP',
    'decodedFiles':len(records),'gzipFiles':sum(r['gzip'] for r in records),
    'records':records,'failures':failures,
    'limitations':['Decryption structure corroborated by ARM64 source and valid protobuf/Lua output. Additional unknown payload formats are not automatically semantically decoded.']}
Path('reference/overlord/analysis/decryption.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({k:report[k] for k in ('decodedFiles','gzipFiles','failures')},indent=2))
