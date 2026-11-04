"""Compare original generation, direct native TTS, and explicit age direction."""
import base64
import html
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEAKER = 'zh_female_roumeinvyou_uranus_bigtts'
TEXT = '爸爸，你回来啦！我一直在等你。'
VERSION = 'voice-grown-diagnosis-v1'
OUT = ROOT / 'art-src/stargarden/audio' / VERSION
PUBLIC = ROOT / 'public/assets/stargarden/audio' / VERSION


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    native = load('native_tts', 'stargarden-builtin-emotions.py')
    native.OUT, native.PUBLIC, native.SPEAKER = OUT, PUBLIC, SPEAKER
    native.helpers.OUT, native.helpers.PUBLIC = OUT, PUBLIC
    native.helpers.TEXT = TEXT
    native.helpers.EMOTIONS = [('neutral', '官方 TTS 直出', '')]
    native.main()
    helpers = native.helpers
    key = (ROOT / '音频生成key.txt').read_text(encoding='utf-8-sig').strip()
    target = OUT / 'explicit-age.json'
    if target.exists() and (PUBLIC / 'explicit-age.wav').exists():
        age_clip = json.loads(target.read_text(encoding='utf-8'))
    else:
        prompt = (f'一位17岁少女的中文游戏配音。严格使用@音频1的原本音色与自然音区，保留官方音色的声音身份。'
                  '角色处于16至18岁阶段，已告别儿童时期。声音清澈柔和，沉稳自然，有自己的主见，'
                  '不要模仿小孩，不要娃娃音，不要捏嗓子，不要刻意升高音调，也不要刻意压低变成中年声。'
                  '场景：她平静地迎接回家的父亲，语气温和、日常、从容，不撒娇、不扑过去。'
                  f'只念这句台词：“{TEXT}”。不要读说明，无音乐、无环境声、无其他人物。')
        payload = {'model': 'seed-audio-1.0', 'text_prompt': prompt, 'references': [{'speaker': SPEAKER}],
                   'audio_config': {'format': 'wav', 'sample_rate': 24000, 'enable_subtitle': True}}
        print('Generating explicit 17-year-old direction...', flush=True)
        response = helpers.post('create', payload, key, 'explicit-age')
        age_clip = helpers.save_audio('explicit-age', base64.b64decode(response['audio'], validate=True))
        age_clip.update(label='音频生成 · 明确17岁', speaker_id=SPEAKER, subtitle=response.get('subtitle'))
        helpers.write(target, age_clip)
    direct = json.loads((OUT / 'builtin-neutral.json').read_text(encoding='utf-8'))
    original = json.loads((ROOT / 'art-src/stargarden/audio/voice-emotions-grown-official-v1/neutral.json').read_text(encoding='utf-8'))
    original.update(src='../voice-emotions-grown-official-v1/neutral.wav', label='上一版 · 未指定年龄')
    clips = [direct, original, age_clip]
    manifest = {'speaker_id': SPEAKER, 'text': TEXT, 'clips': clips, 'status': 'audition_pending',
                'methods': ['seed-tts-2.0 without context_texts', 'seed-audio-1.0 original prompt', 'seed-audio-1.0 explicit age prompt']}
    helpers.write(OUT / 'manifest.json', manifest)
    helpers.write(PUBLIC / 'manifest.json', manifest)
    cards = ''.join(f'<article><h2>{html.escape(c["label"])}</h2><audio controls preload="metadata" src="{c["src"]}"></audio></article>' for c in clips)
    page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>16—18岁 · 音色核对</title>
<style>body{{margin:0;background:#faf5e5;color:#47543e;font:17px/1.7 system-ui}}main{{max-width:680px;margin:auto;padding:24px 18px}}article{{background:#fffcf3;padding:18px;margin:20px 0;border-radius:22px}}h1{{font-size:28px}}h2{{font-size:22px}}audio{{width:100%}}small{{overflow-wrap:anywhere}}</style>
<main><h1>16—18岁 · 音色核对</h1><p>同一官方音色、同一句台词，比较接口与年龄提示的影响。</p><blockquote>{TEXT}</blockquote>{cards}<p>第一条：官方 TTS 直接合成，不加场景或情绪指令。第二条：上一版音频生成结果。第三条：音频生成明确要求17岁、自然音区、从容表达。均未后期变调。</p><small>{SPEAKER}</small></main>
<script>document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{{if(b!==a)b.pause()}})));</script></html>'''
    (PUBLIC / 'index.html').write_text(page, encoding='utf-8')
    print(f'Preview: http://localhost:5174/assets/stargarden/audio/{VERSION}/index.html')


if __name__ == '__main__':
    main()
