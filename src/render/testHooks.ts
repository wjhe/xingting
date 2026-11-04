import Phaser from 'phaser';

type Pos = { x: number; y: number };

/**
 * 开发模式下给自动化脚本用的钩子（scripts/smoke.mjs、scripts/playthrough.mjs）：按文字找到按钮在页面上的位置。
 */
export function installTestHooks(game: Phaser.Game): void {
  /** 所有可见文本及其屏幕坐标（CSS 像素） */
  function visibleTexts(): { text: string; pos: Pos }[] {
    const rect = game.canvas.getBoundingClientRect();
    const out: { text: string; pos: Pos }[] = [];
    for (const scene of game.scene.getScenes(true)) {
      for (const obj of scene.children.list) {
        if (!(obj instanceof Phaser.GameObjects.Text) || !obj.visible || obj.alpha === 0) continue;
        const b = obj.getBounds();
        // 本项目的相机都是 origin(0,0)，worldView 不适用，直接按滚动偏移换算
        for (const cam of scene.cameras.cameras) {
          const cx = cam.x + (b.centerX - cam.scrollX) * cam.zoom;
          const cy = cam.y + (b.centerY - cam.scrollY) * cam.zoom;
          const inside = cx >= cam.x && cx <= cam.x + cam.width && cy >= cam.y && cy <= cam.y + cam.height;
          if (!cam.visible || !inside) continue;
          out.push({
            text: obj.text,
            pos: { x: rect.left + (cx * rect.width) / game.canvas.width, y: rect.top + (cy * rect.height) / game.canvas.height },
          });
          break;
        }
      }
    }
    return out;
  }

  const match = (t: string, label: string, prefix: boolean) => (prefix ? t.startsWith(label) : t === label);

  (window as unknown as { __test: unknown }).__test = {
    game,
    sim: () => (game.scene.getScene('Main') as unknown as { sim?: unknown })?.sim,
    texts: () => visibleTexts().map((t) => t.text),
    /** 是否有全屏转场正在播放（播放时点击只会跳过转场） */
    busy: () => game.scene.getScenes(true).some((s) => (s as unknown as { overlay?: { busy: boolean } }).overlay?.busy),
    /**
     * 文字等于（或以其开头）label 的可见文本中心。
     * 传 near 时，在多个同名按钮中选与 near 开头的文本最接近同一行的那个（如某件物品的"购买"）。
     */
    locate(label: string, prefix = false, near?: string): Pos | null {
      const all = visibleTexts();
      const hits = all.filter((t) => match(t.text, label, prefix));
      if (!near) return hits[0]?.pos ?? null;
      const anchor = all.find((t) => t.text.startsWith(near));
      if (!anchor) return null;
      hits.sort((a, b) => Math.abs(a.pos.y - anchor.pos.y) - Math.abs(b.pos.y - anchor.pos.y));
      return hits[0] && Math.abs(hits[0].pos.y - anchor.pos.y) < 60 ? hits[0].pos : null;
    },
  };
}
