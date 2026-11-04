"""Generate and derive the complete dialogue voice set from one speaker identity."""
import argparse
import base64
import concurrent.futures
import hashlib
import importlib.util
import json
import shutil
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "art-src/stargarden/audio/voice-dialogue-v1/lines.json"
BASE = ROOT / "art-src/stargarden/audio/dialogue-daughter-v1"
PUBLIC = ROOT / "public/assets/stargarden/audio/dialogue-daughter-v1"
LEGACY_BASE = ROOT / "art-src/stargarden/audio/dialogue-all-v1/base"
SPEAKER = "zh_female_roumeinvyou_uranus_bigtts"
STAGES = {"child": 1, "teen": 0, "grown": -1}


def load_module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def setup():
    voice = load_module(
        "all_voice_helpers", "scripts/stargarden-voice-emotion-v2.py"
    )
    pitch = load_module(
        "all_voice_pitch", "scripts/stargarden-pitch-age-audition.py"
    )
    voice.OUT = BASE / "base"
    voice.PUBLIC = PUBLIC / "raw"
    voice.voice.OUT = voice.OUT
    voice.voice.PUBLIC = voice.PUBLIC
    for path in [BASE / "base", BASE / "derived", BASE / "requests",
                 PUBLIC / "raw", *[PUBLIC / stage for stage in STAGES]]:
        path.mkdir(parents=True, exist_ok=True)
    return voice, pitch


def slug(line_id):
    return hashlib.sha256(line_id.encode("utf-8")).hexdigest()[:20]


def prompt_for(line):
    role = {
        "daughter": "以故事中同一个女孩的声音直接说出台词",
        "talk": "像和养育者说悄悄话一样自然亲近",
        "gift": "收到礼物时自然开心地道谢",
        "birthday": "在生日时温暖而开心地说",
        "story": "以自然、温和的故事讲述口吻演出",
        "dialogue": "以故事中同一个女孩的声音自然演出",
        "choice": "清楚、平静地读出一个可供养育者选择的行动",
        "result": "像温柔地讲述刚刚发生的结果",
        "ending": "以成年后自然、成熟而温暖的声音总结这段成长",
    }[line["role"]]
    parent = line.get("parent")
    parent_note = (
        f"直接称呼养育者为{parent}，不要改成其他称呼。" if parent else ""
    )
    return (
        "一段中文养成游戏配音，只能有一个人声。使用@音频1的同一个年轻少女音色，"
        "保持声音身份一致，不模仿其他人物，不添加内容。"
        f"表演要求：{line['emotion']}。{role}。{parent_note}"
        f"\n请完整念出以下文本：“{line['text']}”\n"
        "只念这段文本，不读说明。不要音乐、环境声、音效或其他人声。"
    )


def legacy_audio_for(line):
    if not LEGACY_BASE.exists():
        return None
    parent = line.get("parent")
    for record_path in LEGACY_BASE.glob("*.json"):
        if record_path.name.endswith("-request.json"):
            continue
        try:
            record = json.loads(record_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if record.get("text") != line["text"]:
            continue
        if record.get("parent") != parent:
            continue
        source = LEGACY_BASE / str(record.get("src", ""))
        if source.exists():
            return source, record
    return None


def generate_base(voice, line):
    key = slug(line["id"])
    audio = BASE / "base" / f"{key}.wav"
    record = BASE / "base" / f"{key}.json"
    api_key_path = ROOT / "音频生成key.txt"
    api_key = api_key_path.read_text(encoding="utf-8-sig").strip()
    payload = {
        "model": "seed-audio-1.0",
        "text_prompt": prompt_for(line),
        "references": [{"speaker": SPEAKER}],
        "audio_config": {
            "format": "wav",
            "sample_rate": 24000,
            "enable_subtitle": True,
        },
    }
    response = voice.voice.post("create", payload, api_key, key)
    if not response.get("audio"):
        raise RuntimeError("No audio returned")
    clip = voice.voice.save_audio(
        key, base64.b64decode(response["audio"], validate=True)
    )
    clip.update(
        id=line["id"],
        text=line["text"],
        group=line["group"],
        role=line["role"],
        emotion=line["emotion"],
        ages=line["ages"],
        parent=line.get("parent"),
        speaker_id=SPEAKER,
        model="seed-audio-1.0",
        subtitle=response.get("subtitle"),
    )
    record.write_text(
        json.dumps(clip, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return clip


def derive_variants(pitch, line):
    key = slug(line["id"])
    source = BASE / "base" / f"{key}.wav"
    if not source.exists():
        raise FileNotFoundError(source)
    clips = []
    for stage in line["ages"]:
        destination = BASE / "derived" / f"{key}-{stage}.wav"
        semitones = STAGES[stage]
        if not destination.exists():
            if semitones == 0:
                shutil.copy2(source, destination)
            else:
                pitch.shift_pitch(source, destination, semitones)
        public_destination = PUBLIC / stage / destination.name
        if not public_destination.exists():
            shutil.copy2(destination, public_destination)
        info = pitch.audio_info(public_destination)
        clips.append({
            "id": line["id"],
            "age": stage,
            "src": f"{stage}/{destination.name}",
            "duration": info["duration"],
            "parent": line.get("parent"),
            "group": line["group"],
            "role": line["role"],
            "text": line["text"],
        })
    return clips


def process_line(voice, pitch, line):
    key = slug(line["id"])
    audio = BASE / "base" / f"{key}.wav"
    record = BASE / "base" / f"{key}.json"
    if not audio.exists() or not record.exists():
        reused = legacy_audio_for(line)
        if reused:
            source, old_record = reused
            shutil.copy2(source, audio)
            cached = dict(old_record)
            cached.update(
                id=line["id"],
                text=line["text"],
                group=line["group"],
                role=line["role"],
                emotion=line["emotion"],
                ages=line["ages"],
                parent=line.get("parent"),
                source_kind="reused dialogue cache",
            )
            record.write_text(
                json.dumps(cached, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"Reuse [{line['priority']}] {line['id']}", flush=True)
        else:
            print(f"Generate [{line['priority']}] {line['id']}", flush=True)
            generate_base(voice, line)
    return derive_variants(pitch, line)


def finalize(catalog, failures=None):
    clips = []
    missing = []
    for line in catalog["lines"]:
        key = slug(line["id"])
        for stage in line["ages"]:
            path = PUBLIC / stage / f"{key}-{stage}.wav"
            if not path.exists():
                missing.append(f"{line['id']}:{stage}")
                continue
            clips.append({
                "id": line["id"],
                "age": stage,
                "src": f"{stage}/{path.name}",
                "parent": line.get("parent"),
                "group": line["group"],
                "role": line["role"],
                "text": line["text"],
            })
    manifest = {
        "version": 1,
        "speaker_id": SPEAKER,
        "source_model": "seed-audio-1.0",
        "age_semitones": STAGES,
        "catalog_count": catalog["count"],
        "clip_count": len(clips),
        "complete": not missing,
        "failures": failures or [],
        "clips": clips,
    }
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"Manifest: {len(clips)} clips, {len(missing)} missing, complete={not missing}",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--only", nargs="*", help="Exact voice line IDs")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--finalize-only", action="store_true")
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    lines = catalog["lines"]
    if args.only:
        wanted = set(args.only)
        lines = [line for line in lines if line["id"] in wanted]
        if len(lines) != len(wanted):
            raise SystemExit("Unknown or duplicate voice line ID")
    if args.limit:
        lines = lines[:args.limit]
    if args.finalize_only:
        finalize(catalog)
        return
    voice, pitch = setup()
    failures = []
    lock = threading.Lock()
    completed = 0

    def run(line):
        nonlocal completed
        try:
            process_line(voice, pitch, line)
            with lock:
                completed += 1
                if completed % 5 == 0 or completed == len(lines):
                    print(f"Progress {completed}/{len(lines)} base lines ready", flush=True)
            return None
        except KeyboardInterrupt:
            raise
        except BaseException as error:
            message = f"{line['id']}: {type(error).__name__}: {str(error)[:300]}"
            with lock:
                failures.append(message)
                print("FAILED " + message, flush=True)
            return message

    with concurrent.futures.ThreadPoolExecutor(
        max_workers=max(1, min(args.workers, 3))
    ) as pool:
        list(pool.map(run, lines))
    finalize(catalog, failures)
    if failures:
        raise SystemExit(f"{len(failures)} voice lines failed; rerun to resume")


if __name__ == "__main__":
    main()
