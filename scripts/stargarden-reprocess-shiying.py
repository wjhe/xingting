'''Rebuild the old transparent game assets with ShiyingCutout, then install with backups.'''
import argparse
import colorsys
import hashlib
import importlib.util
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from stargarden_layers import dress_mask

ROOT = Path(__file__).resolve().parent.parent
PROD = ROOT / 'art-src/stargarden/production-v1'
PUBLIC = ROOT / 'public/assets/stargarden'
WORK = ROOT / 'art-src/stargarden/requirements-v1/reprocess-v1'
STAGE = WORK / 'staged'
RAW = WORK / 'raw'
EXPRESSIONS = ['calm', 'happy', 'shy', 'sad', 'angry', 'tired']
CHARACTERS = ['child-summer', 'child-festival', 'child-winter', 'teen-summer',
    'teen-festival', 'teen-winter', 'grown-summer', 'grown-festival', 'grown-winter',
    'grown-garden', 'enemy-wolf', 'battle-hero', 'enemy-stone', 'enemy-spirit', 'battle-hero-grown']


def engine():
    spec = importlib.util.spec_from_file_location('shiying', ROOT / 'scripts/stargarden-shiying-cutout.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    os.add_dll_directory(str(module.INTERNAL))
    os.add_dll_directory(str(module.INTERNAL / 'torch/lib'))
    sys.path.insert(0, str(module.INTERNAL))
    data, toc = module.archive()
    sys.meta_path.insert(0, module.BundledModules(data, toc))
    import matting_engine
    return matting_engine


def extract(model, image, dest):
    if dest.exists():
        with Image.open(dest) as cached:
            if cached.mode != 'RGBA' or cached.size != image.size:
                raise ValueError('Invalid cached cutout: ' + str(dest))
            return cached.copy()
    result = model.remove_background(image, refine=True, decontaminate=True,
        progress=lambda value, message: print(f'{dest.name}: {value}: {message}', flush=True))
    if result.mode != 'RGBA' or result.size != image.size:
        raise ValueError('Invalid result: ' + str(dest))
    dest.parent.mkdir(parents=True, exist_ok=True)
    result.save(dest, format='PNG')
    return result


def save(image, rel, quality=93):
    destination = STAGE / rel
    old = PUBLIC / rel
    if not old.exists():
        raise FileNotFoundError(old)
    with Image.open(old) as existing:
        if existing.size != image.size:
            raise ValueError(f'Size mismatch {rel}: {image.size} vs {existing.size}')
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, 'WEBP', quality=quality, method=6)
    print('Staged', rel, flush=True)


def normalize(image):
    bbox = image.getchannel('A').point(lambda x: 255 if x > 160 else 0).getbbox()
    if not bbox:
        raise ValueError('Empty character')
    size = (900, 1350) if image.height > image.width else (900, 900)
    fitted = ImageOps.contain(image.crop(bbox), (round(size[0] * .86), round(size[1] * .95)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', size)
    canvas.alpha_composite(fitted, ((size[0] - fitted.width) // 2, round(size[1] * .025)))
    return canvas


def recolor(image, mask, target):
    result = image.copy()
    original, pixels, coverage = image.load(), result.load(), mask.load()
    for y in range(image.height):
        for x in range(image.width):
            m = coverage[x, y] / 255
            if m < .01:
                continue
            rgb = original[x, y]
            hue, sat, val = colorsys.rgb_to_hsv(*(v / 255 for v in rgb))
            if .24 < hue < .48 and .07 < sat < .65:
                blend = min(1., (hue - .24) / .025, (.48 - hue) / .025) * m
                new = colorsys.hsv_to_rgb(target, min(.38, max(.10, sat * .95)), val)
                pixels[x, y] = tuple(round(rgb[i] * (1 - blend) + new[i] * 255 * blend) for i in range(3))
    return result


def make_layers():
    direction = json.loads((ROOT / 'art-src/stargarden/art-direction.json').read_text(encoding='utf-8'))
    for age in ['home', 'teen']:
        source = Image.open(ROOT / direction['sources'][age]).convert('RGB')
        source.thumbnail((900, 1350))
        cutout = Image.open(WORK / (age + '-source.png')).convert('RGBA').resize(source.size, Image.Resampling.LANCZOS)
        mask = dress_mask(source, cutout.getchannel('A'), age)
        save(cutout, f'{age}-cel-v3-body.webp', 90)
        for name, colored in [('garden', source), ('rose', recolor(source, mask, .965)), ('sky', recolor(source, mask, .565))]:
            layer = colored.convert('RGBA')
            layer.putalpha(mask)
            save(layer, f'{age}-cel-v3-outfit-{name}.webp', 92)


def grown_variants(image):
    rgba = np.asarray(image).copy()
    hsv = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2HSV)
    selected = (hsv[:, :, 0] > 28) & (hsv[:, :, 0] < 85) & (hsv[:, :, 1] > 18) & (rgba[:, :, 3] > 200)
    selected[:round(image.height * .17)] = False
    book = Image.new('L', image.size)
    ImageDraw.Draw(book).polygon([(round(x * image.width), round(y * image.height)) for x, y in
        [(.435, .34), (.534, .34), (.56, .437), (.435, .448)]], fill=255)
    selected[np.asarray(book) > 0] = False
    for name, target in [('rose', [185, 143, 153]), ('sky', [125, 160, 180])]:
        colored = rgba.copy()
        original = colored[:, :, :3].astype(np.float32)
        mean = np.mean(original[selected], axis=0)
        original[selected] = np.clip(original[selected] * np.array(target) / mean, 0, 255)
        colored[:, :, :3] = original.astype(np.uint8)
        save(normalize(Image.fromarray(colored)), f'production-v1/grown-{name}.webp')


def build():
    make_layers()
    model = engine()
    old_candidates = ROOT / 'art-src/stargarden/requirements-v1/previous-outfits-shiying'
    for name in CHARACTERS:
        source = Image.open(PROD / (name + '.png')).convert('RGB')
        prior = old_candidates / (name + '.png')
        if name == 'child-summer':
            prior = WORK.parent / 'cutout-tests/child-summer-shiying.png'
        if prior.exists():
            image = Image.open(prior).convert('RGBA')
            if image.size != source.size:
                raise ValueError('Previous cutout size mismatch: ' + name)
        else:
            image = extract(model, source, RAW / (name + '.png'))
        if name == 'grown-garden':
            grown_variants(image)
        save(normalize(image), 'production-v1/' + name + '.webp')
    for age in ['child', 'teen', 'grown']:
        source = Image.open(PROD / ('expressions-' + age + '.png')).convert('RGB')
        atlas = Image.new('RGBA', source.size)
        for index, name in enumerate(EXPRESSIONS):
            x, y = index % 3, index // 3
            box = (round(x * source.width / 3), round(y * source.height / 2),
                round((x + 1) * source.width / 3), round((y + 1) * source.height / 2))
            cell = extract(model, source.crop(box), RAW / f'face-{age}-{name}.png')
            atlas.alpha_composite(cell, (box[0], box[1]))
            save(ImageOps.contain(cell, (320, 320), Image.Resampling.LANCZOS), f'production-v1/face-{age}-{name}.webp', 94)
        atlas.thumbnail((1200, 900), Image.Resampling.LANCZOS)
        save(atlas, f'production-v1/expressions-{age}.webp')
    files = sorted(p for p in STAGE.rglob('*.webp'))
    expected = 8 + len(CHARACTERS) + 2 + 18 + 3
    if len(files) != expected:
        raise ValueError(f'Expected {expected} staged files, got {len(files)}')
    print(f'Staged {len(files)} files. Review before installing.', flush=True)


def install():
    files = sorted(STAGE.rglob('*.webp'))
    if len(files) != 46:
        raise ValueError(f'Expected 46 staged files, got {len(files)}')
    backup = ROOT / 'art-src/stargarden/backups' / ('shiying-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True, exist_ok=False)
    entries = []
    for staged in files:
        rel = staged.relative_to(STAGE)
        target = PUBLIC / rel
        with Image.open(staged) as image, Image.open(target) as old:
            if image.size != old.size or image.mode != 'RGBA':
                raise ValueError('Invalid output: ' + str(rel))
        backup_file = backup / rel
        backup_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, backup_file)
        entries.append({'file': rel.as_posix(), 'old_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'new_sha256': hashlib.sha256(staged.read_bytes()).hexdigest()})
    (backup / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf-8')
    for staged in files:
        target = PUBLIC / staged.relative_to(STAGE)
        temp = target.with_name(target.name + '.shiying-tmp')
        shutil.copyfile(staged, temp)
        os.replace(temp, target)
    print(f'Installed {len(files)} assets. Backup: {backup}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['build', 'install'])
    args = parser.parse_args()
    if args.action == 'build':
        build()
    else:
        install()
