import { videoAsset } from './art';

/**
 * 年龄段切换时的“时光流逝”过场：空房间里窗外四季轮转（同一段视频复用），
 * 叠加逐行淡入的文字说明这是哪一年、她几岁、进入哪一章。点一下可跳过。
 */
export interface TimelapseOptions {
  host: HTMLElement;
  year: number;
  name: string;
  age: number;
  chapter: string;
  onStart?: () => void;
  onDone: () => void;
}

export function playTimelapse(o: TimelapseOptions): void {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const asset = videoAsset('vid-time');
  const el = document.createElement('div');
  el.className = 'timelapse';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '时光流逝');
  el.innerHTML = `<div class="tl-stage" style="background-image:url('${asset.poster}')"></div>
    <div class="tl-text"><p style="--d:.4s">春去秋来……</p><b style="--d:1.6s">星历 ${o.year} 年 · ${o.name} ${o.age} 岁</b><small style="--d:2.8s">${o.chapter}</small></div>
    <span class="tl-skip">轻触继续</span>`;
  o.host.append(el);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); o.onDone(); }, 600);
  };
  if (!still) {
    const v = document.createElement('video');
    v.className = 'tl-video'; v.muted = true; v.playsInline = true; v.poster = asset.poster; v.src = asset.src;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.addEventListener('ended', () => setTimeout(finish, 900));
    v.addEventListener('error', () => { v.remove(); setTimeout(finish, 3500); });
    el.querySelector('.tl-stage')!.append(v);
    void v.play().catch(() => setTimeout(finish, 3500));
  } else setTimeout(finish, 3500);
  // 至少看清第一行字后才允许点击跳过，避免结算页的那一下点击直接把过场跳掉
  setTimeout(() => el.addEventListener('click', finish), 500);
  o.onStart?.();
}
