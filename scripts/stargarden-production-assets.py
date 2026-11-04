"""BiRefNet ONNX foreground extraction, normalized canvases and CC0 audio export."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps, ImageDraw

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'art-src/stargarden/production-v1'
DEST=ROOT/'public/assets/stargarden/production-v1'
CACHE=SOURCE/'masks'
MODEL=ROOT/'tools/models/birefnet-fp16.onnx'

def inference_session():
    options=ort.SessionOptions()
    options.log_severity_level=3
    options.intra_op_num_threads=4
    options.inter_op_num_threads=1
    return ort.InferenceSession(str(MODEL),sess_options=options,providers=['CPUExecutionProvider'])

def cutout(image,path,session):
    fingerprint=hashlib.sha256(path.read_bytes()).hexdigest()
    alpha_path=CACHE/(path.stem+'-alpha.png')
    info_path=CACHE/(path.stem+'-alpha.json')
    info=json.loads(info_path.read_text()) if info_path.exists() else {}
    if alpha_path.exists() and info.get('hash')==fingerprint and info.get('method')=='birefnet-fp16-sigmoid-v1':
        alpha=Image.open(alpha_path).convert('L')
    else:
        rgb=np.array(image.resize((1024,1024),Image.Resampling.BILINEAR)).astype(np.float32)/255
        inputs=((rgb-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)).transpose(2,0,1)[None]
        logits=session.run(None,{session.get_inputs()[0].name:inputs})[0][0,0]
        probability=1/(1+np.exp(-np.clip(logits,-40,40)))
        # Clear near-zero background noise and retain subpixel contours.
        probability=np.clip((probability-.015)/.97,0,1)
        alpha=Image.fromarray(np.uint8(probability*255)).resize(image.size,Image.Resampling.LANCZOS)
        alpha.save(alpha_path)
        info_path.write_text(json.dumps({'hash':fingerprint,'model':'onnx-community/BiRefNet-ONNX','revision':'534d3c82d3bb8b2f0867db6dfbc3a525b8e42f67','method':'birefnet-fp16-sigmoid-v1'}),encoding='utf-8')
    result=image.convert('RGBA')
    result.putalpha(alpha)
    # Unmix known blue background only at soft edges of new blue-screen sources.
    rgba=np.array(result).astype(np.float32)
    a=rgba[:,:,3:4]/255
    edge=(a[:,:,0]>.04)&(a[:,:,0]<.97)
    bg=np.array(image.getpixel((0,0)),np.float32)
    clean=np.clip((rgba[:,:,:3]-bg*(1-a))/np.maximum(a,.04),0,255)
    rgba[:,:,:3][edge]=clean[edge]
    return Image.fromarray(np.uint8(rgba))

def normalize(image,character):
    if not character: return image
    bbox=image.getchannel('A').point(lambda x:255 if x>160 else 0).getbbox()
    if not bbox: raise ValueError('Empty character')
    crop=image.crop(bbox)
    size=(900,1350) if image.height>image.width else (900,900)
    fitted=ImageOps.contain(crop,(round(size[0]*.86),round(size[1]*.95)),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',size)
    canvas.alpha_composite(fitted,((size[0]-fitted.width)//2,round(size[1]*.025)))
    return canvas

def export_audio():
    sys.path.insert(0,str(ROOT/'tools/audio-python'))
    import soundfile as sf
    source=ROOT/'art-src/stargarden/audio/kenney-interface-sounds'
    if not source.exists(): source=ROOT/'art-src/stargarden/audio/kenney-interface'
    target=ROOT/'public/assets/stargarden/audio'
    target.mkdir(parents=True,exist_ok=True)
    mapping={'click':'click_003','back':'back_001','buy':'confirmation_001','dress':'maximize_001','event':'open_001','hit':'drop_003','hurt':'error_003','victory':'confirmation_004'}
    impacts=ROOT/'art-src/stargarden/audio/kenney-impact-sounds'
    impact_mapping={'hit':'impactWood_medium_000','hurt':'impactPunch_medium_000'}
    for key,filename in mapping.items():
        path=(impacts/'Audio'/(impact_mapping[key]+'.ogg')) if key in impact_mapping else source/'Audio'/(filename+'.ogg')
        samples,rate=sf.read(path,always_2d=True)
        peak=float(np.max(np.abs(samples)))
        active=np.where(np.max(np.abs(samples),axis=1)>max(peak*.005,.0001))[0]
        if len(active): samples=samples[max(0,active[0]-round(rate*.005)):min(len(samples),active[-1]+round(rate*.02))]
        rms=float(np.sqrt(np.mean(samples*samples)))
        samples*=min(.06/max(rms,.0001),.7/max(peak,.0001))
        fade=min(round(rate*.002),len(samples)//2)
        samples[:fade]*=np.linspace(0,1,fade)[:,None]
        samples[-fade:]*=np.linspace(1,0,fade)[:,None]
        sf.write(target/(key+'.ogg'),samples,rate,format='OGG',subtype='VORBIS')
        sf.write(target/(key+'.wav'),samples,rate,format='WAV',subtype='PCM_16')
    shutil.copyfile(source/'License.txt',target/'Kenney-CC0.txt')
    shutil.copyfile(impacts/'License.txt',target/'Kenney-Impact-CC0.txt')
    (target/'sources.json').write_text(json.dumps({'author':'Kenney','packs':['Interface Sounds 1.0','Impact Sounds 1.0'],'sources':['https://kenney.nl/assets/interface-sounds','https://kenney.nl/assets/impact-sounds'],'license':'CC0-1.0','downloaded':'2026-11-01','processing':'RMS target 0.06; peak cap 0.7; trim silence; 2ms edge fades; OGG Vorbis and PCM16 WAV fallback','interfaceFiles':{k:v for k,v in mapping.items() if k not in impact_mapping},'impactFiles':impact_mapping},indent=2),encoding='utf-8')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--only',nargs='*')
    args=parser.parse_args()
    for path in [DEST,CACHE]:path.mkdir(parents=True,exist_ok=True)
    jobs=json.loads((SOURCE/'prompts.json').read_text(encoding='utf-8'))
    if args.only: jobs=[j for j in jobs if j['id'] in args.only]
    session=None
    manifest_path=DEST/'manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else []
    for job in jobs:
        path=SOURCE/(job['id']+'.png')
        if not path.exists(): raise FileNotFoundError(f'Missing source {path.name}; run scripts/stargarden-produce.py first.')
        image=Image.open(path).convert('RGB')
        if job['kind']=='portrait-atlas':
            if session is None:session=inference_session()
            extracted=cutout(image,path,session)
            names=['calm','happy','shy','sad','angry','tired']
            stage=job['id'].split('-')[-1]
            for index,name in enumerate(names):
                x,y=index%3,index//3
                cell=extracted.crop((round(x*image.width/3),round(y*image.height/2),round((x+1)*image.width/3),round((y+1)*image.height/2)))
                cell=ImageOps.contain(cell,(320,320),Image.Resampling.LANCZOS)
                cell.save(DEST/f'face-{stage}-{name}.webp','WEBP',quality=94,method=6)
                manifest.append({'id':f'face-{stage}-{name}','kind':'portrait','size':cell.size,'source':str(path.relative_to(ROOT)),'cell':index})
            image=extracted
            image.thumbnail((1200,900),Image.Resampling.LANCZOS)
        elif job['kind']=='character':
            if session is None:session=inference_session()
            extracted=cutout(image,path,session)
            if job['id']=='grown-garden':
                import cv2
                rgba=np.asarray(extracted).copy()
                hsv=cv2.cvtColor(rgba[:,:,:3],cv2.COLOR_RGB2HSV)
                selected=(hsv[:,:,0]>28)&(hsv[:,:,0]<85)&(hsv[:,:,1]>18)&(rgba[:,:,3]>200)
                selected[:round(image.height*.17)]=False
                book=Image.new('L',image.size)
                ImageDraw.Draw(book).polygon([(round(x*image.width),round(y*image.height)) for x,y in [(.435,.34),(.534,.34),(.56,.437),(.435,.448)]],fill=255)
                selected[np.asarray(book)>0]=False
                for key,target in [('rose',[185,143,153]),('sky',[125,160,180])]:
                    colored=rgba.copy()
                    original=colored[:,:,:3].astype(np.float32)
                    mean=np.mean(original[selected],axis=0)
                    original[selected]=np.clip(original[selected]*np.array(target)/mean,0,255)
                    colored[:,:,:3]=original.astype(np.uint8)
                    normalize(Image.fromarray(colored),True).save(DEST/('grown-'+key+'.webp'),'WEBP',quality=93,method=6)
                    manifest.append({'id':'grown-'+key,'kind':'character','size':[900,1350],'source':str(path.relative_to(ROOT)),'derivedFrom':'grown-garden','method':'dress-color-mask'})
            image=normalize(extracted,True)
        else:
            image.thumbnail((1200,900),Image.Resampling.LANCZOS)
        image.save(DEST/(job['id']+'.webp'),'WEBP',quality=93,method=6)
        if job['kind']=='character':
            bg=Image.new('RGBA',image.size,(55,65,75,255));bg.alpha_composite(image)
            bg.convert('RGB').resize((300,round(300*image.height/image.width))).save(CACHE/(job['id']+'-dark.jpg'))
        manifest.append({'id':job['id'],'kind':job['kind'],'size':image.size,'source':str(path.relative_to(ROOT))})
        print('ready',job['id'],flush=True)
    Image.new('RGBA',(900,1350)).save(DEST/'empty.webp','WEBP',lossless=True)
    manifest.append({'id':'empty','kind':'utility','size':[900,1350],'source':'generated transparent alignment layer'})
    manifest_path.write_text(json.dumps(list({entry['id']:entry for entry in manifest}.values()),ensure_ascii=False,indent=2),encoding='utf-8')
    export_audio()
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8',errors='replace')
    main()
