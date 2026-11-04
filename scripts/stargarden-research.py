import concurrent.futures
import json
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8',errors='replace')
ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'art-src/stargarden/research'
DEST.mkdir(exist_ok=True)
SOURCES={
 'birefnet-onnx':'https://hf-mirror.com/api/models/onnx-community/BiRefNet-ONNX',
 'birefnet-license':'https://raw.githubusercontent.com/ZhengPeng7/BiRefNet/main/LICENSE',
 'kenney-interface':'https://kenney.nl/assets/interface-sounds',
 'pm2-clothing':'https://princessmaker.fandom.com/wiki/Clothing_(PM2)',
}
def get(pair):
    key,url=pair
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=30) as response: data=response.read()
        (DEST/(key+'.txt')).write_bytes(data)
        print(key,len(data),data[:300].decode('utf-8','replace'),flush=True)
        return {'id':key,'url':url,'status':'downloaded'}
    except Exception as e:
        print(key,type(e).__name__,flush=True)
        return {'id':key,'url':url,'status':'unavailable','error':str(e)}
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=list(pool.map(get,SOURCES.items()))
    (DEST/'sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
