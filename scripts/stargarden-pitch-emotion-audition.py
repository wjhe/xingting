"""Build a six-emotion, three-age audition from one voice identity."""
import base64
import hashlib
import html
import importlib.util
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEAKER = "zh_female_roumeinvyou_uranus_bigtts"
TEXT = "爸爸，你回来啦！我一直在等你。"
BASE = ROOT / "art-src/stargarden/audio/voice-pitch-emotions-v2"
DERIVED = BASE / "derived"
PUBLIC = ROOT / "public/assets/stargarden/audio/voice-pitch-emotions-v2"
EXISTING = ROOT / "art-src/stargarden/audio/voice-emotions-grown-official-v1"

EMOTIONS = {
    "calm": ("平静", "平静自然地说，像普通的一天在家里迎接爸爸。"),
    "happy": ("开心", "终于等到爸爸回家，开心地笑着迎接，语气轻快。"),
    "sad": ("难过", "等了很久、心里委屈，声音低落，但仍把话说完。"),
    "shy": ("害羞", "有点不好意思地迎接爸爸，声音轻柔，带着克制的笑意。"),
    "angry": ("生气", "爸爸来晚了，她明明担心却故作生气，语气有不满但不喊叫。"),
    "tired": ("疲累", "刚结束一整天的练习，已经很累了，仍温柔地迎接爸爸。"),
}

EXISTING_FILES = {
    "calm": ("neutral.wav", "neutral.json"),
    "happy": ("excited.wav", "excited.json"),
    "sad": ("tearful.wav", "tearful.json"),
}

AGES = {
    "child": ("10–13岁 · 童年", 1),
    "teen": ("14–15岁 · 少女", 0),
    "grown": ("16–18岁 · 成长", -1),
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prepare():
    # The project keeps the callable helper in the existing voice workflow.
    voice = load_module("pitch_voice_helpers", ROOT / "scripts/stargarden-voice-emotion-v2.py")
    pitch = load_module("pitch_shift_helpers", ROOT / "scripts/stargarden-pitch-age-audition.py")
    voice.OUT = BASE
    voice.PUBLIC = PUBLIC
    voice.voice.OUT = BASE
    voice.voice.PUBLIC = PUBLIC
    BASE.mkdir(parents=True, exist_ok=True)
    DERIVED.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    return voice, pitch


def source_for(voice, tone):
    """Reuse existing source audio, otherwise generate exactly one new emotion clip."""
    destination = BASE / f"base-{tone}.wav"
    record = BASE / f"base-{tone}.json"
    if destination.exists() and record.exists():
        clip = json.loads(record.read_text(encoding="utf-8"))
        if clip.get("speaker_id") != SPEAKER:
            raise ValueError("Cached source uses another speaker: " + tone)
        return clip
    if tone in EXISTING_FILES:
        audio_name, json_name = EXISTING_FILES[tone]
        source_audio = EXISTING / audio_name
        source_json = json.loads((EXISTING / json_name).read_text(encoding="utf-8"))
        if not source_audio.exists():
            raise FileNotFoundError(source_audio)
        shutil.copy2(source_audio, destination)
        clip = {
            "src": destination.name,
            "duration": source_json["duration"],
            "source_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            "speaker_id": SPEAKER,
            "label": EMOTIONS[tone][0],
            "instruction": EMOTIONS[tone][1],
            "source_kind": "reused existing audition",
        }
        record.write_text(json.dumps(clip, ensure_ascii=False, indent=2), encoding="utf-8")
        return clip
    key = (ROOT / "音频生成key.txt").read_text(encoding="utf-8-sig").strip()
    instruction = EMOTIONS[tone][1]
    prompt = (
        "一段游戏角色的中文配音，只有一个女孩的人声。使用@音频1的同一个年轻少女音色，"
        "保持声音身份一致，不模仿另一个角色，不读说明。"
        f"表演情境：{instruction}\n"
        f"女孩说：“{TEXT}”\n"
        "只演出这句台词及相应的人声表情，不添加内容，不要音乐、环境声或其他人物。"
    )
    payload = {
        "model": "seed-audio-1.0",
        "text_prompt": prompt,
        "references": [{"speaker": SPEAKER}],
        "audio_config": {
            "format": "wav",
            "sample_rate": 24000,
            "enable_subtitle": True,
        },
    }
    print(f"Generating {tone}: {EMOTIONS[tone][0]}...", flush=True)
    response = voice.voice.post("create", payload, key, "base-" + tone)
    if not response.get("audio"):
        raise RuntimeError("No audio returned for " + tone)
    clip = voice.voice.save_audio(
        "base-" + tone, base64.b64decode(response["audio"], validate=True)
    )
    clip.update(
        speaker_id=SPEAKER,
        label=EMOTIONS[tone][0],
        instruction=instruction,
        subtitle=response.get("subtitle"),
        source_kind="new seed-audio-1.0 prompt",
    )
    record.write_text(json.dumps(clip, ensure_ascii=False, indent=2), encoding="utf-8")
    return clip


def build():
    voice, pitch = prepare()
    base_clips = {}
    for tone in EMOTIONS:
        base_clips[tone] = source_for(voice, tone)

    pages = []
    for tone, (label, instruction) in EMOTIONS.items():
        source = BASE / f"base-{tone}.wav"
        source_info = pitch.audio_info(source)
        cards = []
        for age, (age_label, semitones) in AGES.items():
            destination = DERIVED / f"{tone}-{age}.wav"
            if age == "teen":
                if not destination.exists():
                    shutil.copy2(source, destination)
            elif not destination.exists():
                pitch.shift_pitch(source, destination, semitones)
            age_info = pitch.audio_info(destination)
            if abs(age_info["duration"] - source_info["duration"]) > .15:
                raise ValueError("Unexpected duration: " + destination.name)
            relative = f"derived/{destination.name}"
            cards.append(
                f"<article><h3>{html.escape(age_label)}</h3>"
                f'<audio controls preload="metadata" src="{relative}"></audio></article>'
            )
        pages.append(
            f'<section class="emotion"><div class="heading"><h2>{html.escape(label)}</h2>'
            f"<p>{html.escape(instruction)}</p></div><div class=\"players\">{''.join(cards)}</div></section>"
        )

    public_derived = PUBLIC / "derived"
    public_derived.mkdir(parents=True, exist_ok=True)
    for source in DERIVED.glob("*.wav"):
        shutil.copy2(source, public_derived / source.name)

    manifest = {
        "text": TEXT,
        "speaker_id": SPEAKER,
        "source_model": "seed-audio-1.0",
        "age_pitch_semitones": {key: value[1] for key, value in AGES.items()},
        "emotions": {
            tone: {
                "label": label,
                "instruction": instruction,
                "base_source": base_clips[tone].get("source_kind"),
                "clips": {
                    age: f"derived/{tone}-{age}.wav"
                    for age in AGES
                },
            }
            for tone, (label, instruction) in EMOTIONS.items()
        },
        "status": "audition_pending",
    }
    (PUBLIC / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    page = f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>艾莉 · 情绪与年龄试听</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#f6f7ef;color:#384b40;font:17px/1.55 system-ui,sans-serif}}
main{{max-width:900px;margin:auto;padding:24px 16px 48px}}h1{{font-size:27px;margin:0 0 8px}}
.intro{{color:#5b6d60;margin:0 0 24px}}.emotion{{background:#fff;border:1px solid #d6dfd1;border-radius:12px;padding:18px;margin:16px 0;box-shadow:0 3px 12px #46604410}}
.heading{{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}}.heading h2{{font-size:22px;margin:0}}.heading p{{margin:0;color:#67766a}}
.players{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}}article{{background:#f4f7ee;border-radius:8px;padding:10px}}
article h3{{font-size:14px;margin:0 0 8px;color:#58705d}}audio{{width:100%;display:block}}small{{color:#718075}}
@media(max-width:620px){{.players{{grid-template-columns:1fr}}}}
</style><main><h1>艾莉 · 情绪与年龄试听</h1>
<p class="intro">同一句台词、同一个音色身份；年龄差异通过后期音调测试：童年升1个半音，少女保持原调，成长降低1个半音。</p>
<blockquote>{html.escape(TEXT)}</blockquote>
{''.join(pages)}
<small>平静、开心、难过复用已有录音；害羞、生气、疲累通过同一音色生成。所有年龄版本均由同一段情绪录音处理，试听通过前不会接入游戏。</small>
</main><script>document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{{if(a!==b)b.pause()}})));</script></html>"""
    (PUBLIC / "index.html").write_text(page, encoding="utf-8")
    print("Created", PUBLIC)


if __name__ == "__main__":
    build()
