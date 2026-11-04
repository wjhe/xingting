"""从已确认的立绘提取透明人物，输出独立服装层所用的蒙版。"""
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'art-src/stargarden/cel-v3/masks'

def character_alpha(image, source, age):
    """用背景/人物种子做可复现的图割，保留白衬衣以及发丝轮廓。"""
    CACHE.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
    alpha_path, info_path = CACHE / f'{age}-alpha.png', CACHE / f'{age}-alpha.json'
    if alpha_path.exists() and info_path.exists():
        info = json.loads(info_path.read_text(encoding='utf-8'))
        cached = Image.open(alpha_path).convert('L')
        if info.get('sourceHash') == fingerprint and info.get('method') == 'seeded-grabcut-v3' and cached.size == image.size:
            return cached
    w, h = image.size
    rgb = np.array(image)
    mask = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
    mask[round(.012*h):round(.995*h), round(.235*w):round(.755*w)] = cv2.GC_PR_FGD
    # 确定的前景种子落在发顶、面部、双臂、裙身与靴子内部，避免白衣被误判成墙面。
    marks = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(marks)
    centers = ([(.49,.065),(.50,.14),(.49,.24),(.48,.34),(.48,.57),(.46,.70),(.48,.91),(.51,.96)]
               if age == 'home' else [(.49,.055),(.49,.115),(.48,.25),(.49,.34),(.48,.57),(.48,.72),(.49,.91),(.51,.96)])
    for x,y in centers:
        r = 7 if y > .88 else 12
        draw.ellipse((x*w-r,y*h-r,x*w+r,y*h+r), fill=255)
    arms = ([[(.36,.245),(.34,.32),(.35,.385)],[(.61,.245),(.58,.31),(.55,.37)]]
            if age == 'home' else [[(.36,.23),(.38,.32),(.42,.385)],[(.605,.235),(.62,.32),(.63,.375)]])
    for arm in arms:
        draw.line([(round(x*w), round(y*h)) for x,y in arm], fill=255, width=9)
    if age == 'teen':
        # Cream stockings need foreground seeds on both legs as well.
        draw.line([(.448*w,.79*h),(.479*w,.855*h)], fill=255, width=9)
        draw.line([(.515*w,.787*h),(.500*w,.843*h)], fill=255, width=9)
        # 金色扣环与墙面接近，需保护，避免透明孔洞；右脚地面投影不属于人物层。
        draw.rectangle((.507*w,.313*h,.541*w,.332*h), fill=255)
        mask[round(.82*h):,round(.555*w):] = cv2.GC_BGD
    mask[np.array(marks) > 0] = cv2.GC_FGD
    cv2.setRNGSeed(20261031)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None, np.zeros((1,65), np.float64), np.zeros((1,65), np.float64), 5, cv2.GC_INIT_WITH_MASK)
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # 去掉不与主体相连的背景残片；头发、衣服、书和鞋都属于同一个连通区域。
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    if count > 1:
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        alpha[labels != largest] = 0
    result = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(.35))
    result.save(alpha_path)
    info_path.write_text(json.dumps({'sourceHash': fingerprint, 'source': str(source.relative_to(ROOT)), 'method': 'seeded-grabcut-v3'}, indent=2), encoding='utf-8')
    return result

def dress_mask(image, alpha, age):
    """只选人物轮廓内的绿色裙装，排除同色书本与头部发带。"""
    rgb = np.asarray(image).astype(np.float32) / 255
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue, sat = hsv[:,:,0] / 360, hsv[:,:,1]
    h, _ = hue.shape
    selected = (hue > .24) & (hue < .48) & (sat > .07) & (sat < .65) & (np.asarray(alpha) > 240)
    selected[:round(.18*h),:] = False
    selected[round(.82*h):,:] = False
    book = ([(.378,.410),(.480,.422),(.524,.439),(.507,.502),(.368,.484)] if age == 'home'
            else [(.453,.397),(.584,.393),(.612,.468),(.467,.478)])
    exclusion = Image.new('L', image.size, 0)
    ImageDraw.Draw(exclusion).polygon([(round(x*image.width),round(y*image.height)) for x,y in book], fill=255)
    selected[np.asarray(exclusion) > 0] = False
    return Image.fromarray(np.where(selected, 255, 0).astype(np.uint8))
