"""
批量生成素材原图：按 art-src/prompts.json 的清单并发调用图像接口，已存在的跳过。

用法：python scripts/genbatch.py [分类...]      例：python scripts/genbatch.py icons title
      加 --redo id1,id2 可强制重新生成指定条目（旧图移到 art-src/_rejected/ 留底）。
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from genimage import LOG, MODEL, API, QUALITY, generate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / 'art-src' / 'prompts.json'
CONCURRENCY = 4


def build_jobs(spec, categories, redo):
    jobs = []
    for cat, conf in spec['categories'].items():
        if categories and cat not in categories:
            continue
        for item in conf['items']:
            out = ROOT / 'art-src' / conf['folder'] / f"{item['id']}.png"
            if out.exists() and item['id'] not in redo:
                continue
            if out.exists():
                # 被替换的旧图移到 art-src/_rejected/ 留底，不和定稿放在一起
                old = ROOT / 'art-src' / '_rejected' / conf['folder'] / f"{item['id']}.png"
                old.parent.mkdir(parents=True, exist_ok=True)
                out.replace(old)
            prompt = conf['template'].format(subject=item['subject'], **spec['fragments'])
            jobs.append((out, conf['size'], prompt))
    return jobs


def run(job):
    import datetime
    out, size, prompt = job
    img = generate(prompt, size)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(img)
    rec = {'file': str(out.relative_to(ROOT)).replace('\\', '/'), 'model': MODEL, 'api': API, 'size': size, 'quality': QUALITY, 'prompt': prompt,
           'time': datetime.datetime.now().isoformat(timespec='seconds')}
    return out, rec


def main():
    # Windows 控制台默认 GBK，打印 ✓ 之类的字符会抛异常，中断后面的日志记录
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    args = sys.argv[1:]
    redo = set()
    if '--redo' in args:
        i = args.index('--redo')
        redo = set(args[i + 1].split(','))
        args = args[:i] + args[i + 2:]
    spec = json.loads(SPEC.read_text(encoding='utf-8'))
    jobs = build_jobs(spec, set(args), redo)
    print(f'待生成 {len(jobs)} 张')
    failed = []
    with ThreadPoolExecutor(CONCURRENCY) as pool:
        futures = {pool.submit(run, j): j for j in jobs}
        for f in as_completed(futures):
            out = futures[f][0]
            try:
                _, rec = f.result()
                with LOG.open('a', encoding='utf-8') as log:
                    log.write(json.dumps(rec, ensure_ascii=False) + '\n')
                print(f'  ✓ {out.relative_to(ROOT)}')
            except Exception as e:  # 单张失败不影响其它
                failed.append(out.name)
                print(f'  ✗ {out.name}：{e}')
    print(f'完成，失败 {len(failed)} 张{"：" + "、".join(failed) if failed else ""}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
