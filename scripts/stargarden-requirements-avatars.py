'''Produce circular NPC avatars from selected ShiyingCutout transparent portraits.'''
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent / 'art-src/stargarden/requirements-v1'
SOURCE = ROOT / 'shiying-cutouts'
DEST = ROOT / 'avatars'
NAMES = ['npc-mira-child', 'npc-mira-teen', 'npc-rowan', 'npc-nora', 'npc-fern-child', 'npc-fern-teen']


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        output = DEST / (name + '-avatar.png')
        if output.exists():
            print(name, 'cached')
            continue
        image = Image.open(SOURCE / (name + '.png')).convert('RGBA')
        bounds = image.getchannel('A').point(lambda value: 255 if value > 128 else 0).getbbox()
        if not bounds:
            raise ValueError('Empty cutout: ' + name)
        left, top, right, bottom = bounds
        side = round(max((bottom - top) * .29, (right - left) * .85))
        x = max(0, min(image.width - side, (left + right - side) // 2))
        y = max(0, min(image.height - side, top - round(side * .035)))
        crop = image.crop((x, y, x + side, y + side)).resize((320, 320), Image.Resampling.LANCZOS)
        circle = Image.new('L', (320, 320), 0)
        ImageDraw.Draw(circle).ellipse((1, 1, 318, 318), fill=255)
        alpha = Image.composite(crop.getchannel('A'), Image.new('L', (320, 320), 0), circle)
        crop.putalpha(alpha)
        crop.save(output)
        print(name, 'ready')
    sheet = Image.new('RGB', (960, 640), (244, 243, 235))
    for i, name in enumerate(NAMES):
        image = Image.open(DEST / (name + '-avatar.png')).convert('RGBA')
        bg = Image.new('RGBA', (320, 320), (65, 81, 91, 255))
        bg.alpha_composite(image)
        sheet.paste(bg.convert('RGB'), ((i % 3) * 320, (i // 3) * 320))
    sheet.save(ROOT / 'avatars-review.jpg', quality=94)


if __name__ == '__main__':
    main()
