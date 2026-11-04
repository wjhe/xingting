"""由一张方图生成安卓各档图标。

用法：python scripts/make_icon.py 游戏图标.png

产出（覆盖 android/app/src/main/res 下同名文件）：
  mipmap-*/ic_launcher.png          老系统/商店用的圆角方图，整图铺满
  mipmap-*/ic_launcher_round.png    圆形图标
  mipmap-*/ic_launcher_foreground.png  自适应图标前景：图缩到画布的 78% 居中，边缘淡出到纸色
同时把 values/ic_launcher_background.xml 的背景色改成图的纸色。
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"

# 各密度：图标边长 / 自适应前景画布边长
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

ROUND_RATIO = 0.19      # 圆角半径 / 边长，跟原来那套一致
ART_RATIO = 0.78        # 自适应前景里画面占画布的比例（再大会被启动器的圆形裁掉）
FEATHER = 0.05          # 边缘淡出宽度，占画面边长


def paper_color(art: Image.Image) -> tuple[int, int, int]:
    """取图片上边缘中位数当纸色，用同色做自适应图标的底色，接缝看不出来。"""
    arr = np.asarray(art.convert("RGB"))
    edge = np.concatenate([arr[:8].reshape(-1, 3), arr[:, :8].reshape(-1, 3)])
    return tuple(int(v) for v in np.median(edge, axis=0))


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius_ratio), fill=255
    )
    return mask.resize((size, size), Image.LANCZOS)


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def feather_mask(size: int, ratio: float) -> Image.Image:
    """四周 linear 淡出的 alpha，避免贴图边缘出现一条硬边。"""
    ramp = np.ones(size, dtype=np.float32)
    f = max(2, int(size * ratio))
    fade = np.linspace(0.0, 1.0, f, dtype=np.float32)
    ramp[:f] = np.minimum(ramp[:f], fade)
    ramp[-f:] = np.minimum(ramp[-f:], fade[::-1])
    alpha = np.minimum.outer(ramp, ramp)
    return Image.fromarray((alpha * 255).astype(np.uint8), "L")


def main(src_arg: str) -> None:
    src = Path(src_arg)
    if not src.is_absolute():
        src = ROOT / src
    art = Image.open(src).convert("RGB")
    if art.width != art.height:
        raise SystemExit("图标需要是正方形")
    paper = paper_color(art)
    print(f"纸色 {paper}")

    for density, (icon_size, fg_size) in DENSITIES.items():
        out = RES / f"mipmap-{density}"
        out.mkdir(parents=True, exist_ok=True)

        # 老系统：整图铺满的圆角方图 / 圆形
        full = art.resize((icon_size, icon_size), Image.LANCZOS)
        for name, mask in (
            ("ic_launcher.png", rounded_mask(icon_size, ROUND_RATIO)),
            ("ic_launcher_round.png", circle_mask(icon_size)),
        ):
            icon = Image.new("RGBA", (icon_size, icon_size), (0, 0, 0, 0))
            icon.paste(full, (0, 0), mask)
            icon.save(out / name, optimize=True)

        # 自适应前景：缩到 78% 居中，边缘淡出到纸色
        canvas = Image.new("RGB", (fg_size, fg_size), paper)
        inner = int(round(fg_size * ART_RATIO))
        scaled = art.resize((inner, inner), Image.LANCZOS)
        scaled = Image.composite(scaled, Image.new("RGB", (inner, inner), paper), feather_mask(inner, FEATHER))
        canvas.paste(scaled, ((fg_size - inner) // 2, (fg_size - inner) // 2))
        canvas.save(out / "ic_launcher_foreground.png", optimize=True)
        print(f"  {density}: {icon_size} / {fg_size}")

    # 自适应图标的底色跟纸色对齐
    color = RES / "values/ic_launcher_background.xml"
    color.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">#{paper[0]:02X}{paper[1]:02X}{paper[2]:02X}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print(f"底色 -> #{paper[0]:02X}{paper[1]:02X}{paper[2]:02X}")

    # 商店用的 512 大图，顺手存一份
    store = ROOT / "art-src/marketing/app_icon_512.png"
    art.resize((512, 512), Image.LANCZOS).save(store, optimize=True)
    print(f"商店图 -> {store.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "游戏图标.png")
