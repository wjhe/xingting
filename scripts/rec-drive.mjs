// 实机录屏用的驱动脚本：连设备的 WebView DevTools，按屏幕上的文字找到按钮并点击。
// 前提：装的是 `npm run build:android -- debug` 打出来的包（暴露 window.__game）。
// 仅供录屏使用，不参与正式构建。
import { chromium } from 'playwright-core';

export async function connect(port = 9222) {
  const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith('https://localhost')) ?? ctx.pages()[0];
  return { browser, page };
}

/**
 * 世界坐标 → 屏幕坐标。游戏给每个页签各建了一个相机（scrollX 10000/20000/50000…），
 * 所以要先挑出"能把这点落在视口内"的那个相机，再按相机的矩阵换算。
 */
export const PROJECT = `(function () {
  var g = window.__game;
  var s = g.scale;
  var rect = g.canvas.getBoundingClientRect();
  return function (o) {
    var b = o.getBounds();
    var cams = o.scene.cameras.cameras;
    var chosen = null;
    for (var i = 0; i < cams.length; i++) {
      var c = cams[i];
      if (!c.visible) continue;
      var x = (b.centerX - c.scrollX) * c.zoom + c.x;
      var y = (b.centerY - c.scrollY) * c.zoom + c.y;
      if (x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height) { chosen = { x: x, y: y }; break; }
    }
    // 没有任何可见相机照得到它（例如别的页签的内容），就当它不在屏幕上
    if (!chosen) return null;
    return { cx: rect.left + chosen.x / s.displayScale.x, cy: rect.top + chosen.y / s.displayScale.y };
  };
})()`;

/** 在活动场景里按文字找对象，换算成 CSS 坐标（canvas 有缩放和相机 zoom，不能直接拿 x/y） */
export function locate(page, label) {
  return page.evaluate(
    ({ label, src }) => {
      const project = eval(src);
      const g = window.__game;
      let exact = null;
      let loose = null;
      const walk = (list) => {
        for (const o of list) {
          if (o.list) walk(o.list);
          else if (o.type === 'Text' && typeof o.text === 'string' && o.visible !== false) {
            const p = project(o);
            if (!p) continue;
            if (o.text === label) exact ??= { o, p };
            else if (o.text.includes(label)) loose ??= { o, p };
          }
        }
      };
      for (const s of g.scene.getScenes(true)) walk(s.children.list);
      const hit = exact ?? loose;
      if (!hit) return { found: false };
      return { found: true, text: hit.o.text, cx: hit.p.cx, cy: hit.p.cy };
    },
    { label, src: PROJECT },
  );
}

export async function tap(page, label, waitMs = 400) {
  const p = await locate(page, label);
  if (!p.found) throw new Error(`找不到：${label}`);
  await page.mouse.click(p.cx, p.cy);
  await page.waitForTimeout(waitMs);
  return p;
}

/** 当前活动场景里所有可见文字，调试用 */
export function texts(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const out = [];
    const walk = (list) => { for (const o of list) { if (o.list) walk(o.list); if (o.type === 'Text' && typeof o.text === 'string' && o.text.trim() && o.visible !== false) out.push(o.text); } };
    for (const s of g.scene.getScenes(true)) walk(s.children.list);
    return out;
  });
}

export const scenes = (page) => page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
