'''Make a light/dark contact sheet for the existing outfit cutout candidates.'''
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

root = Path(__file__).resolve().parent.parent / 'art-src/stargarden/requirements-v1'
files = sorted((root / 'previous-outfits-shiying').glob('*.png'))
files.append(root / 'cutout-tests/child-summer-shiying.png')
sheet = Image.new('RGB', (1200, ((len(files) + 3) // 4) * 460), 'white')
draw = ImageDraw.Draw(sheet)
for index, path in enumerate(files):
    image = Image.open(path).convert('RGBA')
    image = ImageOps.contain(image, (300, 420), Image.Resampling.LANCZOS)
    x, y = index % 4 * 300, index // 4 * 460
    draw.text((x + 3, y + 4), path.stem, fill='black')
    for column, background in enumerate(((245, 245, 245), (35, 40, 45))):
        panel = Image.new('RGBA', (150, 420), background + (255,))
        scaled = ImageOps.contain(image, panel.size, Image.Resampling.LANCZOS)
        panel.alpha_composite(scaled, ((150 - scaled.width) // 2, (420 - scaled.height) // 2))
        sheet.paste(panel.convert('RGB'), (x + column * 150, y + 25))
out = root / 'previous-outfits-shiying-review.jpg'
if out.exists():
    raise SystemExit('Review already exists; refusing to overwrite')
sheet.save(out, quality=92)
print(out)
