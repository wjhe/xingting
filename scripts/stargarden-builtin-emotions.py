"""Test native TTS 2.0 context_texts on the user's selected built-in voice."""
import base64
import importlib.util
import json
from pathlib import Path
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('voice_design_helpers', ROOT / 'scripts/stargarden-voice-design-test.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
OUT = ROOT / 'art-src/stargarden/audio/builtin-emotions-v1'
PUBLIC = ROOT / 'public/assets/stargarden/audio/builtin-emotions-v1'
helpers.OUT, helpers.PUBLIC = OUT, PUBLIC
SPEAKER = 'zh_female_vv_uranus_bigtts'
API = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    key = (ROOT / '\u97f3\u9891\u751f\u6210key.txt').read_text(encoding='utf-8-sig').strip()
    clips = []
    for tone, label, instruction in helpers.EMOTIONS:
        name = 'builtin-' + tone
        path = OUT / f'{name}.json'
        if path.exists() and (PUBLIC / f'{name}.wav').exists():
            clips.append(json.loads(path.read_text(encoding='utf-8')))
            continue
        # context_texts is a documented additions field for built-in TTS 2.0 voices.
        payload = {'req_params': {'text': helpers.TEXT, 'speaker': SPEAKER,
                   'audio_params': {'format': 'mp3', 'sample_rate': 24000, 'bit_rate': 160000}}}
        if instruction:
            payload['req_params']['additions'] = json.dumps({'context_texts': [instruction]}, ensure_ascii=False)
        request_id = str(uuid.uuid4())
        record = {'endpoint': API, 'resource_id': 'seed-tts-2.0', 'speaker_id': SPEAKER,
                  'request_id': request_id, 'request': payload, 'status': 'submitted'}
        log_path = OUT / f'{name}-request.json'
        helpers.write(log_path, record)
        request = urllib.request.Request(API, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'X-Api-Key': key,
                     'X-Api-Resource-Id': 'seed-tts-2.0', 'X-Api-Request-Id': request_id}, method='POST')
        print(f'{tone}: synthesizing built-in voice with native emotion instruction...', flush=True)
        try:
            pieces = []
            events = []
            with urllib.request.urlopen(request, timeout=180) as response:
                record['provider_log_id'] = response.headers.get('X-Tt-Logid')
                for line in response:
                    if not line.strip():
                        continue
                    event = json.loads(line)
                    events.append({k: v for k, v in event.items() if k != 'data'})
                    if event.get('code') not in (None, 0, 20000000):
                        record.update(status='failed', provider_code=event.get('code'),
                                      message=str(event.get('message', '')).replace(key, '[REDACTED]')[:1000])
                        helpers.write(log_path, record)
                        raise SystemExit(f"Provider code {event.get('code')}; no retry. See {log_path.name}.")
                    if event.get('data'):
                        pieces.append(base64.b64decode(event['data'], validate=True))
            if not pieces:
                raise ValueError('No audio returned.')
            binary = b''.join(pieces)
            (OUT / f'{name}.mp3').write_bytes(binary)
            clip = helpers.save_audio(name, binary)
            clip.update(label=label, instruction=instruction, speaker_id=SPEAKER)
            helpers.write(path, clip)
            record.update(status='complete', events=events, audio=clip)
            helpers.write(log_path, record)
            clips.append(clip)
            print(f"{tone}: saved {clip['duration']:.2f}s", flush=True)
        except urllib.error.HTTPError as error:
            record.update(status='failed', http_status=error.code, provider_log_id=error.headers.get('X-Tt-Logid'))
            try:
                detail = json.loads(error.read())
                record.update(provider_code=detail.get('code'), message=str(detail.get('message', '')).replace(key, '[REDACTED]')[:1000])
            except (ValueError, UnicodeError):
                pass
            helpers.write(log_path, record)
            raise SystemExit(f'HTTP {error.code}; no retry. See {log_path.name}.')
    # Reuse the audition layout, clearly relabel it as built-in TTS rather than design.
    helpers.publish(SPEAKER, clips)
    manifest = json.loads((PUBLIC / 'manifest.json').read_text(encoding='utf-8'))
    manifest.update(age=None, voice_design_endpoint=None, design_prompt=None,
                    voice_source='user_selected_builtin', emotion_method='TTS 2.0 additions.context_texts',
                    synthesis_endpoint=API)
    helpers.write(PUBLIC / 'manifest.json', manifest)
    helpers.write(OUT / 'manifest.json', manifest)
    page = (PUBLIC / 'index.html').read_text(encoding='utf-8')
    page = page.replace('音色设计 · 情绪测试', '内置音色 · 情绪测试').replace(
        '正式音色设计接口 · 10岁女儿 · 四种表达。台词相同，试听音量统一。',
        '你提供的豆包内置音色 · 四种表达。台词相同，试听音量统一。这是情绪控制测试，未设计新的女儿音色。').replace(
        '情绪通过音频生成提示词控制；每条都引用同一个音色 ID，未使用后期变调。',
        '情绪通过 TTS 2.0 的 context_texts 语音指令控制；音色 ID 始终相同，未使用后期变调。')
    (PUBLIC / 'index.html').write_text(page, encoding='utf-8')
    print('Preview: /assets/stargarden/audio/builtin-emotions-v1/index.html')


if __name__ == '__main__':
    main()
