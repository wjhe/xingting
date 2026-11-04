"""Publish existing neutral auditions for the three age stages; no API calls."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public/assets/stargarden/audio'
OUT = PUBLIC / 'voice-age-comparison-v1'
STAGES = [
    ('10—13岁 · 童年', 'voice-emotions-v2', 'neutral.json', '清亮、自然的童年声音'),
    ('14—15岁 · 少女', 'voice-emotions-teen-v1', 'neutral.json', '已设计的少女期声音'),
    ('16—18岁 · 成长', 'voice-grown-diagnosis-v1', 'explicit-age.json', '官方音色，采用明确17岁提示的修正版'),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    clips = []
    for label, folder, filename, note in STAGES:
        source = ROOT / 'art-src/stargarden/audio' / folder / filename
        clip = json.loads(source.read_text(encoding='utf-8'))
        if not (PUBLIC / folder / clip['src']).exists():
            raise SystemExit(f'Missing audio: {folder}')
        clips.append({'label': label, 'src': f'../{folder}/{clip["src"]}',
                      'speaker_id': clip['speaker_id'], 'duration': clip['duration'], 'note': note})
    (OUT / 'manifest.json').write_text(json.dumps({'text': '爸爸，你回来啦！我一直在等你。',
        'expression': 'neutral', 'clips': clips}, ensure_ascii=False, indent=2), encoding='utf-8')
    cards = ''.join(f'''<article><span class="number">0{i+1}</span><h2>{html.escape(c['label'])}</h2>
<p>{html.escape(c['note'])}</p><audio controls preload="metadata" src="{c['src']}"></audio>
<details><summary>音色信息</summary><small>{html.escape(c['speaker_id'])}</small></details></article>''' for i, c in enumerate(clips))
    page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>艾莉 · 三个年龄的声音</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#f7f3e6;color:#44543e;font:18px/1.65 system-ui,sans-serif}}main{{max-width:1080px;margin:auto;padding:28px 18px 48px}}h1{{font-size:30px;margin:0 0 12px}}h2{{font-size:24px;margin:5px 0}}p{{margin:8px 0 16px}}blockquote{{margin:24px 0;padding:18px;background:#e8edda;border-radius:18px}}.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}}article{{padding:22px 18px;background:#fffcf3;border-radius:24px 7px;min-width:0;border:2px solid transparent}}article.active{{border-color:#71865c;background:#f3f6e8}}article p{{font-size:16px;min-height:54px}}.number{{color:#8a9b76;font-size:15px;letter-spacing:3px}}audio{{display:block;width:100%;margin:20px 0}}button{{font:inherit;border:0;border-radius:18px;background:#657f50;color:white;padding:12px 20px;min-height:48px;cursor:pointer}}button.secondary{{background:#e5e8d9;color:#44543e}}.actions{{display:flex;gap:12px;flex-wrap:wrap}}#status{{min-height:30px;font-size:16px}}small{{font-size:14px;overflow-wrap:anywhere}}summary{{font-size:15px;cursor:pointer}}a{{color:#526e40}}@media(max-width:700px){{.grid{{grid-template-columns:1fr}}article p{{min-height:0}}}}</style>
<main><h1>艾莉 · 三个年龄的声音</h1><p>先比较平静表达，听年龄变化与声音是否连贯。三条均使用音频生成模型，没有后期变调。</p>
<blockquote>爸爸，你回来啦！我一直在等你。</blockquote><div class="actions"><button id="sequence">按年龄依次试听</button><button id="stop" class="secondary">全部停止</button></div><p id="status" role="status" aria-live="polite">也可以分别点击下方播放器。</p>
<div class="grid">{cards}</div><p style="margin-top:26px;font-size:16px">16—18岁另外保留了 <a href="../voice-grown-diagnosis-v1/index.html">官方 TTS 原声对照</a>，可检查修正版是否保留原音色。</p></main>
<script>const players=[...document.querySelectorAll('audio')],cards=[...document.querySelectorAll('article')],status=document.querySelector('#status');let sequence=false;
function stop(){{sequence=false;players.forEach(a=>a.pause());cards.forEach(c=>c.classList.remove('active'));status.textContent='已停止。';}}
async function playAt(i){{try{{players[i].currentTime=0;await players[i].play();}}catch(e){{stop();status.textContent='播放未开始，请直接点击对应播放器。';}}}}
players.forEach((a,i)=>{{a.addEventListener('play',()=>{{players.forEach(b=>{{if(b!==a)b.pause()}});cards.forEach((c,j)=>c.classList.toggle('active',i===j));status.textContent='正在试听：'+cards[i].querySelector('h2').textContent;}});a.addEventListener('ended',()=>{{cards[i].classList.remove('active');if(sequence&&i+1<players.length)playAt(i+1);else{{sequence=false;status.textContent='试听结束。';}}}});}});
document.querySelector('#sequence').onclick=()=>{{stop();sequence=true;playAt(0);}};document.querySelector('#stop').onclick=stop;
</script></html>'''
    (OUT / 'index.html').write_text(page, encoding='utf-8')
    print('http://localhost:5174/assets/stargarden/audio/voice-age-comparison-v1/index.html')


if __name__ == '__main__':
    main()
