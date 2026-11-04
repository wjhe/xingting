"""
宣传图合成：9:16 竖版落地页图（游戏截图 + 标语）和 16:9 商店封面、标志。

用法：python -I scripts/posters.py
输入：art-src/marketing/shots/ 里挑好的实机截图（screenshots/ 每次跑 smoke 都会清空，所以另存一份）、art-src 原图
输出：marketing/
字体：霞鹜文楷（SIL OFL，可商用），默认路径见 FONT_DIR，可用环境变量 POSTER_FONT_DIR 覆盖。
      不用系统自带的微软雅黑、楷体：它们只授权在系统界面里使用，印进商业宣传图有版权风险。
"""
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'marketing'
FONT_DIR = Path(os.environ.get('POSTER_FONT_DIR', 'C:/Users/Administrator/tools/fonts'))
PAPER = (241, 232, 212)
INK = (43, 36, 28)
DIM = (110, 98, 82)
RED = (155, 58, 30)
SEAL = (176, 58, 36)


def font(size: int, weight: str = 'Medium') -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / f'LXGWWenKai-{weight}.ttf'), size)


def cover(img: Image.Image, w: int, h: int, anchor_x: float = 0.5) -> Image.Image:
    """等比缩放铺满 w×h，多出的部分按 anchor_x 裁掉"""
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = round((img.width - w) * anchor_x)
    y = (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def paper(w: int, h: int) -> Image.Image:
    """宣纸底：底色加一层极淡的纤维噪点"""
    base = Image.new('RGB', (w, h), PAPER)
    noise = Image.effect_noise((w // 2, h // 2), 18).resize((w, h)).filter(ImageFilter.GaussianBlur(1.2))
    return ImageChops.blend(base, Image.merge('RGB', [noise] * 3), 0.05)


def vfade(w: int, h: int, top: int, bottom: int) -> Image.Image:
    """竖直渐变遮罩：top 以上全不透明（255），bottom 以下全透明"""
    m = Image.new('L', (1, h))
    for y in range(h):
        t = 0 if y <= top else 1 if y >= bottom else (y - top) / (bottom - top)
        m.putpixel((0, y), round(255 * (1 - t)))
    return m.resize((w, h))


def tinted_logo(color, width: int) -> Image.Image:
    """书法标题（白字透明底）染色后按宽度缩放"""
    src = Image.open(ROOT / 'public/assets/ui/title.png').convert('RGBA')
    alpha = src.getchannel('A')
    logo = Image.new('RGBA', src.size, color + (0,))
    logo.putalpha(alpha)
    logo = logo.crop(alpha.getbbox())
    return logo.resize((width, round(logo.height * width / logo.width)), Image.LANCZOS)


def seal(size: int, text: str, angle: float = -6) -> Image.Image:
    """朱印：红底白字，边缘略带不齐"""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 10, fill=SEAL + (240,))
    f = font(round(size * (0.62 if len(text) == 1 else 0.4)))
    if len(text) == 1:
        d.text((size / 2, size / 2), text, font=f, fill=(250, 244, 230), anchor='mm')
    else:
        # 两字竖排，四字两列（右列先读）
        cols = [text[i:i + 2] for i in range(0, len(text), 2)][::-1]
        for ci, col in enumerate(cols):
            cx = size * (0.5 if len(cols) == 1 else (0.3 + 0.4 * ci))
            for ri, ch in enumerate(col):
                d.text((cx, size * (0.3 + 0.4 * ri)), ch, font=f, fill=(250, 244, 230), anchor='mm')
    return im.rotate(angle, resample=Image.BICUBIC, expand=True)


def phone(shot: Path, height: int) -> Image.Image:
    """把截图装进一部简洁的手机外框，带投影"""
    img = Image.open(shot).convert('RGB')
    sh = height - 36
    sw = round(img.width * sh / img.height)
    img = img.resize((sw, sh), Image.LANCZOS)
    w, h = sw + 36, height
    frame = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=64, fill=(28, 25, 22, 255))
    mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=48, fill=255)
    frame.paste(img, (18, 18), mask)
    # 投影
    pad = 80
    out = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    shadow = Image.new('L', out.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle((pad + 10, pad + 30, pad + w - 10, pad + h + 10), radius=64, fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    out.paste((40, 30, 20, 255), (0, 0), shadow)
    out.alpha_composite(frame, (pad, pad))
    return out


POSTERS = [
    # (文件名, 截图, 背景原图, 主标语, 副标语, 印文)
    ('01_奇遇', 'art-src/marketing/shots/01_event.png', 'art-src/regions/yunmeng_marsh.png',
     '三百奇遇，一念一世', '水墨文字修仙 · 每一次抉择都写进你的仙途', '奇遇'),
    ('02_破境', 'art-src/marketing/shots/02_realm.png', 'art-src/realms/realm_jindan.png',
     '七境登天，破境长生', '炼气 筑基 金丹 元婴 化神 渡劫 · 一步一重天', '破境'),
    ('03_天劫', 'art-src/marketing/shots/03_tribulation.png', 'art-src/realms/realm_dujie.png',
     '天劫九重，生死一线', '妖魔斗法、天雷渡劫 · 布好符箓法器，胜负自见分晓', '渡劫'),
    ('04_炼丹', 'art-src/marketing/shots/04_alchemy.png', 'art-src/vignettes/alchemy_room.png',
     '开炉炼丹，夺天地造化', '采灵草、研丹方 · 二十二张丹方，一炉丹药定一境', '丹道'),
    ('05_轮回', 'art-src/marketing/shots/05_rebirth.png', 'art-src/realms/rebirth.png',
     '寿尽轮回，前世今生', '轮回殿积累天赋 · 五种结局，等你亲手写下', '轮回'),
]


def poster(name, shot, bg, title, sub, seal_text):
    W, H = 1080, 1920
    im = paper(W, H).convert('RGBA')
    # 背景插图：淡淡铺满，上方留白给标语
    art = cover(Image.open(ROOT / bg).convert('RGB'), W, H)
    art = ImageChops.blend(Image.new('RGB', (W, H), PAPER), art, 0.32).convert('RGBA')
    art.putalpha(ImageChops.invert(vfade(W, H, 380, 900)))
    im.alpha_composite(art)
    d = ImageDraw.Draw(im)
    # 顶部小标志
    logo = tinted_logo(RED, 300)
    im.alpha_composite(logo, ((W - logo.width) // 2, 64))
    # 主标语 + 印：字号自动缩到放得下，两边各留 70
    s = seal(84, seal_text)
    size = 104
    while d.textlength(title, font=font(size)) + s.width + 18 > W - 140:
        size -= 2
    f1 = font(size)
    tw = d.textlength(title, font=f1)
    x0 = round((W - tw - s.width - 18) / 2)
    d.text((x0, 300), title, font=f1, fill=INK, anchor='lm')
    im.alpha_composite(s, (round(x0 + tw + 18), 300 - s.height // 2))
    size = 40
    while d.textlength(sub, font=font(size, 'Regular')) > W - 140:
        size -= 1
    d.text((W / 2, 410), sub, font=font(size, 'Regular'), fill=DIM, anchor='mm')
    # 手机截图
    ph = phone(ROOT / shot, 1380)
    im.alpha_composite(ph, ((W - ph.width) // 2, 480 - 80))
    OUT.mkdir(exist_ok=True)
    im.convert('RGB').save(OUT / f'{name}.png', optimize=True)
    print('生成', name)


def store_cover():
    """16:9 商店封面：修仙少女主视觉 + 标志"""
    W, H = 1920, 1080
    art = cover(Image.open(ROOT / 'art-src/marketing/cover_girl.png').convert('RGB'), W, H).convert('RGBA')
    # 左侧压一层宣纸色，标志更清楚
    side = Image.new('RGBA', (W, H), PAPER + (0,))
    m = Image.new('L', (W, 1))
    for x in range(W):
        t = min(1, max(0, (x - 620) / 520))
        m.putpixel((x, 0), round(150 * (1 - t)))
    side.putalpha(m.resize((W, H)))
    art.alpha_composite(side)
    logo = logo_image(860)
    art.alpha_composite(logo, (120, 150))
    OUT.mkdir(exist_ok=True)
    art.convert('RGB').save(OUT / '06_商店封面_16x9.png', optimize=True)
    print('生成 商店封面')


def logo_image(width: int) -> Image.Image:
    """标志：书法标题 + 朱印 + 副题，透明底"""
    title = tinted_logo(INK, width)
    s = seal(round(width * 0.13), '长生')
    f = font(round(width * 0.052), 'Regular')
    sub = '水墨文字修仙'
    h = title.height + round(width * 0.12)
    im = Image.new('RGBA', (width + s.width // 2, h), (0, 0, 0, 0))
    im.alpha_composite(title, (0, 0))
    im.alpha_composite(s, (width - s.width // 2, title.height - round(s.height * 0.8)))
    d = ImageDraw.Draw(im)
    # 副题两侧各一道细线
    ty = title.height + round(width * 0.07)
    tw = d.textlength(sub, font=f)
    cx = width / 2
    d.text((cx, ty), sub, font=f, fill=RED, anchor='mm')
    for sx in (cx - tw / 2 - 30 - width * 0.12, cx + tw / 2 + 30):
        d.line((sx, ty, sx + width * 0.12, ty), fill=RED + (200,), width=3)
    return im


if __name__ == '__main__':
    for p in POSTERS:
        poster(*p)
    if (ROOT / 'art-src/marketing/cover_girl.png').exists():
        store_cover()
        logo_image(1200).save(OUT / '07_标志_透明底.png')
        print('生成 标志')
