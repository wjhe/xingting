"""生成安卓应用图标和启动图（Capacitor 工程 android/ 下的 res 目录）。

用法：python scripts/android_res.py
原图：art-src/app/icon.png（应用图标），art-src/ui/cover.png + title.png（启动图）
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
PAPER = (241, 232, 212)
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
# 启动图（竖屏）各密度尺寸
SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}


def save_png(img: Image.Image, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.convert('RGBA').quantize(256, method=Image.FASTOCTREE).save(dst, 'PNG', optimize=True)


def icons() -> None:
    src = ImageOps.fit(Image.open(ROOT / 'art-src/app/icon.png').convert('RGB'), (1024, 1024))
    for name, k in DENSITIES.items():
        d = RES / f'mipmap-{name}'
        size = round(48 * k)
        # 旧式图标：圆角方形
        sq = src.resize((size, size), Image.LANCZOS).convert('RGBA')
        mask = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), size * 4 // 5, fill=255)
        sq.putalpha(mask.resize((size, size), Image.LANCZOS))
        save_png(sq, d / 'ic_launcher.png')
        # 圆形图标
        rd = src.resize((size, size), Image.LANCZOS).convert('RGBA')
        mask = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        rd.putalpha(mask.resize((size, size), Image.LANCZOS))
        save_png(rd, d / 'ic_launcher_round.png')
        # 自适应图标前景：108dp 画布，系统会按各家形状裁掉外圈，画面缩到 86% 居中，四周是宣纸底色
        canvas = round(108 * k)
        inner = round(canvas * 0.86)
        fg = Image.new('RGBA', (canvas, canvas), PAPER + (255,))
        fg.paste(src.resize((inner, inner), Image.LANCZOS), ((canvas - inner) // 2, (canvas - inner) // 2))
        save_png(fg, d / 'ic_launcher_foreground.png')
    (RES / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F1E8D4</color>\n</resources>\n',
        encoding='utf-8')


def splash() -> None:
    cover = Image.open(ROOT / 'art-src/ui/cover.png').convert('RGB')
    gray = ImageOps.grayscale(Image.open(ROOT / 'art-src/ui/title.png'))
    # 书法标题：白底黑字 → 只取墨迹，以深褐色压在主视觉上方留白处
    ink = gray.point(lambda v: max(0, min(255, int((235 - v) * 1.4))))
    ink = ink.crop(ink.point(lambda v: 255 if v > 24 else 0).getbbox())
    for name, (w, h) in SPLASH.items():
        img = ImageOps.fit(cover, (w, h), centering=(0.5, 0.4))
        tw = int(w * 0.62)
        t = ink.resize((tw, int(ink.height * tw / ink.width)), Image.LANCZOS)
        layer = Image.new('RGB', t.size, (110, 46, 30))
        img.paste(layer, ((w - tw) // 2, int(h * 0.1)), t)
        save_png(img, RES / f'drawable-port-{name}' / 'splash.png')
        # 横屏不会用到（已锁竖屏），放一张纸色底的占位
        save_png(Image.new('RGB', (h, w), PAPER), RES / f'drawable-land-{name}' / 'splash.png')
    save_png(ImageOps.fit(cover, (480, 720)), RES / 'drawable' / 'splash.png')


if __name__ == '__main__':
    icons()
    splash()
    print('已生成安卓图标和启动图')
