import Phaser from 'phaser';
import { currentOffer, grantAdReroll, rerollOffer, TALENT_PICK, type MetaState } from '../../core/meta';
import { adButton, floatHint, watchRewarded } from '../ads';
import { randomName } from '../../core/names';
import { Rng } from '../../core/rng';
import type { Gender, TalentDef } from '../../core/types';
import { CONTENT } from '../../data';
import { loadMeta, newGame, saveGame, saveMeta } from '../session';
import { settings } from '../settings';
import { ASSET_KEYS, hasImage } from '../assets';
import { audio } from '../audio';
import { TEX } from '../ink';
import { COLORS, FONT, TEXT_COLORS } from '../theme';
import { addBackdrop, addBackdropPaper, Button, getPlatform, makeText, setupCamera } from '../ui';

const PAD = 40;
const TALENT_H = 78;

/** 开局：取名、选性别、选天赋 */
export class CreateScene extends Phaser.Scene {
  private gender: Gender = 'male';
  private name = '';
  private rng = Rng.fromSeed(Date.now() >>> 0);
  private meta!: MetaState;
  private nameText!: Phaser.GameObjects.Text;
  private maleBtn!: Button;
  private femaleBtn!: Button;
  private offer: TalentDef[] = [];
  private picked = new Set<string>();
  private talentBtns: Button[] = [];
  private rerollBtn!: Button;
  private talentTop = 0;
  /** 防止连点"踏入仙途"创建两份存档 */
  private started = false;

  constructor() {
    super('Create');
  }

  init(): void {
    this.meta = loadMeta(getPlatform(this));
    this.picked = new Set();
    this.talentBtns = [];
    this.started = false;
  }

  create(): void {
    const { width: W, height: H, safeTop, safeBottom } = setupCamera(this);
    const cx = W / 2;
    const life = this.meta.lives + 1;
    // 表单（道号、性别、天赋）贴着底部的按钮排，上方空出来给主视觉
    const startY = H - safeBottom - 140;
    const buttonsTop = this.meta.lives > 0 ? startY - 100 : startY;
    const FORM_H = 100 + 100 + 64 + 5 * (TALENT_H + 12);
    const formTop = Math.max(safeTop + 220, buttonsTop - 30 - FORM_H);

    if (hasImage(this, ASSET_KEYS.cover)) {
      addBackdrop(this);
      const cover = this.add.image(0, 0, ASSET_KEYS.cover).setOrigin(0, 0);
      cover.setDisplaySize(W, (W * cover.height) / cover.width).setTint(COLORS.artTint).setAlpha(settings.theme === 'night' ? 0.85 : 0.95);
      // 主视觉下沿在表单上方渐隐到底色
      const fadeTop = formTop - 260;
      this.add.image(0, fadeTop, TEX.fade).setOrigin(0, 0).setDisplaySize(W, 230).setTint(COLORS.bg);
      this.add.image(0, fadeTop + 228, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(COLORS.bg);
      addBackdropPaper(this, fadeTop + 228);
    } else {
      addBackdrop(this, { mountains: true, mountainY: safeTop - 60 });
      // 页面下方再叠一层远山，填补留白
      this.add.image(0, H - safeBottom - 560, TEX.mountains).setOrigin(0, 0).setTint(COLORS.mountain).setAlpha(0.45).setFlipX(true);
    }
    let y = safeTop + 70;

    if (hasImage(this, ASSET_KEYS.title)) {
      // 书法标题是白字透明底，按主题着色
      const img = this.add.image(cx, y - 8, ASSET_KEYS.title).setTint(parseInt(TEXT_COLORS.title.slice(1), 16));
      img.setScale(Math.min(460 / img.width, 96 / img.height));
    } else {
      makeText(this, cx, y, '问道长生', { size: 64, color: TEXT_COLORS.title, bold: true }).setOrigin(0.5);
    }
    audio.playBgm('title');
    y += 70;
    const sub = life > 1 ? `—— 第 ${life} 世 ——` : '寿元有限，仙路漫漫';
    makeText(this, cx, y, sub, { size: FONT.body, color: life > 1 ? TEXT_COLORS.whisper : TEXT_COLORS.normal })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 8, false, true);

    y = formTop - 90;
    y += 90;
    makeText(this, PAD, y, '道号', { color: TEXT_COLORS.dim });
    this.name = randomName(this.rng, this.gender);
    this.nameText = makeText(this, 150, y - 6, this.name, { size: 40, color: TEXT_COLORS.gold, bold: true });
    new Button(this, 450, y - 20, 120, 76, '改名', () => this.rename(), { size: FONT.small });
    new Button(this, 590, y - 20, 120, 76, '随机', () => this.setName(randomName(this.rng, this.gender)), { size: FONT.small });

    y += 100;
    makeText(this, PAD, y, '性别', { color: TEXT_COLORS.dim });
    this.maleBtn = new Button(this, 150, y - 20, 200, 76, '男', () => this.setGender('male'));
    this.femaleBtn = new Button(this, 370, y - 20, 200, 76, '女', () => this.setGender('female'));
    this.refreshGender();

    y += 100;
    makeText(this, PAD, y, `天赋（选 ${TALENT_PICK} 个）`, { color: TEXT_COLORS.dim });
    this.rerollBtn = new Button(this, W - PAD - 240, y - 16, 240, 66, '', () => this.reroll(), { size: FONT.small });
    this.talentTop = y + 64;
    this.offer = currentOffer(this.meta, CONTENT, this.rng);
    saveMeta(getPlatform(this), this.meta);
    this.buildTalents();

    new Button(this, PAD, startY, W - PAD * 2, 104, '踏入仙途', () => this.start(), { primary: true, size: 36 });
    if (this.meta.lives > 0) {
      const label = `轮回殿（轮回点 ${this.meta.points}）`;
      new Button(this, PAD, startY - 100, W - PAD * 2, 80, label, () => this.scene.start('Rebirth'), { size: FONT.body });
    }
  }

  private buildTalents(): void {
    for (const b of this.talentBtns) b.destroy();
    this.talentBtns = this.offer.map((t, i) => {
      const y = this.talentTop + i * (TALENT_H + 12);
      return new Button(this, PAD, y, 750 - PAD * 2, TALENT_H, '', () => this.toggle(t.id), { size: 26 });
    });
    // 免费次数用完后，每世还可以看一次视频再换
    if (this.meta.rerolls > 0 || this.meta.adReroll) {
      this.rerollBtn.setText(`换一批（${this.meta.rerolls}）`).setEnabled(this.meta.rerolls > 0);
    } else {
      const ok = adButton(this, 'talent_reroll', '').enabled;
      this.rerollBtn.setText(ok ? '▶ 看视频换一批' : '暂无可用视频').setEnabled(ok);
    }
    this.refreshTalents();
  }

  private toggle(id: string): void {
    if (this.picked.has(id)) this.picked.delete(id);
    else if (this.picked.size < TALENT_PICK) this.picked.add(id);
    this.refreshTalents();
  }

  private refreshTalents(): void {
    this.offer.forEach((t, i) => {
      const on = this.picked.has(t.id);
      this.talentBtns[i].setText(`${on ? '✓ ' : ''}${t.name} · ${t.desc}`).setPrimary(on);
    });
  }

  private reroll(): void {
    if (this.meta.rerolls <= 0) {
      const b = this.rerollBtn;
      void watchRewarded(this, 'talent_reroll', (t) => floatHint(this, b.center.x, b.center.y - 56, t)).then((ok) => {
        if (!ok || !this.scene.isActive()) return;
        // 播放期间可能被改过，重新读一遍
        this.meta = loadMeta(getPlatform(this));
        if (grantAdReroll(this.meta)) this.reroll();
      });
      return;
    }
    if (!rerollOffer(this.meta, CONTENT, this.rng)) return;
    saveMeta(getPlatform(this), this.meta);
    this.picked.clear();
    this.offer = currentOffer(this.meta, CONTENT, this.rng);
    this.buildTalents();
  }

  private setName(name: string): void {
    this.name = name;
    this.nameText.setText(name);
  }

  private setGender(g: Gender): void {
    if (g === this.gender) return;
    this.gender = g;
    this.setName(randomName(this.rng, g));
    this.refreshGender();
  }

  private refreshGender(): void {
    this.maleBtn.setText(this.gender === 'male' ? '● 男' : '男');
    this.femaleBtn.setText(this.gender === 'female' ? '● 女' : '女');
  }

  private async rename(): Promise<void> {
    const input = await getPlatform(this).promptText('请输入道号（1～8 字）', this.name);
    const name = input?.trim().slice(0, 8);
    if (name) this.setName(name);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    const platform = getPlatform(this);
    const game = newGame(platform, this.name, this.gender, [...this.picked]);
    saveGame(platform, game);
    this.scene.start('Main', { game });
  }
}
