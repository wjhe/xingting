"""把交付的 AI 音乐整理成游戏运行文件。

读取 art-src/stargarden/audio/music-selection.json（每个曲目选用哪个候选），然后：
  - 背景音乐：响度标准化到约 -20 LUFS、真峰值 -2 dBTP，编码为 MP3（128 kbps 恒定码率；所有浏览器都能解码，含不带 AAC 的 VS Code 预览）；
  - 短乐句：交付的是整首曲子，自动在目标时长范围内找能量最低的位置剪断，末尾淡出，响度约 -16 LUFS；
  - 输出到 public/assets/stargarden/audio/music/<曲目>.mp3，并写 manifest.json 记录来源、剪切位置与响度。

用法：python scripts/stargarden-music-build.py            # 处理全部
      python scripts/stargarden-music-build.py --init     # 生成默认选曲清单（每个曲目取第一个候选）
      python scripts/stargarden-music-build.py --preview  # 另外导出全部候选的剪辑预览到 art-src（供试听页使用）
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import wave
from array import array

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'stargarden', 'audio', 'music-tests')
SELECTION = os.path.join(ROOT, 'art-src', 'stargarden', 'audio', 'music-selection.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'stargarden', 'audio', 'music')
PREVIEW = os.path.join(ROOT, 'art-src', 'stargarden', 'audio', 'music-review')


def find_ffmpeg() -> str:
    try:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


FF = find_ffmpeg()
# 短乐句目标时长（秒）：在此范围内找能量最低处剪断
JINGLES = {
    'jingle_victory': (3.0, 5.0), 'jingle_retreat': (3.0, 5.0), 'jingle_month_end': (2.5, 4.0),
    'jingle_letter': (2.0, 4.0), 'jingle_chapter': (3.0, 5.0), 'jingle_birthday': (5.0, 7.0),
    'jingle_festival_award': (5.0, 7.0), 'jingle_ending': (7.0, 10.0),
}
# 已从需求中移除、不进入游戏的曲目
RETIRED = {'bgm_title', 'jingle_newgame'}


def track_of(filename: str) -> str:
    return re.sub(r'_runninghub_\d+\.flac$', '', os.path.basename(filename))


def candidates() -> dict:
    found: dict = {}
    for f in sorted(glob.glob(os.path.join(SRC, '*_runninghub_*.flac'))):
        found.setdefault(track_of(f), []).append(os.path.basename(f))
    return found


def run(args: list) -> str:
    r = subprocess.run([FF, '-hide_banner', '-y', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-800:])
    return r.stderr


def quiet_cut(path: str, lo: float, hi: float) -> float:
    """解码前 hi+1 秒为单声道 PCM，在 [lo, hi] 内找 100 ms 窗口能量最低的位置。"""
    tmp = os.path.join(PREVIEW, '_scan.wav')
    os.makedirs(PREVIEW, exist_ok=True)
    run(['-i', path, '-t', str(hi + 1), '-ac', '1', '-ar', '8000', '-sample_fmt', 's16', tmp])
    with wave.open(tmp) as w:
        data = array('h', w.readframes(w.getnframes()))
    os.remove(tmp)
    win = 800  # 100 ms @ 8 kHz
    best, best_t = None, hi
    t = lo
    while t <= hi:
        i = int(t * 8000)
        chunk = data[i:i + win]
        if len(chunk) < win:
            break
        energy = sum(x * x for x in chunk) / win
        if best is None or energy < best:
            best, best_t = energy, t
        t += 0.05
    return round(best_t + 0.05, 2)


def loudness(path: str) -> float:
    err = run(['-i', path, '-af', 'ebur128', '-f', 'null', '-'])
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])


def encode(src: str, dst: str, jingle: tuple | None) -> dict:
    info: dict = {'source': os.path.relpath(src, ROOT).replace('\\', '/')}
    filters = []
    target = -20.0
    if jingle:
        cut = quiet_cut(src, *jingle)
        fade = 0.6 if cut < 5 else 0.9
        filters += [f'atrim=0:{cut}', f'afade=t=out:st={max(0, cut - fade)}:d={fade}']
        info['cut_seconds'] = cut
        target = -16.0
    # 两遍 loudnorm 的简化版：单遍线性模式足够用于成品音乐
    filters.append(f'loudnorm=I={target}:TP=-2:LRA=11')
    run(['-i', src, '-af', ','.join(filters), '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', '-id3v2_version', '0', dst])
    info['target_lufs'] = target
    info['measured_lufs'] = round(loudness(dst), 1)
    info['bytes'] = os.path.getsize(dst)
    return info


def main() -> int:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser()
    parser.add_argument('--init', action='store_true')
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    found = candidates()
    if args.init or not os.path.exists(SELECTION):
        selection = {track: files[0] for track, files in found.items() if track not in RETIRED}
        json.dump({'_说明': '每个曲目选用的候选文件（位于 music-tests/）。改完后运行 python scripts/stargarden-music-build.py', **selection},
                  open(SELECTION, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print('已生成默认选曲清单：', os.path.relpath(SELECTION, ROOT))
    selection = {k: v for k, v in json.load(open(SELECTION, encoding='utf-8')).items() if not k.startswith('_')}
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for track, file in selection.items():
        dst = os.path.join(OUT, f'{track}.mp3')
        manifest[track] = encode(os.path.join(SRC, file), dst, JINGLES.get(track))
        print(f"{track:24} {manifest[track]['bytes'] // 1024:5d} KB  {manifest[track]['measured_lufs']} LUFS"
              + (f"  剪到 {manifest[track]['cut_seconds']} 秒" if 'cut_seconds' in manifest[track] else ''))
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    if args.preview:
        os.makedirs(PREVIEW, exist_ok=True)
        review = {}
        for track, files in found.items():
            if track in RETIRED:
                continue
            review[track] = []
            for file in files:
                dst = os.path.join(PREVIEW, file.replace('.flac', '.mp3'))
                info = encode(os.path.join(SRC, file), dst, JINGLES.get(track))
                review[track].append({'file': file, 'preview': os.path.basename(dst), **{k: info[k] for k in ('measured_lufs', 'cut_seconds') if k in info}})
                print('预览', os.path.basename(dst))
        json.dump(review, open(os.path.join(PREVIEW, 'review.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
