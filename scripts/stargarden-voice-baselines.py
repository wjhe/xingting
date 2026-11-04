"""Create three immutable age-specific voice candidates and a local audition page.

Preserve the initial referenced candidates, then design older voices separately
because initial references retained almost identical median pitch across ages.
No voice ID is registered or assumed; approval precedes production use.
"""
import base64
import datetime
import hashlib
import html
import json
from pathlib import Path
import shutil
import sys
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools/audio-python'))
import soundfile as sf

API = 'https://openspeech.bytedance.com/api/v3/tts/create'
OUT = ROOT / 'art-src/stargarden/audio/voice-baselines-v1'
PUBLIC = ROOT / 'public/assets/stargarden/audio/voice-baselines-v1'
LINE = '今天的阳光很好。我想把窗边的花画下来，等画好了，就拿给你看。谢谢你一直陪着我。'
AGES = [
    ('child', '10—13 岁', '10岁女孩，声音清亮、轻软，带自然童真。发音清楚，语气平静亲切，略带好奇。不要夸张幼儿腔、捏嗓子、撒娇腔或婴儿声。'),
    ('teen', '14—15 岁', '14岁少女，清澈的少女中高音，已经告别童声，声线比10岁儿童明显更沉稳，气息更稳定，咬字更利落。以自然中音区说话，不刻意抬高声线，保留柔和清亮的质地。语气平静亲切，有一点含蓄和自己的想法。不要幼儿腔、娃娃音、撒娇感、假声或成熟御姐腔。'),
    ('grown', '16—18 岁', '17岁少女，温柔清澈的年轻女性中音声线，声音位置自然放松，胸腔共鸣比女孩更充实，音高明显低于儿童，尾音稳而干净。语气平静亲切、从容而有主见，有温暖真实的生活感。不要刻意抬高声线，不要幼儿腔、娃娃音、气泡音、低沉中年声或夸张播音腔。'),
]


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def describe_audio(path):
    samples, rate = sf.read(path, always_2d=True)
    duration = len(samples) / rate
    peak = float(abs(samples).max()) if len(samples) else 0
    rms = float((samples * samples).mean() ** .5) if len(samples) else 0
    if duration < 2 or duration > 30 or peak < .01 or rms < .001:
        raise ValueError('Unexpected baseline duration or silent audio; review before use.')
    return {'duration_seconds': duration, 'sample_rate': rate, 'channels': samples.shape[1],
            'peak': peak, 'rms': rms, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def generate(age, label, direction, key):
    name = f"ellie-{age}-neutral-{'v1' if age == 'child' else 'v2'}"
    target = OUT / f'{name}.wav'
    metadata = OUT / f'{name}.json'
    if target.exists():
        describe_audio(target)
        shutil.copy2(target, PUBLIC / target.name)
        print(f'{name}: existing baseline preserved', flush=True)
        return json.loads(metadata.read_text(encoding='utf-8'))
    reference = None
    prompt = ('请为原创养成游戏中的女儿艾莉生成一条干净的普通话角色配音，只念指定台词，不要念说明。'
              '这是中性语气的音色基准测试，不是情绪表演。清新自然的日常说话方式，'
              '标准普通话，清楚柔和的咬字，轻柔不气虚，语速中等，正常短句停顿。'
              + direction)
    references = []
    ref_info = []
    if reference:
        info = describe_audio(reference)
        prompt += ('参考@音频1里同一个女孩的普通话口音、柔和咬字和说话习惯，'
                   '表现她自然长大后的声音，按上面指定的年龄改变声线成熟度，'
                   '不要直接复制童年音高，也不要改变成另一位角色。')
        references = [{'audio_data': base64.b64encode(reference.read_bytes()).decode('ascii')}]
        ref_info = [{'file': reference.relative_to(ROOT).as_posix(), 'sha256': info['sha256']}]
    prompt += ('全程只有一位女孩的干净人声，不要音乐、环境音、音效、歌唱、旁白或第二个人说话。'
               '不要在前后加台词。完整朗读以下文字，读完自然结束，不要补齐静音时长：\n' + LINE)
    payload = {'model': 'seed-audio-1.0', 'text_prompt': prompt,
               'audio_config': {'format': 'wav', 'sample_rate': 24000, 'enable_subtitle': True}}
    if references:
        payload['references'] = references
    request_id = str(uuid.uuid4())
    record = {'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'id': name, 'age': age, 'age_label': label, 'tone': 'neutral',
              'text': LINE, 'direction': direction, 'approval': 'pending',
              'voice_identity_method': 'text_design' if reference is None else 'synthetic_audio_reference',
              'speaker_id': None, 'endpoint': API, 'request_id': request_id,
              'request': {k: v for k, v in payload.items() if k != 'references'},
              'references': ref_info, 'status': 'prepared'}
    write_json(metadata, record)
    print(f'{name}: generating one baseline...', flush=True)
    request = urllib.request.Request(API, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'X-Api-Key': key, 'X-Api-Request-Id': request_id}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.load(response)
            record['provider_log_id'] = response.headers.get('X-Tt-Logid')
        if not data.get('audio'):
            record['provider_code'] = data.get('code')
            record['message'] = str(data.get('message', 'No audio returned')).replace(key, '[REDACTED]')[:1200]
            raise ValueError('Provider returned no audio.')
        target.write_bytes(base64.b64decode(data['audio'], validate=True))
        record['audio'] = describe_audio(target)
        record.update(status='complete', duration=data.get('duration'), original_duration=data.get('original_duration'),
                      subtitle=data.get('subtitle'), output=target.relative_to(ROOT).as_posix())
        shutil.copy2(target, PUBLIC / target.name)
        write_json(metadata, record)
        print(f"{name}: saved {record['audio']['duration_seconds']:.2f}s", flush=True)
        return record
    except urllib.error.HTTPError as error:
        record.update(status='failed', http_status=error.code, provider_log_id=error.headers.get('X-Tt-Logid'))
        try:
            body = json.loads(error.read())
            record['provider_code'] = body.get('code')
            record['message'] = str(body.get('message', '')).replace(key, '[REDACTED]')[:1200]
        except (ValueError, UnicodeError):
            pass
        write_json(metadata, record)
        raise SystemExit(f'HTTP {error.code}; sanitized detail saved in {metadata.name}. No automatic retry.')
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        record.update(status='failed', error_type=type(error).__name__)
        write_json(metadata, record)
        raise SystemExit(f'{type(error).__name__}; review {metadata.name}. No automatic retry.')


def audition_page(records):
    previews = {}
    for r in records:
        source = OUT / (r['id'] + '.wav')
        samples, rate = sf.read(source, always_2d=True)
        rms = float((samples * samples).mean() ** .5)
        peak = float(abs(samples).max())
        gain = min(.065 / max(rms, 1e-9), .85 / max(peak, 1e-9))
        preview = PUBLIC / source.name
        sf.write(preview, samples * gain, rate, subtype='PCM_16')
        previews[r['id']] = {'gain': gain, 'target_rms': .065,
                             'preview_sha256': hashlib.sha256(preview.read_bytes()).hexdigest()}
    manifest = {'title': '艾莉 · 三个年龄的基准音色', 'status': 'audition_pending_approval',
                'text': LINE, 'samples': [{'id': r['id'], 'age': r['age_label'], 'direction': r['direction'],
                'src': r['id'] + '.wav', 'duration': r['audio']['duration_seconds'],
                'source_sha256': r['audio']['sha256'], 'preview': previews[r['id']]} for r in records]}
    write_json(OUT / 'manifest.json', manifest)
    write_json(PUBLIC / 'manifest.json', manifest)
    cards = ''.join(f'''<article><span class="age">{html.escape(r['age_label'])}</span>
      <h2>{html.escape({'child':'童年 · 清亮自然','teen':'成长 · 清澈含蓄','grown':'将来 · 温柔从容'}[r['age']])}</h2>
      <p>{html.escape(r['direction'])}</p>
      <audio controls preload="metadata" src="{r['id']}.wav"></audio>
      <a href="{r['id']}.wav" download>下载 WAV · {r['audio']['duration_seconds']:.1f} 秒</a></article>''' for r in records)
    page = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>艾莉的声音 · 音色试听</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#f7f3e5;color:#4f6047;font:16px/1.8 system-ui,sans-serif}}main{{max-width:760px;margin:auto;padding:28px 18px 48px}}h1{{font-size:28px;font-weight:600;line-height:1.5}}.intro{{color:#73755e}}blockquote{{margin:24px 0;padding:18px 20px;background:#e8edda;border-radius:22px 5px;border-left:3px solid #a8b78a}}article{{margin:20px 0;padding:22px;background:#fffbed;border:1px solid #d4d7b9;border-radius:24px 7px}}h2{{font-size:22px;margin:8px 0}}article p{{color:#73755e}}.age{{font-size:15px;color:#8b956d}}audio{{display:block;width:100%;margin:16px 0}}a{{display:inline-block;color:#557146;min-height:44px;padding:6px 0}}footer{{color:#7c7a64;font-size:14px}}button{{font:inherit;padding:12px 20px;border:0;border-radius:22px 6px;background:#7d9566;color:#fffbed;min-height:48px}}button:focus-visible,a:focus-visible{{outline:3px solid #a5b981;outline-offset:3px}}</style></head>
<body><main><p class="age">星庭物语 · 女儿配音测试</p><h1>同一个她，慢慢长大的声音</h1>
<p class="intro">三个年龄用同一句台词、平静亲切的语气，试听音量已统一。重点比较年龄差异、自然程度，以及是否像同一个女孩逐渐长大。</p>
<blockquote>{html.escape(LINE)}</blockquote><button id="sequence">依次试听三个年龄</button><p id="status" aria-live="polite"></p>{cards}
<footer>当前为待确认的基准小样，尚未注册固定音色 ID。三个阶段分别设计，保留清楚、柔和的普通话表达，重点拉开年龄成熟度。选定后固定参考原文件与校验值，再生成情绪和剧情台词。第一轮引用童年声音的候选也已保留在源素材目录。</footer>
</main><script>const audios=[...document.querySelectorAll('audio')];let sequence=false;
const status=document.querySelector('#status');
audios.forEach((audio,i)=>{{audio.addEventListener('play',()=>{{audios.forEach(other=>{{if(other!==audio)other.pause()}});status.textContent='正在试听：'+audio.closest('article').querySelector('h2').textContent}});audio.addEventListener('ended',()=>{{if(sequence&&i<audios.length-1){{audios[i+1].currentTime=0;audios[i+1].play().catch(()=>{{sequence=false;status.textContent='请点击下一条音频继续试听'}})}}else{{sequence=false;status.textContent='试听完成'}}}});audio.addEventListener('error',()=>{{status.textContent='音频加载失败，请刷新或下载 WAV 试听'}})}});
document.querySelector('#sequence').addEventListener('click',()=>{{sequence=true;audios.forEach(a=>a.pause());audios[0].currentTime=0;audios[0].play().catch(()=>{{sequence=false;status.textContent='请点击音频播放器试听'}})}});
</script></body></html>'''
    (PUBLIC / 'index.html').write_text(page, encoding='utf-8')
    print('Audition page: /assets/stargarden/audio/voice-baselines-v1/index.html')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    key = (ROOT / '\u97f3\u9891\u751f\u6210key.txt').read_text(encoding='utf-8-sig').strip()
    if not key or any(c.isspace() for c in key):
        raise SystemExit('Key file must contain a single API key.')
    records = [generate(age, label, direction, key) for age, label, direction in AGES]
    audition_page(records)


if __name__ == '__main__':
    main()
