"""将获批 cel-v3 原图处理为独立背景、透明人物和服装配色图层。"""
import argparse
import colorsys
import json
from pathlib import Path
from PIL import Image
from stargarden_layers import character_alpha, dress_mask

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'stargarden'
DIRECTION = json.loads((ROOT / 'art-src/stargarden/art-direction.json').read_text(encoding='utf-8'))
STYLE = DIRECTION['version']
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--only-home', action='store_true', help='仅处理已确认的幼年原图')
args = parser.parse_args()

def recolor(image, mask, target):
    result = image.copy()
    original, pixels, coverage = image.load(), result.load(), mask.load()
    for y in range(image.height):
        for x in range(image.width):
            m = coverage[x,y] / 255
            if m < .01:
                continue
            rgb = original[x,y]
            hue, sat, val = colorsys.rgb_to_hsv(*(v / 255 for v in rgb))
            # 留下棕色墨线与明暗层次，保留肤色、白衬衣、发带和室内背景。
            if .24 < hue < .48 and .07 < sat < .65:
                blend = min(1., (hue-.24)/.025, (.48-hue)/.025) * m
                new = colorsys.hsv_to_rgb(target, min(.38, max(.10, sat*.95)), val)
                pixels[x,y] = tuple(round(rgb[i]*(1-blend) + new[i]*255*blend) for i in range(3))
    return result

written = []
for age in (['home'] if args.only_home else ['home', 'teen']):
    source = ROOT / DIRECTION['sources'][age]
    if not source.exists():
        raise FileNotFoundError(f'Missing approved-style source: {source.name}')
    image = Image.open(source).convert('RGB')
    image.thumbnail((900, 1350))
    alpha = character_alpha(image, source, age)
    mask = dress_mask(image, alpha, age)
    body = image.convert('RGBA')
    body.putalpha(alpha)
    body_name = f'{age}-{STYLE}-body.webp'
    body.save(OUT / body_name, quality=90, method=6)
    written.append({'file': body_name, 'layer': 'character', 'width': body.width, 'height': body.height, 'source': DIRECTION['sources'][age]})
    outfits = {'garden': image, 'rose': recolor(image, mask, .965), 'sky': recolor(image, mask, .565)}
    for outfit, colored in outfits.items():
        layer = colored.convert('RGBA')
        layer.putalpha(mask)
        name = f'{age}-{STYLE}-outfit-{outfit}.webp'
        layer.save(OUT / name, quality=92, method=6)
        written.append({'file': name, 'layer': 'outfit', 'width': layer.width, 'height': layer.height, 'source': DIRECTION['sources'][age]})

if not args.only_home:
    for kind in ['room', 'town']:
        image = Image.open(ROOT / DIRECTION['sources'][kind]).convert('RGB')
        image.thumbnail((1200,800))
        name = f'{kind}-{STYLE}.webp'
        image.save(OUT / name, quality=89, method=6)
        written.append({'file': name, 'layer': 'background', 'width': image.width, 'height': image.height, 'source': DIRECTION['sources'][kind]})
    (OUT / f'manifest-{STYLE}.json').write_text(json.dumps({'style': STYLE, 'reference': DIRECTION['approvedReference'], 'assets': written}, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'Stargarden {STYLE}: {len(written)} WebP assets ready.')
