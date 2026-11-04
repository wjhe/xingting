/**
 * 微信小游戏适配层：在没有 DOM 的小游戏环境里模拟 Phaser 用到的浏览器对象。
 * 必须在 Phaser 之前加载，因为 Phaser 的设备检测在模块加载时就会执行。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

declare const wx: any;
declare const GameGlobal: any;
declare const requestAnimationFrame: (cb: () => void) => number;
declare const cancelAnimationFrame: (id: number) => void;

type Listener = (e: any) => void;

/** 最小的事件派发器 */
class Target {
  private listeners: Record<string, Listener[]> = {};
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    const arr = this.listeners[type];
    if (arr) this.listeners[type] = arr.filter((f) => f !== fn);
  }
  dispatchEvent(e: any) {
    for (const fn of (this.listeners[e.type] ?? []).slice()) fn.call(this, e);
    return true;
  }
}

const g: any = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
const info = wx.getWindowInfo();
const W = info.windowWidth;
const H = info.windowHeight;

// ---------- 时间 ----------
// wx.getPerformance().now() 返回微秒，浏览器的 performance.now() 是毫秒
const wxPerf = wx.getPerformance();
const performance = { now: () => wxPerf.now() / 1000 };

// ---------- Canvas / Image ----------
function patchElement(el: any, tag: string) {
  const t = new Target();
  el.tagName = tag.toUpperCase();
  el.style = el.style ?? {};
  el.addEventListener ??= t.addEventListener.bind(t);
  el.removeEventListener ??= t.removeEventListener.bind(t);
  el.dispatchEvent ??= t.dispatchEvent.bind(t);
  el.getBoundingClientRect ??= () => ({ left: 0, top: 0, x: 0, y: 0, width: W, height: H, right: W, bottom: H });
  el.focus ??= () => {};
  el.blur ??= () => {};
  el.setAttribute ??= () => {};
  el.getAttribute ??= () => null;
  el.parentNode ??= null;
  return el;
}

/** 第一次 wx.createCanvas 得到的是上屏画布，之后都是离屏画布 */
const screenCanvas = patchElement(wx.createCanvas(), 'canvas');
screenCanvas.clientWidth = W;
screenCanvas.clientHeight = H;

function createCanvas() {
  return patchElement(wx.createCanvas(), 'canvas');
}

let tmpFileId = 0;
function createImage() {
  const img = patchElement(wx.createImage(), 'img');
  // 部分基础库不支持 data URI（Phaser 的默认纹理就是），先写成临时文件再加载
  const desc = findDescriptor(img, 'src');
  if (desc?.set && desc.get) {
    const { get, set } = desc;
    Object.defineProperty(img, 'src', {
      configurable: true,
      get: () => get.call(img),
      set: (v: string) => {
        const m = /^data:image\/(\w+);base64,(.*)$/.exec(v);
        if (m) {
          const path = `${wx.env.USER_DATA_PATH}/__tmp_${tmpFileId++}.${m[1]}`;
          wx.getFileSystemManager().writeFileSync(path, m[2], 'base64');
          v = path;
        }
        set.call(img, v);
      },
    });
  }
  return img;
}

function findDescriptor(obj: any, key: string): PropertyDescriptor | undefined {
  for (let o = obj; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key);
    if (d) return d;
  }
  return undefined;
}

// ---------- document ----------
const documentElement = patchElement({ clientWidth: W, clientHeight: H, ontouchstart: null }, 'html');
const body = patchElement({ appendChild: (c: any) => c, removeChild: (c: any) => c, contains: () => false }, 'body');
body.clientWidth = W;
body.clientHeight = H;

const docTarget = new Target();
const document: any = {
  readyState: 'complete',
  visibilityState: 'visible',
  hidden: false,
  fullscreenEnabled: false,
  documentElement,
  body,
  head: body,
  createElement(tag: string) {
    tag = tag.toLowerCase();
    if (tag === 'canvas') return createCanvas();
    if (tag === 'img') return createImage();
    // audio/video：只用于能力检测，返回不支持任何格式
    return patchElement({ canPlayType: () => '', appendChild: (c: any) => c, removeChild: (c: any) => c }, tag);
  },
  createElementNS(_ns: string, tag: string) {
    return document.createElement(tag);
  },
  getElementById: () => null,
  getElementsByTagName: (tag: string) => (tag === 'canvas' ? [screenCanvas] : []),
  querySelector: () => null,
  addEventListener: docTarget.addEventListener.bind(docTarget),
  removeEventListener: docTarget.removeEventListener.bind(docTarget),
  dispatchEvent: docTarget.dispatchEvent.bind(docTarget),
};

// ---------- window ----------
const winTarget = new Target();
const navigator = {
  userAgent: `Mozilla/5.0 (${info.platform === 'ios' ? 'iPhone; CPU iPhone OS 16_0 like Mac OS X' : 'Linux; Android 12'}) AppleWebKit/537.36 (KHTML, like Gecko) Mobile WeChatGame`,
  appVersion: '5.0',
  language: 'zh-CN',
  platform: info.platform,
  maxTouchPoints: 10,
  onLine: true,
};

const win: any = g;
Object.assign(win, {
  innerWidth: W,
  innerHeight: H,
  devicePixelRatio: info.pixelRatio,
  screen: { width: W, height: H, availWidth: W, availHeight: H },
  document,
  navigator,
  performance,
  location: { href: 'game.js', protocol: 'https:', hostname: 'wechatgame', search: '', hash: '' },
  HTMLElement: function HTMLElement() {},
  HTMLCanvasElement: function HTMLCanvasElement() {},
  HTMLImageElement: function HTMLImageElement() {},
  HTMLVideoElement: function HTMLVideoElement() {},
  Image: function Image() {
    return createImage();
  },
  addEventListener: winTarget.addEventListener.bind(winTarget),
  removeEventListener: winTarget.removeEventListener.bind(winTarget),
  dispatchEvent: winTarget.dispatchEvent.bind(winTarget),
  focus() {},
  blur() {},
  scrollTo() {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  // 时间戳统一用上面的 performance，避免 Phaser 混用两种时钟
  requestAnimationFrame: (cb: (t: number) => void) => requestAnimationFrame(() => cb(performance.now())),
  cancelAnimationFrame: (id: number) => cancelAnimationFrame(id),
});
win.window = win;
win.self = win;
win.top = win;
win.parent = win;

// ---------- 触摸 ----------
function toTouch(t: any) {
  return {
    identifier: t.identifier,
    clientX: t.clientX,
    clientY: t.clientY,
    pageX: t.pageX ?? t.clientX,
    pageY: t.pageY ?? t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    target: screenCanvas,
  };
}

function bindTouch(wxName: string, type: string) {
  wx[wxName]((res: any) => {
    const touches = (res.touches ?? []).map(toTouch);
    const event = {
      type,
      target: screenCanvas,
      currentTarget: screenCanvas,
      touches,
      targetTouches: touches,
      changedTouches: (res.changedTouches ?? []).map(toTouch),
      timeStamp: res.timeStamp ?? performance.now(),
      cancelable: true,
      defaultPrevented: false,
      preventDefault() {},
      stopPropagation() {},
    };
    screenCanvas.dispatchEvent(event);
  });
}
bindTouch('onTouchStart', 'touchstart');
bindTouch('onTouchMove', 'touchmove');
bindTouch('onTouchEnd', 'touchend');
bindTouch('onTouchCancel', 'touchcancel');

// ---------- 前后台切换 ----------
wx.onHide(() => {
  document.hidden = true;
  document.visibilityState = 'hidden';
  document.dispatchEvent({ type: 'visibilitychange' });
});
wx.onShow(() => {
  document.hidden = false;
  document.visibilityState = 'visible';
  document.dispatchEvent({ type: 'visibilitychange' });
});

export { screenCanvas };
