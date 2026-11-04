"""
素材处理：把 art-src/ 里 AI 生成的原图、原音频按规格裁剪压缩到 public/assets/，
并生成素材清单 src/data/assets.json（游戏启动时按清单加载，没有的素材用程序画的替代）。

用法：npm run assets
需求文档：docs/美术与音频需求.md
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'public' / 'assets'
MANIFEST = ROOT / 'src' / 'data' / 'assets.json'
IMG_EXT = ('.png', '.jpg', '.jpeg', '.webp')

BGM = ['title', 'town', 'wild', 'fate', 'immortal', 'danger', 'tribulation', 'cave']
SFX = ['click', 'tab', 'item', 'coin', 'travel', 'hit', 'win', 'breakthrough', 'fail', 'death']
BGM_MAX_KB = 2500
SFX_MAX_KB = 100
AUDIO_EXT = ('.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac')
# npm 安装的 ffmpeg（ffmpeg-static），用来转码和统一音量
FFMPEG = ROOT / 'node_modules' / 'ffmpeg-static' / ('ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg')
# 背景音乐：96kbps 立体声，统一到 -16 LUFS；音效：96kbps，按峰值统一到 -3 dB（见 to_mp3）
AUDIO_SPEC = {'bgm': ('96k', -16), 'sfx': ('96k', -14)}


def to_mp3(src: Path, dst: Path, kind: str, warnings):
    """转成 mp3：去掉首尾静音、统一响度、首尾加极短淡入淡出防爆音。"""
    if not FFMPEG.exists():
        warnings.append(f'{src.name}：找不到 ffmpeg，先运行 npm install')
        return
    bitrate, lufs = AUDIO_SPEC[kind]
    if kind == 'sfx':
        # 音效很短，loudnorm（需要约 3 秒样本）会失真；改为去掉首尾静音后按峰值放大到 -3 dB
        trim = 'silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse'
        probe = subprocess.run([str(FFMPEG), '-hide_banner', '-i', str(src), '-af', f'{trim},volumedetect', '-f', 'null', '-'],
                               capture_output=True, text=True, encoding='utf-8', errors='replace')
        m = re.search(r'max_volume: (-?[\d.]+) dB', probe.stderr)
        gain = -3.0 - float(m.group(1)) if m else 0.0
        chain = f'{trim},volume={gain:.1f}dB,afade=t=in:d=0.005'
    else:
        trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse'
        chain = f'{trim},loudnorm=I={lufs}:TP=-1.5:LRA=11,afade=t=in:d=0.03'
    cmd = [str(FFMPEG), '-y', '-hide_banner', '-loglevel', 'error', '-i', str(src), '-af', chain,
           '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', bitrate, str(dst)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        warnings.append(f'{src.name}：转码失败 {r.stderr.strip()[:200]}')


def prompt_ids(category):
    """插图类素材的清单以提示词文件为准"""
    spec = json.loads((SRC / 'prompts.json').read_text(encoding='utf-8'))
    return [i['id'] for i in spec['categories'].get(category, {}).get('items', [])]


def load_ids():
    # 共用图标的物品（如丹方）只需要一张图
    items = list(dict.fromkeys(i.get('icon', i['id']) for i in json.loads((ROOT / 'src/data/items.json').read_text(encoding='utf-8'))))
    endings = [e['id'] for e in json.loads((ROOT / 'src/data/endings.json').read_text(encoding='utf-8'))]
    regions = re.findall(r"\{ id: '(\w+)'", (ROOT / 'src/core/regions.ts').read_text(encoding='utf-8'))
    return items, endings, regions


def find_src(folder: Path, name: str, exts):
    for ext in exts:
        p = folder / f'{name}{ext}'
        if p.exists():
            return p
    return None


# 改了压缩参数后加 --force，全部重新生成
FORCE = '--force' in sys.argv


def fresh(src: Path, dst: Path) -> bool:
    """输出比原图新就跳过，避免每次都重新压缩"""
    return not FORCE and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime


def crop_ratio(img: Image.Image, ratio: float, anchor: str = 'center') -> Image.Image:
    """裁成指定宽高比；anchor 为 bottom 时保留底部"""
    w, h = img.size
    if w / h > ratio:
        nw = int(h * ratio)
        return img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = int(w / ratio)
    top = h - nh if anchor == 'bottom' else (h - nh) // 2
    return img.crop((0, top, w, top + nh))


def to_jpg(src, dst, size, ratio, warnings, anchor='center'):
    img = Image.open(src).convert('RGB')
    if img.width < size[0] * 0.8:
        warnings.append(f'{src.name}：原图宽 {img.width}px，偏小，放大后会模糊（建议 {size[0]}px 以上）')
    img = crop_ratio(img, ratio, anchor).resize(size, Image.LANCZOS)
    # 轻微柔化宣纸的细碎纹理：水墨画看不出差别，JPG 能小三成以上
    img = img.filter(ImageFilter.GaussianBlur(0.35))
    img.save(dst, 'JPEG', quality=75, optimize=True, progressive=True)


def save_png(img, dst):
    """PNG 统一转 256 色调色板（带透明），体积约为真彩色的五分之一，水墨画面看不出差别"""
    img.convert('RGBA').quantize(256, method=Image.FASTOCTREE).save(dst, 'PNG', optimize=True)


def to_icon(src, dst, warnings, S=128, shrink=0.78):
    """裁成正方形 → 圆形透明遮罩（边缘柔化）"""
    img = Image.open(src).convert('RGB')
    if min(img.size) < 256:
        warnings.append(f'{src.name}：原图 {img.size[0]}px，偏小（建议 512px 以上）')
    img = crop_ratio(img, 1)
    # 先整体缩到 78% 放回原尺寸的画布中央，边缘用原图角落的纸色填充，
    # 这样斜放的剑等长物件裁成圆形后也不会被切掉两头
    paper = img.getpixel((4, 4))
    canvas = Image.new('RGB', img.size, paper)
    inner = img.resize((int(img.width * shrink), int(img.height * shrink)), Image.LANCZOS)
    # 贴图边缘羽化，避免出现方形接缝
    feather = Image.new('L', inner.size, 0)
    m = int(inner.width * 0.06)
    ImageDraw.Draw(feather).rectangle((m, m, inner.width - m, inner.height - m), fill=255)
    feather = feather.filter(ImageFilter.GaussianBlur(m * 0.6))
    canvas.paste(inner, ((img.width - inner.width) // 2, (img.height - inner.height) // 2), feather)
    img = canvas.resize((S * 4, S * 4), Image.LANCZOS)
    mask = Image.new('L', (S * 4, S * 4), 0)
    ImageDraw.Draw(mask).ellipse((8, 8, S * 4 - 8, S * 4 - 8), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(6))
    img.putalpha(mask)
    save_png(img.resize((S, S), Image.LANCZOS), dst)


def to_mono(src, dst, warnings, width, square=False, pad=0.06):
    """白底黑墨的界面元素 → 白色透明底（游戏里按主题着色），裁到墨迹范围"""
    gray = ImageOps.grayscale(Image.open(src))
    alpha = gray.point(lambda v: max(0, min(255, int((235 - v) * 1.4))))
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        warnings.append(f'{src.name}：没识别到墨迹，请用白底黑墨')
        return
    l, t, r, b = bbox
    if square:
        side = max(r - l, b - t)
        cx, cy = (l + r) // 2, (t + b) // 2
        l, t, r, b = cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2
    m = int(max(r - l, b - t) * pad)
    box = (l - m, t - m, r + m, b + m)
    # 允许超出原图边界（补透明）
    canvas = Image.new('L', (box[2] - box[0], box[3] - box[1]), 0)
    canvas.paste(alpha.crop((max(0, box[0]), max(0, box[1]), min(gray.width, box[2]), min(gray.height, box[3]))),
                 (max(0, -box[0]), max(0, -box[1])))
    out = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
    out.putalpha(canvas)
    out = out.resize((width, int(out.height * width / out.width)), Image.LANCZOS)
    save_png(out, dst)


def to_title(src, dst, warnings):
    """白底黑字 → 白字透明底（游戏里按主题着色）"""
    gray = ImageOps.grayscale(Image.open(src))
    # 越黑越不透明；提高对比度去掉纸面杂色
    alpha = gray.point(lambda v: max(0, min(255, int((235 - v) * 1.4))))
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        warnings.append(f'{src.name}：没识别到字迹，请用白底黑字')
        return
    pad = 24
    alpha = alpha.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(gray.width, bbox[2] + pad), min(gray.height, bbox[3] + pad)))
    out = Image.new('RGBA', alpha.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    if out.width > 900:
        out = out.resize((900, int(out.height * 900 / out.width)), Image.LANCZOS)
    save_png(out, dst)


def main():
    items, endings, regions = load_ids()
    manifest = {'images': {}, 'audio': {}}
    warnings = []
    report = []

    # 尺寸取舍：插图大多以设计稿宽度（750）显示，主流手机约放大 1.5 倍；水墨画放大略软也不影响观感
    jobs = [
        # (分类名, 原图文件夹, id 列表, 输出文件夹, 输出扩展名, 处理函数, 清单 key 前缀)
        ('区域插图', 'regions', regions, 'regions', '.jpg', lambda s, d: to_jpg(s, d, (940, 529), 16 / 9, warnings), 'region_'),
        ('结局插图', 'endings', endings, 'endings', '.jpg', lambda s, d: to_jpg(s, d, (640, 853), 3 / 4, warnings), ''),
        ('物品图标', 'icons', items, 'icons', '.png', lambda s, d: to_icon(s, d, warnings), 'icon_'),
        ('标题书法', 'ui', ['title'], 'ui', '.png', lambda s, d: to_title(s, d, warnings), ''),
        # 事件插图：日志里的横幅
        ('事件插图', 'vignettes', prompt_ids('vignettes'), 'art', '.jpg', lambda s, d: to_jpg(s, d, (860, 374), 23 / 10, warnings), 'art_'),
        # 境界、死亡、轮回：转场插图
        ('境界插图', 'realms', prompt_ids('realms'), 'realms', '.jpg', lambda s, d: to_jpg(s, d, (760, 507), 3 / 2, warnings), ''),
        ('开局主视觉', 'ui', prompt_ids('cover'), 'ui', '.jpg', lambda s, d: to_jpg(s, d, (640, 960), 2 / 3, warnings), ''),
        # 加载页铺满全屏，比开局主视觉显示得大，分辨率给高一些
        ('加载页主视觉', 'ui', prompt_ids('boot'), 'ui', '.jpg', lambda s, d: to_jpg(s, d, (860, 1290), 2 / 3, warnings), ''),
        ('界面图标', 'ui_icons', prompt_ids('ui_icons'), 'ui', '.png', lambda s, d: to_mono(s, d, warnings, 128, square=True), 'ui_'),
        ('界面框饰', 'ui_frames', prompt_ids('ui_frames'), 'ui', '.png', lambda s, d: to_mono(s, d, warnings, 600, pad=0.0), 'ui_'),
        ('题头水墨', 'ui_paint', prompt_ids('ui_paint'), 'ui', '.jpg', lambda s, d: to_jpg(s, d, (940, 313), 3, warnings, anchor='bottom'), 'ui_'),
        ('敌人立绘', 'enemies', prompt_ids('enemies'), 'enemies', '.jpg', lambda s, d: to_jpg(s, d, (400, 400), 1, warnings), 'enemy_'),
        ('角色立绘', 'portraits', prompt_ids('portraits'), 'portraits', '.png', lambda s, d: to_icon(s, d, warnings, 256, shrink=1.0), 'portrait_'),
    ]
    # 同一个原图文件夹可能被多类素材共用（如 ui 里的标题和主视觉），文件名检查要合并后再做
    known: dict[str, set] = {}
    for label, folder, ids, out_folder, ext, fn, prefix in jobs:
        known.setdefault(folder, set()).update(ids)
        (OUT / out_folder).mkdir(parents=True, exist_ok=True)
        done, missing = 0, []
        for i in ids:
            src = find_src(SRC / folder, i, IMG_EXT)
            dst = OUT / out_folder / f'{i}{ext}'
            if not src:
                missing.append(i)
                if dst.exists():
                    dst.unlink()  # 原图删了，输出也清掉
                continue
            if not fresh(src, dst):
                fn(src, dst)
            if dst.exists():
                manifest['images'][f'{prefix}{i}'] = f'assets/{out_folder}/{i}{ext}'
                done += 1
        report.append((label, done, len(ids), missing))
    for folder, ids in known.items():
        check_unknown(SRC / folder, ids, IMG_EXT, warnings)

    for label, folder, ids, max_kb in [('背景音乐', 'bgm', BGM, BGM_MAX_KB), ('音效', 'sfx', SFX, SFX_MAX_KB)]:
        out = OUT / 'audio' / folder
        out.mkdir(parents=True, exist_ok=True)
        done, missing = 0, []
        for i in ids:
            src = find_src(SRC / 'audio' / folder, i, AUDIO_EXT)
            dst = out / f'{i}.mp3'
            if not src:
                missing.append(i)
                if dst.exists():
                    dst.unlink()
                continue
            if not fresh(src, dst):
                to_mp3(src, dst, folder, warnings)
            if not dst.exists():
                continue
            kb = dst.stat().st_size / 1024
            if kb > max_kb:
                warnings.append(f'{folder}/{dst.name}：处理后 {kb:.0f}KB，超过 {max_kb}KB 上限，请剪短')
            manifest['audio'][f'{folder}_{i}'] = f'assets/audio/{folder}/{i}.mp3'
            done += 1
        report.append((label, done, len(ids), missing))
        check_unknown(SRC / 'audio' / folder, ids, AUDIO_EXT, warnings)

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    total_kb = sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()) / 1024
    print('\n素材进度')
    for label, done, total, missing in report:
        line = f'  {label}  {done}/{total}'
        if missing and done:
            line += f'   还缺：{"、".join(missing[:8])}{" 等" if len(missing) > 8 else ""}'
        print(line)
    print(f'\n处理后素材总大小：{total_kb / 1024:.1f} MB')
    if warnings:
        print('\n需要注意：')
        for w in warnings:
            print(f'  ! {w}')
    print(f'\n已更新素材清单：{MANIFEST.relative_to(ROOT)}，刷新游戏即可看到效果。')


def check_unknown(folder: Path, ids, exts, warnings):
    """文件名写错的素材不会被使用，提醒一下"""
    if not folder.exists():
        return
    for p in folder.iterdir():
        if p.suffix.lower() not in exts:
            continue
        if p.stem not in ids:
            warnings.append(f'{folder.name}/{p.name}：文件名不在清单里，不会被使用（检查拼写，见需求文档）')


if __name__ == '__main__':
    sys.exit(main())
