"""Download verified model/audio sources; never execute downloaded code."""
import concurrent.futures
import hashlib
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
RESEARCH=ROOT/'art-src/stargarden/research'
HEADERS={'User-Agent':'Mozilla/5.0'}
def fetch(url,path):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists(): return
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=120) as response, path.with_suffix(path.suffix+'.part').open('wb') as out:
        while block:=response.read(1024*1024): out.write(block)
    path.with_suffix(path.suffix+'.part').replace(path)
    print('saved',path.name,path.stat().st_size,flush=True)
def model():
    base='https://hf-mirror.com/onnx-community/BiRefNet-ONNX/resolve/534d3c82d3bb8b2f0867db6dfbc3a525b8e42f67/'
    fetch(base+'preprocessor_config.json',RESEARCH/'birefnet-preprocessor.json')
    fetch(base+'README.md',RESEARCH/'birefnet-model-card.md')
    fetch(base+'onnx/model_fp16.onnx',ROOT/'tools/models/birefnet-fp16.onnx')
def audio(slug='interface-sounds'):
    identifier=('assets/'+slug).encode().hex()
    import http.cookiejar
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    page='https://kenney.nl/assets/'+slug
    html=opener.open(urllib.request.Request(page,headers=HEADERS),timeout=60).read()
    (RESEARCH/('kenney-'+slug+'.html')).write_bytes(html)
    req=urllib.request.Request('https://kenney.nl/download-link/'+identifier,headers={**HEADERS,'Referer':page,'X-Requested-With':'XMLHttpRequest'})
    with opener.open(req,timeout=60) as response: info=json.loads(response.read())
    fetch(info['url'],RESEARCH/('kenney-'+slug+'.zip'))
    with zipfile.ZipFile(RESEARCH/('kenney-'+slug+'.zip')) as z:
        print('audio archive',z.namelist()[:15],flush=True)
        target=ROOT/'art-src/stargarden/audio'/('kenney-'+slug)
        target.mkdir(parents=True,exist_ok=True)
        for entry in z.infolist():
            path=(target/entry.filename).resolve()
            if not path.is_relative_to(target.resolve()): raise ValueError('Invalid archive path')
            z.extract(entry,target)
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8',errors='replace')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        tasks=[pool.submit(model),pool.submit(audio),pool.submit(audio,'impact-sounds')]
        for task in concurrent.futures.as_completed(tasks):
            try: task.result()
            except Exception as e: print(type(e).__name__,str(e),flush=True)
