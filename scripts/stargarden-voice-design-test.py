"""Official voice design once, then prompt-controlled emotions on the same ID.

Requires a user-supplied unused purchased speaker ID. Never purchases resources,
replaces an existing trained voice, or automatically retries a design operation.
"""
import base64
import hashlib
import html
import io
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools/audio-python'))
import soundfile as sf

BASE = 'https://openspeech.bytedance.com/api/v3/tts/'
OUT = ROOT / 'art-src/stargarden/audio/voice-design-v1'
PUBLIC = ROOT / 'public/assets/stargarden/audio/voice-design-v1'
CONFIG = ROOT / '\u97f3\u8272\u8bbe\u8ba1\u914d\u7f6e.json'
PROMPT = '10岁女孩，标准普通话，清亮柔软的自然女孩声，咬字清楚，气息稳定，语速中等，亲切温和而有好奇心，适合清新温馨的成长养成游戏。保留真实童真，不要婴儿腔、捏嗓子、夸张撒娇或播音腔。'
TEXT = '今天的练习结束了。我还有很多地方需要努力，谢谢你一直陪着我。'
EMOTIONS = [('neutral', '平静', '平静自然、亲切地说，语速中等，情绪中性。'),
            ('happy', '开心', '开心而充满期待地说，带自然的笑意和轻快感，但不要尖叫或夸张撒娇。'),
            ('sad', '难过', '有些难过和失落地说，轻声、稍慢、尾音低落，但不哭喊、不啜泣，保持吐字清楚。'),
            ('determined', '认真', '认真坚定而温柔地说，语气有决心，停顿清楚，不喊叫，不变成成年人的声线。')]


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def post(endpoint, payload, key, name):
    request_id = str(uuid.uuid4())
    record = {'endpoint': BASE + endpoint, 'request_id': request_id, 'request': payload, 'status': 'submitted'}
    path = OUT / f'{name}-request.json'
    write(path, record)
    request = urllib.request.Request(BASE + endpoint, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'X-Api-Key': key, 'X-Api-Request-Id': request_id}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.load(response)
            record['provider_log_id'] = response.headers.get('X-Tt-Logid')
        if data.get('code') not in (None, 0):
            record.update(status='failed', code=data.get('code'), message=str(data.get('message', '')).replace(key, '[REDACTED]'))
            write(path, record)
            raise SystemExit(f'Provider code {data.get("code")}; see {path.name}.')
        record.update(status='complete', response={k: v for k, v in data.items() if k not in ('audio', 'url', 'demo_audio', 'speaker_status')})
        write(path, record)
        return data
    except urllib.error.HTTPError as error:
        record.update(status='failed', http_status=error.code, provider_log_id=error.headers.get('X-Tt-Logid'))
        try:
            data = json.loads(error.read())
            record.update(code=data.get('code'), message=str(data.get('message', '')).replace(key, '[REDACTED]')[:1000])
        except (ValueError, UnicodeError):
            pass
        write(path, record)
        raise SystemExit(f'HTTP {error.code}; see {path.name}. No automatic retry.')


def save_audio(name, binary):
    samples, rate = sf.read(io.BytesIO(binary), always_2d=True)
    seconds = len(samples) / rate
    rms = float((samples * samples).mean() ** .5)
    peak = float(abs(samples).max())
    if not 1 < seconds < 30 or rms < .001:
        raise SystemExit(f'Unexpected audio for {name}; review before continuing.')
    sf.write(OUT / f'{name}.wav', samples, rate, subtype='PCM_16')
    gain = min(.065 / rms, .85 / max(peak, 1e-9))
    sf.write(PUBLIC / f'{name}.wav', samples * gain, rate, subtype='PCM_16')
    return {'src': name + '.wav', 'duration': seconds, 'gain': gain,
            'source_sha256': hashlib.sha256((OUT / f'{name}.wav').read_bytes()).hexdigest()}


def publish(speaker_id, clips):
    preview_record = OUT / 'design-preview.json'
    if preview_record.exists() and (PUBLIC / 'design-preview.wav').exists():
        clips = [json.loads(preview_record.read_text(encoding='utf-8')), *clips]
    data = {'speaker_id': speaker_id, 'age': '10岁', 'text': TEXT, 'clips': clips,
            'emotion_method': 'seed-audio-1.0 text_prompt with identical references.speaker',
            'voice_design_endpoint': BASE + 'voice_design', 'design_prompt': PROMPT}
    write(OUT / 'manifest.json', data)
    write(PUBLIC / 'manifest.json', data)
    cards = ''.join(f'<article><h2>{html.escape(c["label"])}</h2><audio controls preload="metadata" src="{c["src"]}"></audio><p>{html.escape(c["instruction"])}</p></article>' for c in clips)
    page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>音色设计 · 情绪测试</title><style>body{{margin:0;background:#faf5e5;color:#536449;font:16px/1.8 system-ui,sans-serif}}main{{max-width:720px;margin:auto;padding:24px 18px}}article,blockquote{{padding:20px;background:#fffbef;border:1px solid #d1d5b6;border-radius:24px 6px;margin:20px 0}}h1{{font-size:28px}}h2{{font-size:22px}}audio{{width:100%}}small{{font-size:14px;overflow-wrap:anywhere}}</style><main><h1>同一个她，不同的心情</h1><p>正式音色设计接口 · 10岁女儿 · 四种表达。台词相同，试听音量统一。</p><blockquote>{html.escape(TEXT)}</blockquote>{cards}<small>固定音色：{html.escape(speaker_id)}。设计原声来自官方设计试听；情绪小样通过音频生成提示词控制，均引用同一个音色 ID，未使用后期变调。</small></main><script>document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{{if(b!==a)b.pause()}})));</script></html>'''
    (PUBLIC / 'index.html').write_text(page, encoding='utf-8')


def main():
    if not CONFIG.exists():
        raise SystemExit('Missing configuration: copy the root voice-design example JSON and supply an unused purchased speaker_id. No API request sent.')
    config = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
    speaker_id = config.get('speaker_id', '').strip()
    if not speaker_id.startswith('S_') or not speaker_id.isascii() or '*' in speaker_id:
        raise SystemExit('Provide the actual purchased S_ speaker_id, not an example placeholder.')
    key = (ROOT / '\u97f3\u9891\u751f\u6210key.txt').read_text(encoding='utf-8-sig').strip()
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    state_file = OUT / 'design-state.json'
    if state_file.exists():
        state = json.loads(state_file.read_text(encoding='utf-8'))
        if state['speaker_id'] != speaker_id:
            raise SystemExit('Existing design belongs to another speaker; preserve it and use a new version directory.')
        if state['status'] == 'submitting':
            raise SystemExit('Design submission is uncertain. Query provider status before any new design request.')
        if state['status'] not in ('ready',):
            info = post('get_voice', {'speaker_id': speaker_id}, key, 'status-query')
            if info.get('status') not in (2, 4):
                raise SystemExit(f'Design not ready: status={info.get("status")}. No redesign submitted.')
            state['status'] = 'ready'
            state['provider_status'] = info.get('status')
            state['available_training_times'] = info.get('available_training_times')
            write(state_file, state)
    else:
        info = post('get_voice', {'speaker_id': speaker_id}, key, 'preflight-query')
        if info.get('status') != 0:
            raise SystemExit(f'Speaker is not unused (status={info.get("status")}); refusing to replace an existing voice.')
        write(state_file, {'speaker_id': speaker_id, 'status': 'submitting', 'prompt': PROMPT})
        info = post('voice_design', {'speaker_id': speaker_id, 'text': TEXT,
                    'prompt': {'text_prompt': PROMPT}, 'language': 0}, key, 'design')
        if isinstance(info.get('icl_list'), list):
            info = next((item for item in info['icl_list'] if item.get('speaker_id') == speaker_id), {})
        ready = info.get('status') in (2, 4)
        write(state_file, {'speaker_id': speaker_id, 'status': 'ready' if ready else 'pending',
                          'provider_status': info.get('status'), 'prompt': PROMPT,
                          'available_training_times': info.get('available_training_times')})
        if not ready:
            raise SystemExit('Design submitted, awaiting provider readiness. Next run queries status without redesigning.')
    clips = []
    for tone, label, instruction in EMOTIONS:
        name = 'ellie-design-' + tone
        clip_file = OUT / f'{name}.json'
        if clip_file.exists() and (PUBLIC / f'{name}.wav').exists():
            clips.append(json.loads(clip_file.read_text(encoding='utf-8')))
            continue
        payload = {'model': 'seed-audio-1.0', 'text_prompt':
                   f'使用@音频1的同一个女孩音色，保持音色身份和10岁年龄感。{instruction}只说下面的台词，不读说明，不添加内容，不要音乐、环境音或其他声音。\n{TEXT}',
                   'references': [{'speaker': speaker_id}],
                   'audio_config': {'format': 'wav', 'sample_rate': 24000, 'enable_subtitle': True}}
        print(f'Generating {tone} on the same designed speaker...', flush=True)
        response = post('create', payload, key, tone)
        if not response.get('audio'):
            raise SystemExit('No audio returned; inspect the saved response metadata.')
        clip = save_audio(name, base64.b64decode(response['audio'], validate=True))
        clip.update(label=label, instruction=instruction, speaker_id=speaker_id, subtitle=response.get('subtitle'))
        write(clip_file, clip)
        clips.append(clip)
    publish(speaker_id, clips)
    if (PUBLIC / 'index.html').exists():
        print('Preview: /' + (PUBLIC / 'index.html').relative_to(ROOT / 'public').as_posix())


if __name__ == '__main__':
    main()
