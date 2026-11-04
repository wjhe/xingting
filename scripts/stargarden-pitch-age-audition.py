'''Create a three-age listening test from existing auditions, without API calls.'''
import hashlib
import html
import json
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public/assets/stargarden/audio'
OUT = PUBLIC / 'voice-age-pitch-test-v1'
FFMPEG = Path(r'C:\Users\Administrator\AppData\Local\JianyingPro\Apps\10.5.0.13988\ffmpeg.exe')
SOURCE = PUBLIC / 'voice-grown-diagnosis-v1/explicit-age.wav'
CHILD_RAISED = OUT / 'child-raise-2-semitone.wav'
ADULT = OUT / 'grown-lower-1-semitone.wav'


def audio_info(path):
    with wave.open(str(path), 'rb') as audio:
        return {'rate': audio.getframerate(), 'channels': audio.getnchannels(),
                'duration': audio.getnframes() / audio.getframerate(),
                'frames': audio.getnframes()}


def shift_pitch(source, destination, semitones):
    source_info = audio_info(source)
    factor = 2 ** (semitones / 12)
    rate = source_info['rate']
    filters = f'asetrate={rate}*{factor:.12f},aresample={rate},atempo={1/factor:.12f}'
    subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', str(source),
                    '-af', filters, '-c:a', 'pcm_s16le', str(destination)], check=True)
    info = audio_info(destination)
    if info['frames'] < 1 or abs(info['duration'] - source_info['duration']) > .15:
        raise ValueError('Unexpected output duration')
    return info


def main():
    for path in [SOURCE, FFMPEG]:
        if not path.exists():
            raise FileNotFoundError(path)
    OUT.mkdir(parents=True, exist_ok=True)
    source_info = audio_info(SOURCE)
    child_info = audio_info(CHILD_RAISED) if CHILD_RAISED.exists() else shift_pitch(SOURCE, CHILD_RAISED, 2)
    adult_info = audio_info(ADULT) if ADULT.exists() else shift_pitch(SOURCE, ADULT, -1)
    clips = [
        {'label': '10–13岁 · 童年', 'src': CHILD_RAISED.name,
         'description': '同一段原声升高2个半音，尽量保持原时长。'},
        {'label': '14–15岁 · 少女', 'src': '../voice-grown-diagnosis-v1/explicit-age.wav',
         'description': '原来的16–18岁试听，保持原声音调。'},
        {'label': '16–18岁 · 成长', 'src': ADULT.name,
         'description': '同一段原声后期降低1个半音，尽量保持原时长。'},
    ]
    manifest = {'text': '爸爸，你回来啦！我一直在等你。', 'clips': clips,
        'speaker_id_teen_and_grown': 'zh_female_roumeinvyou_uranus_bigtts',
        'speaker_id_all_ages': 'zh_female_roumeinvyou_uranus_bigtts', 'source_model': 'seed-audio-1.0',
        'source_file': SOURCE.relative_to(ROOT).as_posix(),
        'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'child_sha256': hashlib.sha256(CHILD_RAISED.read_bytes()).hexdigest(),
        'adult_sha256': hashlib.sha256(ADULT.read_bytes()).hexdigest(),
        'child_pitch_semitones': 2, 'adult_pitch_semitones': -1,
        'method': 'ffmpeg asetrate, aresample, atempo',
        'source_audio': source_info, 'child_audio': child_info, 'adult_audio': adult_info,
        'status': 'audition_pending'}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    cards = ''
    for clip in clips:
        label = html.escape(clip['label'])
        description = html.escape(clip['description'])
        src = html.escape(clip['src'], quote=True)
        cards += f'<article><h2>{label}</h2><p>{description}</p><audio controls preload=metadata src={src}></audio></article>'
    page = f'''<!doctype html><html lang=zh-CN><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<title>艾莉 · 三个年龄段试听</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#f5f7ef;color:#34463f;font:18px/1.6 system-ui,sans-serif}}main{{max-width:760px;margin:auto;padding:28px 18px 48px}}h1{{font-size:26px}}h2{{font-size:21px;margin:0}}p{{margin:8px 0 16px}}article{{background:white;border:1px solid #cfd9ce;border-radius:6px;padding:18px;margin:16px 0}}audio{{width:100%;display:block}}blockquote{{margin:20px 0;padding:12px 16px;border-left:4px solid #80a68a}}small{{color:#596a60}}</style>
<main><h1>艾莉 · 三个年龄段试听</h1><blockquote>爸爸，你回来啦！我一直在等你。</blockquote>{cards}
<small>三个版本都来自同一段录音，后期分别升高2个半音、保持原调、降低1个半音。这里测试的是音高变化，不代表三个年龄已经验收通过。</small></main>
<script>document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{{if(a!==b)b.pause()}})));</script></html>'''
    (OUT / 'index.html').write_text(page, encoding='utf-8')
    print('Created', OUT)


if __name__ == '__main__':
    main()
