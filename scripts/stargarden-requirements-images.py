'''Generate two non-overwriting candidates per image requirement.'''
import argparse
import concurrent.futures
import datetime
import io
import importlib.util
import json
import threading
from pathlib import Path

from PIL import Image
from genimage import generate, MODEL, API, QUALITY, LOG

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('stargarden_produce', ROOT / 'scripts/stargarden-produce.py')
production = importlib.util.module_from_spec(spec)
spec.loader.exec_module(production)
STYLE, CHARACTER = production.STYLE, production.CHARACTER
OUT = ROOT / 'art-src/stargarden/requirements-v1/candidates'
LOCK = threading.Lock()
NPCS = {
    'npc-mira-child': 'Mira, an 11 year old shy bookish girl, straight black shoulder-length hair with a neat side part, small round glasses, grey-blue eyes, modest navy pinafore over a white blouse, holding a cloth-bound book to her chest, quiet gentle smile.',
    'npc-mira-teen': 'Mira, a 15 year old shy bookish girl, straight black shoulder-length hair with a neat side part, small round glasses, grey-blue eyes, modest navy pinafore over a white blouse, holding a cloth-bound book to her chest, quiet gentle smile, natural adolescent proportions.',
    'npc-rowan': 'Rowan, a kind retired knight in his sixties, short grey hair and neat grey beard, weathered warm face, simple brown leather jerkin over a cream shirt, plain wooden practice sword at his belt, upright calm posture.',
    'npc-nora': 'Nora, a cheerful teahouse owner in her thirties, wavy auburn hair tied loosely with a scarf, freckles, sage dress with a cream apron, holding a small tray with a teapot, warm welcoming smile.',
    'npc-fern-child': 'Fern, an energetic 11 year old forager apprentice girl, short messy light-brown hair with a leaf clip, green eyes, practical moss-green hooded tunic, brown shorts over leggings, satchel and small field notebook.',
    'npc-fern-teen': 'Fern, an energetic 15 year old forager apprentice girl, short messy light-brown hair with a leaf clip, green eyes, practical moss-green hooded tunic, brown shorts over leggings, satchel and small field notebook, natural adolescent proportions.',
}
MAIN = [
    ('main-wish', 11, 'sitting on her bed holding her green star journal, looking at a page of crossed-out wishes, soft morning light'),
    ('main-certificate', 11, 'standing in front of a neighbor window where a framed certificate hangs, holding her own small drawing behind her back'),
    ('main-two-answers', 12, 'at a school desk comparing two different answer sheets with a classmate, puzzled but curious'),
    ('main-own-schedule', 13, 'at her desk drawing her own weekly timetable with colored pencils, determined'),
    ('main-decision', 14, 'standing at the front door with a small bag, glancing back with a nervous apologetic look'),
    ('main-two-signatures', 14, 'signing a festival exhibition card beside another signature, proud and shy'),
    ('main-exhibit-key', 15, 'unlocking an empty academy exhibition room, dust in sunbeams, tiny star key tag'),
    ('main-broken-promise', 15, 'sitting alone on garden steps at dusk, hugging her knees, an empty second teacup beside her'),
    ('main-behind-stand', 16, 'standing confidently behind her exhibition stand explaining her work to visitors'),
]
ACTIVITIES = [
    ('activity-etiquette', 'practicing a graceful curtsy and tea etiquette in a bright academy classroom'),
    ('activity-guard', 'learning to register travelers at a welcoming town gate beside a simple wooden desk'),
    ('activity-church', 'volunteering inside a small bright chapel, tidying candlesticks and wooden pews'),
    ('activity-free', 'enjoying free time at home on a room carpet, reading a book and drawing'),
    ('activity-walk', 'walking on a sunny garden path and smelling flowers'),
]


def jobs():
    result = []
    for name, description in NPCS.items():
        result.append((name, '1024x1536', STYLE + description + ' Full body frontal standing portrait, head to shoes fully visible, centered, generous margin, plain solid pale blue background for clean cutout, no floor, no cast shadow, no text.'))
    costume = 'modest ivory puff sleeve blouse and sage green pinafore dress, rose bow, brown belt, age appropriate proportions. '
    for name, age, scene in MAIN:
        result.append((name, '1536x1024', STYLE + CHARACTER + f'{age} years old, ' + costume + scene + '. Narrative game illustration, clear expressions, no readable text or watermark.'))
    for name, scene in ACTIVITIES:
        result.append((name, '1536x1024', STYLE + CHARACTER + '12 years old, ' + costume + scene + '. Narrative game illustration, clean setting, no readable text or watermark.'))
    for stage, age in [('child', 11), ('teen', 15), ('grown', 17)]:
        result.append(('birthday-' + stage, '1536x1024', STYLE + CHARACTER + f'{age} years old, ' + costume + 'a small family birthday party at home, blowing out candles on a honey cake, a few wrapped gifts, warm candlelight and clean cheerful colors. No readable text, no watermark.'))
    sides = [
        ('side-mira-1', 11, NPCS['npc-mira-child'], 'offering Mira a pencil at a window-side classroom seat'),
        ('side-mira-2', 15, NPCS['npc-mira-teen'], 'standing with Mira by bookshelves, placing books in their shared exchange corner'),
        ('side-rowan-1', 11, NPCS['npc-rowan'], 'carrying a water bucket at the practice yard while Rowan guides her'),
        ('side-rowan-2', 16, NPCS['npc-rowan'], 'handing an old wooden sword to a young apprentice, Rowan nodding behind them'),
        ('side-nora-1', 12, NPCS['npc-nora'], 'carrying a tray of crooked handmade biscuits in a teahouse kitchen with Nora'),
        ('side-nora-2', 16, NPCS['npc-nora'], 'writing her name on the back of the menu board at a teahouse, Nora nearby'),
        ('side-fern-1', 11, NPCS['npc-fern-child'], 'helping Fern find a backpack beside a signpost at the forest entrance'),
        ('side-fern-2', 15, NPCS['npc-fern-teen'], 'marking a safe route with Fern on a hand-drawn map laid out before them'),
    ]
    for name, age, companion, scene in sides:
        result.append((name, '1536x1024', STYLE + CHARACTER + f'{age} years old, ' + costume + companion + ' Scene: Ellie is ' + scene + '. Narrative illustration, distinct identifiable characters, no readable text.'))
    daily = [
        ('daily-tea', 'two teacups on a kitchen table by a window, she rests her chin on her hands'),
        ('daily-wind-hat', 'chasing a straw hat blown across a flower meadow'),
        ('daily-mirror', 'practicing a curtsy in front of a standing mirror in her room'),
        ('daily-sprout', 'kneeling by a windowsill flowerpot, watching a tiny sprout'),
        ('daily-gate', 'pointing the way for an elderly traveler outside the town gate'),
        ('daily-cliff', 'standing on a mountain path looking down at the town under clouds'),
    ]
    for name, scene in daily:
        result.append((name, '1536x1024', STYLE + CHARACTER + '12 years old, ' + costume + scene + '. Narrative game illustration, no readable text.'))
    age_activities = [
        ('study', 'reading a book at a wooden desk in a bright classroom'),
        ('art', 'painting at an easel in a bright art classroom'),
        ('dance', 'practicing dance steps in a simple sunlit dance classroom'),
        ('sword', 'practicing with a wooden sword in a peaceful academy training yard'),
        ('magic', 'studying magic at a desk with a small luminous star-shaped light'),
        ('farm', 'helping harvest vegetables at a sunny village farm'),
        ('cafe', 'serving tea and pastries at a welcoming garden teahouse'),
        ('library', 'arranging books on shelves in a warm town library'),
    ]
    for stage, age in [('grown', 17), ('teen', 15)]:
        for activity, scene in age_activities:
            result.append(('activity-' + activity + '-' + stage, '1536x1024', STYLE + CHARACTER + f'{age} years old, ' + costume + scene + '. Narrative illustration, natural age-appropriate proportions, no readable text.'))
    combat = [
        ('battle-hero-teen', '1024x1536', CHARACTER + '15 year old adolescent in practical modest ivory shirt, sage tunic, brown belt, cream trousers and brown boots; full body side view ready to defend, wooden training sword, completely visible silhouette, plain pale blue background, no ground shadow.'),
        ('enemy-forest-2', '1024x1024', 'A single playful large woodland boar, full body, side view facing left, believable stylized anatomy, nonthreatening natural challenge, no gore, centered on solid pale blue background, no floor shadow.'),
        ('enemy-ruins-2', '1024x1024', 'A single animated hollow suit of old armor guarding ancient ruins, no human inside, full body side view facing left, approachable fantasy design, centered on solid pale blue background, no floor shadow.'),
        ('enemy-mountain-2', '1024x1024', 'A single large white mountain bird, full body side view facing left, elegant natural proportions, a gentle fantasy challenge, centered on solid pale blue background, no floor shadow.'),
        ('explore-forest-loot', '1536x1024', 'A wicker gathering basket with leaves, berries and herbs on a woodland path, cheerful natural treasure illustration, no people.'),
        ('explore-ruins-loot', '1536x1024', 'A small carefully collected ancient stone fragment with star markings in a bright quiet ruin, no people.'),
        ('explore-mountain-loot', '1536x1024', 'A small star-shaped mineral sparkling among stones on a clear mountain path, no people.'),
        ('battle-retreat', '1536x1024', CHARACTER + '12 years old, ' + costume + 'resting against a tree after an exhausting adventure, catching her breath, a gentle path leading home in the background, safe and hopeful, no injury.'),
    ]
    for name, size, scene in combat:
        result.append((name, size, STYLE + scene + ' No text, no watermark.'))
    result.append(('enemy-forest-2-solo', '1024x1024',
        'Original early 1990s Japanese fantasy game creature sprite. '
        'Fine warm brown contours, flat opaque colors, one crisp shadow tone, '
        'bright clean cel illustration. Exactly one woodland wild boar, '
        'full body side view facing left, all four legs visible, centered with ample margin. '
        'The boar is alone. No people, no riders, no human body parts, no other animals. '
        'Plain solid pale blue background, no ground, no shadow, no scenery, no text.'))
    result.append(('enemy-mountain-2-solo', '1024x1024',
        'Original early 1990s Japanese fantasy game creature sprite. '
        'Fine warm brown contours, flat opaque colors, one crisp shadow tone, '
        'bright clean cel illustration. Exactly one large white mountain bird, '
        'full body side view facing left, centered with ample margin. '
        'The bird is alone and wild. No people, no riders, no saddle, no harness, '
        'no human body parts, no other animals. Plain solid pale blue background, '
        'no ground, no shadow, no scenery, no text.'))
    for stage, age in [('child', 11), ('teen', 15), ('grown', 17)]:
        result.append(('festival-' + stage, '1536x1024', STYLE + CHARACTER + f'{age} years old, ' + costume + 'at a harvest festival in the town square, bunting, pumpkins and garlands, she is at her exhibition stand or stage, welcoming cheerful town atmosphere. No readable text.'))
    locations = [
        ('shop-interior', 'Interior of a charming dress and goods shop, wooden racks with dresses, small counter, empty of people, wide banner composition.'),
        ('town-place-academy', 'Exterior of the small town academy, welcoming stone and timber building, bright daylight, no people.'),
        ('town-place-teahouse', 'Exterior of the garden teahouse, cozy timber building, flowers and an inviting small garden, bright daylight, no people.'),
        ('town-place-gate', 'Exterior of the friendly town gate and old stone walls, sunny sky, open entrance, no people.'),
    ]
    for name, scene in locations:
        result.append((name, '1536x1024', STYLE + scene + ' No readable text, no watermark.'))
    result.append(('key-art', '1024x1536', STYLE + CHARACTER + 'Three versions of the same girl at ages 11, 15 and 17 standing together from younger to older in a sunny garden, small fantasy town in the background, original game key art, retain generous top and side margin for a 9:16 portrait crop, no text or watermark.'))
    return result


def run(task):
    name, size, prompt, variant = task
    path = OUT / (name + '-' + str(variant) + '.png')
    if path.exists():
        with Image.open(path) as image:
            image.verify()
        return path.name + ' cached'
    data = generate(prompt, size)
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with LOCK:
        with path.open('xb') as handle:
            handle.write(data)
        with LOG.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps({'file': path.relative_to(ROOT).as_posix(), 'model': MODEL, 'api': API,
                'size': size, 'quality': QUALITY, 'prompt': prompt, 'time': datetime.datetime.now().isoformat(timespec='seconds'),
                'batch': 'requirements-v1', 'variant': variant}, ensure_ascii=False) + '\n')
    return path.name + ' ready'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='*')
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    all_jobs = jobs()
    if args.only:
        all_jobs = [job for job in all_jobs if job[0] in args.only]
        if len(all_jobs) != len(set(args.only)):
            raise SystemExit('Unknown or duplicate job name')
    tasks = [(name, size, prompt, variant) for name, size, prompt in all_jobs for variant in (1, 2)]
    print(f'{len(all_jobs)} subjects, {len(tasks)} candidate files', flush=True)
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 3))) as pool:
        futures = {pool.submit(run, task): task for task in tasks}
        for future in concurrent.futures.as_completed(futures):
            try:
                print(future.result(), flush=True)
            except Exception as error:
                failures.append(type(error).__name__ + ': ' + str(error)[:300])
                print('FAILED ' + failures[-1], flush=True)
    if failures:
        raise SystemExit(f'{len(failures)} candidate generations failed')


if __name__ == '__main__':
    main()
