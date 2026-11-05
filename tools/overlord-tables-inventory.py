"""Inventory shipped Overlord table/resource metadata without claiming decryption.

Usage: python tools/overlord-tables-inventory.py [extracted-assets-dir] [output-dir]
Only reads source assets; outputs deterministic JSON inventories and fingerprints.
"""
from __future__ import annotations

import collections
import hashlib
import json
from pathlib import Path
import sys


def save(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "reference/overlord/extracted/base/assets")
    output = Path(sys.argv[2] if len(sys.argv) > 2 else "reference/overlord/analysis")
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = source / "assets_md5.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    rows = []
    for name, value in sorted(manifest.items()):
        size, digest = value.split("_", 1)
        rows.append({"path": name, "manifestBytes": int(size), "manifestMd5": digest,
                     "category": name.split("/")[1]})
    categories = collections.Counter(row["path"].split("/")[1] for row in rows)
    save(output / "resource-manifest.json", {
        "source": str(manifest_path), "sourceSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "coverage": "Manifest entries only; does not establish that all resources were acquired or decoded.",
        "categories": dict(categories), "entries": rows,
    })
    bundles = {Path(row["path"]).stem: row for row in rows if row["path"].startswith("/AssetBundle/")}
    # File stems are resource identifiers, not decoded character names or gameplay roles.
    character_candidates = []
    for stem, row in bundles.items():
        if not stem.startswith("ani_") or stem.startswith("ani_boss_"):
            continue
        key = stem[4:]
        model = bundles.get("model_" + key)
        if model:
            character_candidates.append({"resourceId": key, "animationBundle": row,
                "modelBundle": model, "bossAnimationBundle": bundles.get("ani_boss_" + key),
                "skillEffectBundle": bundles.get("fx_skill_" + key),
                "status": "filename-pair candidate; character table and animation clips not decoded"})
    save(output / "character-resource-candidates.json", character_candidates)
    save(output / "map-resource-candidates.json", {
        "sceneBundles": [row for row in rows if row["path"].startswith("/AssetBundle/scene_")],
        "mapFiles": [row for row in rows if row["path"].startswith("/MapFile/")],
        "status": "Manifest inventory; scene-to-map relationships and geometry are not decoded.",
    })
    headers = []
    for subdir in ("Table", "ColliderData", "Json"):
        for path in sorted((source / subdir).rglob("*")):
            if not path.is_file():
                continue
            raw = path.read_bytes()
            declared = int.from_bytes(raw[:4], "big") if len(raw) >= 4 else None
            payload_length = len(raw) - 4
            opaque = (declared is not None and payload_length >= 0 and payload_length % 16 == 0
                      and 0 <= payload_length - declared < 16)
            headers.append({"path": str(path.relative_to(source)).replace("\\", "/"),
                "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                "prefixHex": raw[:16].hex(), "declaredBigEndianLength": declared,
                "lengthPrefixed16ByteAligned": opaque})
    save(output / "table-header-inventory.json", headers)
    public = Path("public/overlord")
    public.mkdir(parents=True, exist_ok=True)
    save(public / "catalog.json", {
        "schemaVersion": 1,
        "source": {"path": str(manifest_path).replace("\\", "/"),
            "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "kind": "apk-assets-md5-manifest",
            "coverage": "Manifest-declared resources; acquisition and decoding are independently verified."},
        "summary": {"manifestEntries": len(rows), "categories": dict(categories),
            "characterFilenamePairs": len(character_candidates),
            "sceneBundleCandidates": sum(row["path"].startswith("/AssetBundle/scene_") for row in rows),
            "mapFileEntries": categories["MapFile"]},
        "resources": rows,
        "characterCandidates": character_candidates,
        "sceneBundles": [row for row in rows if row["path"].startswith("/AssetBundle/scene_")],
        "mapFiles": [row for row in rows if row["path"].startswith("/MapFile/")],
        "limitations": [
            "Manifest presence does not establish local acquisition, decoding, or runtime availability.",
            "Filename pairs are resource candidates, not an authoritative playable-character roster.",
            "Scene bundle count is not the total gameplay map count.",
            "Skill assignments, attack combos, terrain, geometry, and animation clip curves are not decoded in this catalog.",
        ],
    })
    print(json.dumps({"resourceEntries": len(rows), "categories": dict(categories),
        "characterFilenamePairs": len(character_candidates),
        "sceneBundles": sum(row["path"].startswith("/AssetBundle/scene_") for row in rows),
        "headerFiles": len(headers),
        "opaque16ByteAligned": sum(row["lengthPrefixed16ByteAligned"] for row in headers)}, indent=2))


if __name__ == "__main__":
    main()
