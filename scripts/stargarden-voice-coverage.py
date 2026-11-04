"""Verify the complete voice catalog, staged files and public manifest."""
import argparse
import hashlib
import json
import re
import wave
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "art-src/stargarden/audio/voice-dialogue-v1/lines.json"
BASE = ROOT / "art-src/stargarden/audio/dialogue-daughter-v1/base"
PUBLIC = ROOT / "public/assets/stargarden/audio/dialogue-daughter-v1"


def valid_wav(path):
    try:
        with wave.open(str(path), "rb") as audio:
            return audio.getnframes() > 0 and audio.getframerate() > 0
    except (OSError, EOFError, wave.Error):
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-incomplete", action="store_true")
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    expected_base = catalog["count"]
    expected_clips = sum(len(line["ages"]) for line in catalog["lines"])
    base_audio = list(BASE.glob("*.wav"))
    group_counts = Counter(line["group"].split(":")[0] for line in catalog["lines"])
    missing = []
    invalid = []
    subtitle_mismatch = []

    def normalize(text):
        return re.sub(r"[\s，。！？!?、；;：:“”‘’\"'…—,.·]", "", text)

    for line in catalog["lines"]:
        key = hashlib.sha256(line["id"].encode("utf-8")).hexdigest()[:20]
        base_file = BASE / f"{key}.wav"
        record_path = BASE / f"{key}.json"
        if not base_file.exists() or not valid_wav(base_file):
            missing.append(line["id"] + ":base")
        elif record_path.exists():
            record = json.loads(record_path.read_text(encoding="utf-8"))
            subtitle = record.get("subtitle", {}).get("text", "")
            if normalize(subtitle) != normalize(line["text"]):
                subtitle_mismatch.append(line["id"])
        for stage in line["ages"]:
            path = PUBLIC / stage / f"{key}-{stage}.wav"
            if not path.exists():
                missing.append(f"{line['id']}:{stage}")
            elif not valid_wav(path):
                invalid.append(f"{line['id']}:{stage}")
    manifest_path = PUBLIC / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    parent_ids = [line["id"] for line in catalog["lines"] if line.get("parent")]
    print(json.dumps({
        "catalog_base_lines": expected_base,
        "catalog_age_clips": expected_clips,
        "groups": dict(sorted(group_counts.items())),
        "base_wav_files": len(base_audio),
        "manifest_clips": len(manifest.get("clips", [])),
        "parent_variants": parent_ids,
        "missing": len(missing),
        "invalid_wav": len(invalid),
        "subtitle_mismatch": len(subtitle_mismatch),
        "complete": not missing and not invalid and not subtitle_mismatch,
    }, ensure_ascii=False, indent=2))
    if (missing or invalid or subtitle_mismatch) and not args.allow_incomplete:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
