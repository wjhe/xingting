"""
调用图像接口生成素材原图，保存到 art-src/，并把每次生成记入 art-src/generation_log.jsonl（版权留档）。

用法：
  python scripts/genimage.py <输出路径> <尺寸> "<提示词>" [张数]
  例：python scripts/genimage.py art-src/regions/qingshi_village.png 1536x1024 "..." 2
  张数大于 1 时，文件名后加 _1、_2 …，挑好后改名为正式文件名。

接口地址和模型在下面配置，key 从项目根目录的 gpt_image_2_5_key.txt 读取（已加入 .gitignore）。
"""
import base64
import datetime
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = 'https://api.aigocode.dev'
API = BASE_URL + '/v1/images/generations'
MODEL = 'gpt-image-2.5-sunburst'
QUALITY = 'high'
KEY_FILE = ROOT / 'gpt_image_2_5_key.txt'
LOG = ROOT / 'art-src' / 'generation_log.jsonl'


def generate(
    prompt: str,
    size: str,
    model: str | None = None,
    quality: str | None = None,
) -> bytes:
    key = KEY_FILE.read_text(encoding='utf-8').strip()
    selected_model = model or MODEL
    selected_quality = quality or QUALITY
    body = json.dumps({
        'model': selected_model,
        'prompt': prompt,
        'size': size,
        'quality': selected_quality,
        'n': 1,
    }).encode('utf-8')
    req = urllib.request.Request(API, data=body, headers={
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read())
            item = data['data'][0]
            if item.get('b64_json'):
                return base64.b64decode(item['b64_json'])
            with urllib.request.urlopen(item['url'], timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')[:300]
            # 4xx（提示词被拒、参数错误）重试也没用
            if e.code < 500 or attempt == 2:
                raise RuntimeError(f'HTTP {e.code}: {msg}') from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 2:
                raise RuntimeError(f'网络错误：{e}') from None
        time.sleep(5 * (attempt + 1))
    raise RuntimeError('生成失败')


def main():
    # Windows 控制台默认 GBK，打印 ✓ 之类的字符会抛异常，中断后面的日志记录
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if len(sys.argv) < 4:
        print(__doc__)
        return 1
    out, size, prompt = Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3]
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    out.parent.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        path = out if count == 1 else out.with_name(f'{out.stem}_{i + 1}{out.suffix}')
        t0 = time.time()
        img = generate(prompt, size)
        path.write_bytes(img)
        with LOG.open('a', encoding='utf-8') as f:
            f.write(json.dumps({
                'file': str(path.relative_to(ROOT)).replace('\\', '/'),
                'model': MODEL, 'api': API, 'size': size, 'quality': QUALITY,
                'prompt': prompt,
                'time': datetime.datetime.now().isoformat(timespec='seconds'),
            }, ensure_ascii=False) + '\n')
        print(f'已生成 {path.relative_to(ROOT)}（{len(img) // 1024}KB，{time.time() - t0:.0f} 秒）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
