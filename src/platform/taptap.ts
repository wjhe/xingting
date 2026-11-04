/**
 * TapTap 登录与合规认证（实名、防沉迷）。安卓原生由 android/app/.../TapTapPlugin.java 实现；
 * 网页、微信没有 TapTap，返回 null，游戏直接进入。
 * 开发测试：浏览器里设置 localStorage wdcs_fake_tap，可走一遍模拟流程（值为要模拟的合规回调码，如 500、1030）。
 */

export interface TapAccount {
  openId: string;
  unionId?: string;
}

/** 合规认证回调码（TapSDK ComplianceMessage） */
export const COMPLIANCE = {
  /** 可以进入游戏 */
  OK: 500,
  /** 认证退出或凭证失效，回登录页 */
  EXITED: 1000,
  /** 玩家点了切换账号 */
  SWITCH_ACCOUNT: 1001,
  /** 未成年人不在可玩时段 */
  PERIOD_RESTRICT: 1030,
  /** 今日可玩时长已用完 */
  DURATION_LIMIT: 1050,
  /** 不满足开发者中心配置的可玩年龄 */
  AGE_LIMIT: 1100,
  /** 应用配置无效或网络异常 */
  NETWORK_ERROR: 1200,
  /** 玩家关闭了实名窗口 */
  REAL_NAME_STOP: 9002,
} as const;

export interface TapTapBridge {
  init(): Promise<void>;
  currentAccount(): Promise<TapAccount | null>;
  /** 玩家取消时抛出 code 为 cancel 的错误 */
  login(): Promise<TapAccount>;
  logout(): Promise<void>;
  /** 开始实名认证与防沉迷检查，结果通过 onCompliance 回调 */
  startCompliance(openId: string): Promise<void>;
  /** 合规回调，可能在游戏进行中任何时候到来（如时长用尽） */
  onCompliance(cb: (code: number) => void): void;
}

const FAKE_KEY = 'wdcs_fake_tap';

let cached: Promise<TapTapBridge | null> | null = null;

/** 当前平台可用的 TapTap 接口；没有（网页、微信、没配置 Client ID）时为 null */
export function getTapTap(): Promise<TapTapBridge | null> {
  return (cached ??= detect());
}

/** 是否在安卓原生壳里（需要隐私政策弹窗：TapSDK 和广告 SDK 都要求先征得同意再初始化） */
export async function isNativeApp(): Promise<boolean> {
  if (fakeCode() !== null) return true;
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function detect(): Promise<TapTapBridge | null> {
  const fake = fakeCode();
  if (fake !== null) return fakeBridge(fake);
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const plugin = registerPlugin<NativePlugin>('TapTap');
    const s = await plugin.status();
    return s.configured ? nativeBridge(plugin) : null;
  } catch {
    return null;
  }
}

interface NativePlugin {
  status(): Promise<{ configured: boolean; initialized: boolean }>;
  init(): Promise<void>;
  currentAccount(): Promise<{ account?: TapAccount }>;
  login(): Promise<{ account: TapAccount }>;
  logout(): Promise<void>;
  startCompliance(o: { openId: string }): Promise<void>;
  addListener(event: 'compliance', cb: (e: { code: number }) => void): Promise<unknown>;
}

function nativeBridge(p: NativePlugin): TapTapBridge {
  return {
    init: () => p.init(),
    currentAccount: async () => (await p.currentAccount()).account ?? null,
    login: async () => (await p.login()).account,
    logout: () => p.logout(),
    startCompliance: (openId) => p.startCompliance({ openId }),
    onCompliance: (cb) => void p.addListener('compliance', (e) => cb(e.code)),
  };
}

function fakeCode(): number | null {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(FAKE_KEY);
    if (!v) return null;
    return Number(v) || COMPLIANCE.OK;
  } catch {
    return null;
  }
}

/** 浏览器里的模拟：登录总是成功，合规结果按 localStorage 里的回调码返回 */
function fakeBridge(code: number): TapTapBridge {
  let account: TapAccount | null = null;
  const listeners: ((c: number) => void)[] = [];
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  // 测试用：在控制台调用 __fakeCompliance(1050) 模拟游戏中途收到防沉迷回调
  // 之后再认证也返回这个结果（真实 SDK 里时长用尽后再认证同样受限）
  (globalThis as { __fakeCompliance?: (c: number) => void }).__fakeCompliance = (c) => {
    code = c;
    listeners.forEach((l) => l(c));
  };
  return {
    init: () => delay(300),
    currentAccount: async () => account,
    login: async () => {
      await delay(500);
      account = { openId: 'fake_open_id' };
      return account;
    },
    // 和真机一致：清掉账号，SDK 退出合规时会回调 1000，然后才返回
    logout: async () => {
      await delay(100);
      account = null;
      for (const l of listeners) l(COMPLIANCE.EXITED);
    },
    startCompliance: async () => {
      await delay(500);
      for (const l of listeners) l(code);
    },
    onCompliance: (cb) => void listeners.push(cb),
  };
}
