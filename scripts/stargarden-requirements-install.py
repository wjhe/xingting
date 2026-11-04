"""把 requirements-v1 里选定的候选图转成游戏运行文件（public/assets/stargarden/production-v1/<名字>.webp）。

选择记录就是下面的 PICK：值为候选编号（1 或 2）。改选后重新运行：
    python scripts/stargarden-requirements-install.py
透明立绘、对手与头像使用执行方已抠好的 shiying-cutouts/ 与 avatars/。
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQ = os.path.join(ROOT, 'art-src', 'stargarden', 'requirements-v1')
OUT = os.path.join(ROOT, 'public', 'assets', 'stargarden', 'production-v1')

# 场景插画：名字 -> 候选编号
PICK = {
    # 主线
    'main-wish': 1, 'main-certificate': 2, 'main-two-answers': 1, 'main-own-schedule': 1, 'main-decision': 1,
    'main-two-signatures': 2, 'main-exhibit-key': 2, 'main-broken-promise': 1, 'main-behind-stand': 1,
    # 人物支线（相识 / 最后一幕）
    'side-mira-1': 1, 'side-mira-2': 1, 'side-rowan-1': 1, 'side-rowan-2': 1,
    'side-nora-1': 1, 'side-nora-2': 1, 'side-fern-1': 2, 'side-fern-2': 2,
    # 日常
    'daily-tea': 1, 'daily-wind-hat': 2, 'daily-mirror': 1, 'daily-sprout': 1, 'daily-gate': 2, 'daily-cliff': 2,
    # 缺失的活动
    'activity-church': 2, 'activity-etiquette': 1, 'activity-free': 1, 'activity-guard': 1, 'activity-walk': 2,
    # 14–15 岁活动
    'activity-art-teen': 2, 'activity-cafe-teen': 2, 'activity-dance-teen': 2, 'activity-farm-teen': 2,
    'activity-library-teen': 2, 'activity-magic-teen': 1, 'activity-study-teen': 2, 'activity-sword-teen': 1,
    # 16–18 岁活动
    'activity-art-grown': 1, 'activity-cafe-grown': 2, 'activity-dance-grown': 2, 'activity-farm-grown': 2,
    'activity-library-grown': 2, 'activity-magic-grown': 2, 'activity-study-grown': 1, 'activity-sword-grown': 2,
    # 探索、节日、商店与城镇
    'battle-retreat': 1, 'explore-forest-loot': 1, 'explore-ruins-loot': 2, 'explore-mountain-loot': 1,
    'festival-child': 1, 'festival-teen': 2, 'festival-grown': 1,
    'shop-interior': 1, 'town-place-teahouse': 1, 'town-place-gate': 2, 'town-place-academy': 2,
}
# 只取画面的一部分（左, 上, 右, 下 的比例）：学院两张都混入了另一位长发女孩，只保留右侧建筑
CROP = {'town-place-academy': (.36, 0, 1, 1)}
# 不接入：生日图都画了父母与弟妹，和“只有你一位养育者”的设定冲突；主视觉暂无开始界面
SKIPPED = {'birthday-child', 'birthday-teen', 'birthday-grown', 'key-art'}
CUTOUTS = ['npc-mira-child', 'npc-mira-teen', 'npc-rowan', 'npc-nora', 'npc-fern-child', 'npc-fern-teen',
           'battle-hero-teen', 'enemy-forest-2', 'enemy-ruins-2', 'enemy-mountain-2']
AVATARS = ['npc-mira-child', 'npc-mira-teen', 'npc-rowan', 'npc-nora', 'npc-fern-child', 'npc-fern-teen']


def main() -> int:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    record = {}
    for name, n in PICK.items():
        im = Image.open(os.path.join(REQ, 'candidates', f'{name}-{n}.png')).convert('RGB')
        if name in CROP:
            l, t, r, b = CROP[name]
            im = im.crop((int(im.width * l), int(im.height * t), int(im.width * r), int(im.height * b)))
        im.save(os.path.join(OUT, f'{name}.webp'), quality=86, method=6)
        record[name] = f'candidates/{name}-{n}.png'
    for name in CUTOUTS:
        im = Image.open(os.path.join(REQ, 'shiying-cutouts', f'{name}.png')).convert('RGBA')
        im.save(os.path.join(OUT, f'{name}.webp'), quality=90, method=6)
        record[name] = f'shiying-cutouts/{name}.png'
    for name in AVATARS:
        im = Image.open(os.path.join(REQ, 'avatars', f'{name}-avatar.png')).convert('RGBA')
        im.thumbnail((256, 256))
        im.save(os.path.join(OUT, f'{name}-avatar.webp'), quality=90, method=6)
        record[f'{name}-avatar'] = f'avatars/{name}-avatar.png'
    json.dump({'source_root': 'art-src/stargarden/requirements-v1', 'skipped': sorted(SKIPPED), 'files': record},
              open(os.path.join(OUT, 'requirements-v1-install.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'已安装 {len(record)} 个文件到 {os.path.relpath(OUT, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
