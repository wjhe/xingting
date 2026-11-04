"""把 CC0 音效原件处理成游戏运行文件（public/assets/stargarden/audio/<名字>.ogg / .wav）。

原件保存在 art-src/stargarden/audio/sfx-sources/（含授权文件）。处理：去掉首尾静音、响度统一（RMS 目标）、
峰值上限、开头 2 ms / 结尾 15 ms 淡入淡出，输出 OGG Vorbis 和 16 位 WAV（不支持 OGG 的浏览器用 WAV）。
改映射后运行：python scripts/stargarden-sfx-build.py
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'stargarden', 'audio', 'sfx-sources')
OUT = os.path.join(ROOT, 'public', 'assets', 'stargarden', 'audio')
SR = 44100

# 游戏里的名字 -> (原件, 目标 RMS)。按钮类更轻，避免频繁点击时刺耳。
MAP = {
    'click': ('kenney-rpg-audio/handleSmallLeather.ogg', .035),
    'page': ('kenney-rpg-audio/bookFlip3.ogg', .03),
    'back': ('kenney-rpg-audio/bookClose.ogg', .04),
    'place': ('kenney-rpg-audio/bookPlace2.ogg', .045),
    'buy': ('kenney-rpg-audio/handleCoins2.ogg', .05),
    'dress': ('kenney-rpg-audio/cloth2.ogg', .05),
    'event': ('kenney-rpg-audio/bookOpen.ogg', .045),
}
PEAK_CAP = .7


def ffmpeg() -> str:
    try:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


FF = ffmpeg()


def load(path: str) -> np.ndarray:
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def process(x: np.ndarray, rms_target: float) -> np.ndarray:
    thr = np.max(np.abs(x)) * .02
    idx = np.where(np.abs(x) > thr)[0]
    x = x[max(0, idx[0] - int(.002 * SR)):idx[-1] + 1].copy()
    rms = float(np.sqrt(np.mean(x ** 2))) or 1e-6
    x *= rms_target / rms
    peak = float(np.max(np.abs(x)))
    if peak > PEAK_CAP:
        x *= PEAK_CAP / peak
    fade_in, fade_out = int(.002 * SR), min(int(.015 * SR), len(x) // 3)
    x[:fade_in] *= np.linspace(0, 1, fade_in)
    x[-fade_out:] *= np.linspace(1, 0, fade_out)
    return x


def main() -> int:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    record = {}
    for name, (src, rms) in MAP.items():
        x = process(load(os.path.join(SRC, src)), rms)
        wav = os.path.join(OUT, f'{name}.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
        subprocess.run([FF, '-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '5', os.path.join(OUT, f'{name}.ogg')], check=True)
        record[name] = {'source': src, 'ms': round(len(x) / SR * 1000), 'rms': rms, 'peak': round(float(np.max(np.abs(x))), 2)}
        print(f"{name:6} <- {src:42} {record[name]['ms']:4d} ms  peak {record[name]['peak']}")
    path = os.path.join(OUT, 'sources.json')
    data = json.load(open(path, encoding='utf-8'))
    data['ui_2026_11_05'] = {
        'note': '按钮类音效改用 Kenney RPG Audio（CC0），原 Interface Sounds 版本备份在 art-src/stargarden/audio/sfx-previous/',
        'packs': {'kenney-rpg-audio': 'https://opengameart.org/content/50-rpg-sound-effects (CC0, Kenney Vleugels)',
                  'kenney-ui-sfx': 'https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks (CC0, Kenney Vleugels，备选)'},
        'downloaded': '2026-11-05',
        'processing': 'trim silence; RMS target per sound; peak cap 0.7; 2 ms fade-in, 15 ms fade-out; mono 44.1 kHz; OGG Vorbis q5 + PCM16 WAV',
        'files': record,
    }
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
