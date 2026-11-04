import type Phaser from 'phaser';

/** 两次返回键间隔在这个时间内才退出 */
const EXIT_WINDOW_MS = 2000;

interface BackHandler {
  handleBack(): boolean;
  hint(text: string): void;
}

/**
 * 安卓（Capacitor）专有的处理：返回键、切到后台时暂停音乐并存档。
 * 浏览器里不做任何事；插件按需加载，不影响网页版。
 */
export async function setupAndroid(game: Phaser.Game): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');

  let lastBack = 0;
  App.addListener('backButton', () => {
    const main = game.scene.isActive('Main') ? (game.scene.getScene('Main') as unknown as BackHandler) : null;
    if (main?.handleBack()) return;
    const now = Date.now();
    if (now - lastBack < EXIT_WINDOW_MS) {
      App.exitApp();
      return;
    }
    lastBack = now;
    main?.hint('再按一次返回键退出');
  });

  // 切到后台：存档（MainScene 监听 hidden）并暂停声音；回来时恢复
  App.addListener('pause', () => {
    game.events.emit('hidden');
    game.sound.pauseAll();
  });
  App.addListener('resume', () => {
    game.sound.resumeAll();
    game.events.emit('visible');
  });
}
