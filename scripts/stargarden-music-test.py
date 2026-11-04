"""Generate one music audition through the user-selected Volcengine API."""
import base64
import datetime
import json
from pathlib import Path
import shutil
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
API = 'https://openspeech.bytedance.com/api/v3/tts/create'
OUT = ROOT / 'art-src/stargarden/audio/music-tests'
PUBLIC = ROOT / 'public/assets/stargarden/audio/music-tests'
NAME = 'home-bright-v1'
PROMPT = (
    '生成一段约30秒的纯器乐游戏背景音乐，用于原创温馨少女成长养成游戏的主界面。'
    '明亮、干净、清新、温柔而有希望，像春日阳光洒进窗边的小屋。'
    '轻盈的三拍子，速度约每分钟88拍；以温暖柔和的原声钢琴演奏简洁悦耳、容易记住的主旋律，'
    '木吉他轻柔分解和弦，长笛在乐句之间轻声回应，少量轻盈的钟琴点缀。'
    '编曲疏朗，音量平稳，适合在游戏中长时间聆听，不要喧宾夺主。'
    '开头直接进入轻柔旋律，最后一小节回到开头的和声，尽量适合循环，不要突然截断。'
    '全程只有音乐，不要人声、歌唱、歌词、对白、念白、环境音或音效；'
    '不要鼓点轰鸣、强烈低音、电子舞曲或史诗管弦乐。'
)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f'{NAME}.mp3'
    if target.exists():
        print('Existing audition retained:', target.relative_to(ROOT).as_posix())
        return
    key = (ROOT / '\u97f3\u9891\u751f\u6210key.txt').read_text(encoding='utf-8-sig').strip()
    if not key or '\n' in key or '\r' in key:
        raise SystemExit('Key file must contain one API key only.')
    request_id = str(uuid.uuid4())
    payload = {'model': 'seed-audio-1.0', 'text_prompt': PROMPT,
               'audio_config': {'format': 'mp3', 'sample_rate': 44100}}
    record = {'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'provider': 'Volcengine', 'endpoint': API, 'request_id': request_id,
              'request': payload, 'status': 'prepared'}
    metadata = OUT / f'{NAME}.json'

    def save_record():
        metadata.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')

    save_record()
    request = urllib.request.Request(API, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
                                     headers={'Content-Type': 'application/json', 'X-Api-Key': key,
                                              'X-Api-Request-Id': request_id}, method='POST')
    print('Requesting one 30-second music audition...', flush=True)
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.load(response)
            record['provider_log_id'] = response.headers.get('X-Tt-Logid')
        if not data.get('audio'):
            record.update(status='failed', provider_code=data.get('code'),
                          message=str(data.get('message', 'No audio returned')).replace(key, '[REDACTED]'))
            save_record()
            raise SystemExit(f"Provider returned no audio; code={data.get('code')}. See audition metadata.")
        audio = base64.b64decode(data['audio'], validate=True)
        if len(audio) < 1024:
            raise ValueError('Returned audio is unexpectedly short.')
        target.write_bytes(audio)
        PUBLIC.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, PUBLIC / target.name)
        record.update(status='complete', duration=data.get('duration'),
                      original_duration=data.get('original_duration'), bytes=len(audio),
                      output=target.relative_to(ROOT).as_posix(),
                      preview=(PUBLIC / target.name).relative_to(ROOT).as_posix())
        save_record()
        print(json.dumps({k: record[k] for k in ['status', 'duration', 'original_duration', 'bytes', 'output']}, ensure_ascii=False))
    except urllib.error.HTTPError as error:
        record.update(status='failed', http_status=error.code,
                      provider_log_id=error.headers.get('X-Tt-Logid'))
        try:
            body = json.loads(error.read())
            record['provider_code'] = body.get('code')
            record['message'] = str(body.get('message', body.get('error', ''))).replace(key, '[REDACTED]')[:1200]
        except (ValueError, UnicodeError):
            pass
        save_record()
        raise SystemExit(f'HTTP {error.code}; see sanitized audition metadata.')
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        record.update(status='failed', error_type=type(error).__name__)
        save_record()
        raise SystemExit(f'{type(error).__name__}; no retry was submitted.')


if __name__ == '__main__':
    main()
