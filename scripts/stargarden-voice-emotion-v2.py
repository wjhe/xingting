"""Stronger acting comparison; synthesis only, never redesigns the voice."""
import base64
import html
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('voice_test', ROOT / 'scripts/stargarden-voice-design-test.py')
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)
voice.OUT = ROOT / 'art-src/stargarden/audio/voice-emotions-v2'
voice.PUBLIC = ROOT / 'public/assets/stargarden/audio/voice-emotions-v2'
TEXT = '爸爸，你回来啦！我一直在等你。'
CASES = [
    ('neutral', '平静 · 日常迎接', '普通的一天，女孩在家里迎接爸爸，心情平和。平稳自然地说话，语速中等。'),
    ('excited', '兴奋 · 惊喜重逢', '女孩终于等到久别的爸爸回家，瞬间喜出望外，兴奋地笑着扑过去。用非常开心、惊喜、雀跃的语气演出，开头明显扬起，节奏轻快，带真实可闻的笑意和短促笑声。情绪强度很高。'),
    ('tearful', '委屈 · 忍着眼泪', '女孩独自等了很久，害怕爸爸再也不回来。终于见到爸爸时，积累的委屈涌出来，难过得快要哭了。用明显的哭腔、颤抖的气息、哽咽和停顿演出，语速慢，尾音低落，忍着眼泪说完。情绪强度很高。'),
]


def main(speaker_id=None, output_version='voice-emotions-v2', age_label='女儿'):
    if speaker_id:
        speaker = speaker_id
    else:
        config = json.loads((ROOT / '音色设计配置.json').read_text(encoding='utf-8-sig'))
        speaker = config['speaker_id']
    voice.OUT = ROOT / 'art-src/stargarden/audio' / output_version
    voice.PUBLIC = ROOT / 'public/assets/stargarden/audio' / output_version
    key = (ROOT / '音频生成key.txt').read_text(encoding='utf-8-sig').strip()
    voice.OUT.mkdir(parents=True, exist_ok=True)
    voice.PUBLIC.mkdir(parents=True, exist_ok=True)
    clips = []
    for name, label, scene in CASES:
        record = voice.OUT / f'{name}.json'
        if record.exists() and (voice.PUBLIC / f'{name}.wav').exists():
            cached = json.loads(record.read_text(encoding='utf-8'))
            if cached.get('speaker_id') != speaker:
                raise SystemExit('Cached audio belongs to another speaker. Choose a new output directory.')
            clips.append(cached)
            continue
        prompt = (f'一段游戏角色的中文配音，只有一个女孩的人声。角色音色使用@音频1，保持同一个女孩的声音身份。'
                  f'表演场景：{scene}\n女孩说：“{TEXT}”\n'
                  '只演出台词及相应的人声表情，不读场景说明。干净录音，无音乐，无环境声，无其他角色。')
        payload = {'model': 'seed-audio-1.0', 'text_prompt': prompt,
                   'references': [{'speaker': speaker}],
                   'audio_config': {'format': 'wav', 'sample_rate': 24000, 'enable_subtitle': True}}
        print(f'Generating {name}...', flush=True)
        response = voice.post('create', payload, key, name)
        clip = voice.save_audio(name, base64.b64decode(response['audio'], validate=True))
        clip.update(label=label, instruction=scene, speaker_id=speaker, subtitle=response.get('subtitle'))
        voice.write(record, clip)
        clips.append(clip)
    voice.write(voice.PUBLIC / 'manifest.json', {'speaker_id': speaker, 'text': TEXT,
                'method': 'seed-audio-1.0 scene and acting prompts', 'clips': clips})
    cards = ''.join(f'<article><h2>{html.escape(c["label"])}</h2><audio controls preload="metadata" src="{c["src"]}"></audio><p>{html.escape(c["instruction"])}</p></article>' for c in clips)
    page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>女儿配音 · 强情绪对比</title>
<style>body{{margin:0;background:#faf5e5;color:#47543e;font:17px/1.7 system-ui}}main{{max-width:680px;margin:auto;padding:24px 18px}}article{{background:#fffcf3;padding:18px;margin:20px 0;border-radius:22px}}h1{{font-size:28px}}h2{{font-size:22px}}audio{{width:100%}}</style>
<main><h1>{html.escape(age_label)}配音 · 强情绪对比</h1><p>同一音色，同一句台词。请重点比较笑意、哭腔、停顿与语调。</p><blockquote>{TEXT}</blockquote>{cards}<p>固定音色：{speaker}。通过场景与表演提示生成，无后期变调。此页为待试听的对比实验。</p><p><a href="../voice-emotions-v2/index.html">童年试听</a> · <a href="../voice-emotions-teen-v1/index.html">少女期试听</a></p></main>
<script>document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{{if(b!==a)b.pause()}})));</script></html>'''
    (voice.PUBLIC / 'index.html').write_text(page, encoding='utf-8')
    print(f'Preview: http://localhost:5174/assets/stargarden/audio/{output_version}/index.html')


if __name__ == '__main__':
    main()
