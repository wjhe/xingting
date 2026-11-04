import Phaser from 'phaser';
import { REBIRTH_POINTS_BONUS } from '../../core/ads';
import { isTalentAvailable, unlockTalent, type MetaState, type Settlement } from '../../core/meta';
import { adButton, floatHint, maybeInterstitial, watchRewarded } from '../ads';
import { REALMS } from '../../core/realms';
import { CONTENT } from '../../data';
import { ASSET_KEYS, hasImage } from '../assets';
import { audio } from '../audio';
import { SLICE, TEX } from '../ink';
import { loadMeta, saveMeta } from '../session';
import { COLORS, DESIGN_W, FONT, TEXT_COLORS } from '../theme';
import { addBackdrop, addBrushLine, Button, getPlatform, makeText, ScrollView, setupCamera } from '../ui';

const PAD = 30;
const BTN_W = 190;
const BTN_H = 72;
const FOOTER_H = 150;

/** 轮回殿：本世结算、图鉴进度、花轮回点解锁天赋 */
export class RebirthScene extends Phaser.Scene {
  private meta!: MetaState;
  private settlement: Settlement | null = null;
  private view!: ScrollView;
  /** 本次结算已经看视频加成过 */
  private boosted = false;
  private leaving = false;
  private footerTop = 0;

  constructor() {
    super('Rebirth');
  }

  init(data: { settlement?: Settlement }): void {
    this.settlement = data?.settlement ?? null;
    this.boosted = false;
    this.leaving = false;
  }

  create(): void {
    const { width: W, height: H, safeTop, safeBottom } = setupCamera(this);
    addBackdrop(this, { mountains: true, mountainY: safeTop - 100 });
    this.meta = loadMeta(getPlatform(this));
    audio.playBgm('title');
    const footerTop = H - safeBottom - FOOTER_H;
    this.footerTop = footerTop;
    this.view = new ScrollView(this, 10000, safeTop, footerTop - safeTop);

    this.add.image(0, footerTop, TEX.white).setOrigin(0, 0).setDisplaySize(W, FOOTER_H + safeBottom).setTint(COLORS.panel).setAlpha(0.96);
    addBrushLine(this, 0, footerTop, W, 0.6);
    new Button(this, PAD, footerTop + 24, W - PAD * 2, 100, `开始第 ${this.meta.lives + 1} 世`, () => this.leave(), {
      primary: true,
      size: 34,
    });
    this.build();
  }

  private build(): void {
    const v = this.view;
    const scroll = v.cam.scrollY;
    v.clear();
    const x0 = v.originX;
    let y = 40;
    const text = (x: number, s: string, opts: Parameters<typeof makeText>[4] = {}) => v.add(makeText(this, x0 + x, y, s, opts));
    const divider = () => {
      v.add(this.add.image(x0 + PAD, y, TEX.white).setOrigin(0, 0).setDisplaySize(DESIGN_W - PAD * 2, 2).setTint(COLORS.line));
      y += 16;
    };

    if (hasImage(this, ASSET_KEYS.rebirth)) {
      const w = DESIGN_W - PAD * 2;
      const h = Math.round((w * 2) / 3);
      v.add(this.add.image(x0 + PAD, y, ASSET_KEYS.rebirth).setOrigin(0, 0).setDisplaySize(w, h).setTint(COLORS.artTint));
      v.add(
        this.add
          .nineslice(x0 + PAD - 6, y - 6, TEX.frame, undefined, w + 12, h + 12, SLICE.frame, SLICE.frame, SLICE.frame, SLICE.frame)
          .setOrigin(0, 0)
          .setTint(COLORS.btnBorder),
      );
      y += h - 90;
      text(DESIGN_W / 2, '轮 回 殿', { size: 56, color: TEXT_COLORS.title, bold: true }).setOrigin(0.5, 0).setShadow(0, 2, '#000', 8, false, true);
      y += 130;
    } else {
      text(DESIGN_W / 2, '轮 回 殿', { size: 56, color: TEXT_COLORS.title, bold: true }).setOrigin(0.5, 0);
      y += 100;
    }

    if (this.settlement) {
      text(PAD, '本世结算', { size: FONT.small, color: TEXT_COLORS.title });
      y += 44;
      divider();
      for (const [label, n] of this.settlement.lines) {
        text(PAD, label);
        text(DESIGN_W - PAD, `+${n}`, { color: TEXT_COLORS.good }).setOrigin(1, 0);
        y += 48;
      }
      const bonus = Math.ceil(this.settlement.total * REBIRTH_POINTS_BONUS);
      if (this.boosted) {
        text(PAD, '视频加成');
        text(DESIGN_W - PAD, `+${bonus}`, { color: TEXT_COLORS.good }).setOrigin(1, 0);
        y += 48;
      }
      const total = this.settlement.total + (this.boosted ? bonus : 0);
      text(DESIGN_W - PAD, `共 +${total} 轮回点`, { color: TEXT_COLORS.gold, bold: true }).setOrigin(1, 0);
      y += 70;
      // 看视频：本世轮回点 ×1.5（每次结算一次）
      if (!this.boosted && bonus > 0) {
        const b = adButton(this, 'rebirth_points', `轮回点 ×1.5（+${bonus}）`);
        v.add(new Button(this, x0 + PAD, y, DESIGN_W - PAD * 2, BTN_H, b.label, () => this.boost(bonus), { size: FONT.small })).setEnabled(b.enabled);
        y += BTN_H + 30;
      }
    }

    const m = this.meta;
    text(PAD, '轮回', { size: FONT.small, color: TEXT_COLORS.title });
    y += 44;
    divider();
    const codexTotal = CONTENT.events.length;
    const rows: [string, string][] = [
      ['已历', `${m.lives} 世`],
      ['历代最高', REALMS[m.bestRealm].name],
      ['奇遇图鉴', `${m.codex.length} / ${codexTotal}`],
      ['结局', `${m.endings.length} / ${CONTENT.endings.length}${m.endings.length ? `（${m.endings.map((id) => CONTENT.endings.find((e) => e.id === id)?.name).join('、')}）` : ''}`],
      ['轮回点', `${m.points}`],
    ];
    for (const [k, val] of rows) {
      text(PAD, k, { size: FONT.small, color: TEXT_COLORS.dim });
      const t = text(200, val, { color: k === '轮回点' ? TEXT_COLORS.gold : TEXT_COLORS.normal, wrap: DESIGN_W - 200 - PAD });
      y += Math.max(48, t.height + 12);
    }
    y += 30;

    text(PAD, '天赋', { size: FONT.small, color: TEXT_COLORS.title });
    text(DESIGN_W - PAD, '解锁后可在开局时抽到', { size: FONT.small, color: TEXT_COLORS.dim }).setOrigin(1, 0);
    y += 44;
    divider();
    const talents = CONTENT.talents.filter((t) => t.cost > 0).sort((a, b) => a.cost - b.cost);
    for (const t of talents) {
      const owned = isTalentAvailable(m, t);
      const top = y;
      text(PAD, t.name, { color: owned ? TEXT_COLORS.gold : TEXT_COLORS.normal });
      y += 42;
      const d = text(PAD, t.desc, { size: FONT.small, color: TEXT_COLORS.dim, wrap: DESIGN_W - PAD * 3 - BTN_W });
      const label = owned ? '已解锁' : `${t.cost} 点解锁`;
      const btn = v.add(new Button(this, x0 + DESIGN_W - PAD - BTN_W, top, BTN_W, BTN_H, label, () => this.unlock(t.id), { size: FONT.small }));
      btn.setEnabled(!owned && m.points >= t.cost);
      y = Math.max(y + d.height, top + BTN_H) + 18;
      divider();
    }

    v.contentHeight = y + 20;
    v.cam.scrollY = scroll;
    v.scrollBy(0);
  }

  private boost(bonus: number): void {
    void watchRewarded(this, 'rebirth_points', (t) => floatHint(this, DESIGN_W / 2, this.footerTop - 50, t)).then((ok) => {
      if (!ok || this.boosted || !this.scene.isActive()) return;
      // 播放期间账本已经写入，重新读一遍再加点
      this.meta = loadMeta(getPlatform(this));
      this.meta.points += bonus;
      saveMeta(getPlatform(this), this.meta);
      this.boosted = true;
      audio.sfx('coin');
      this.build();
    });
  }

  /** 离开轮回殿：插屏只在这里按规则偶尔出现，放完再进开局 */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    void maybeInterstitial(this).then(() => this.scene.start('Create'));
  }

  private unlock(id: string): void {
    const t = CONTENT.talents.find((x) => x.id === id);
    if (t && unlockTalent(this.meta, t)) {
      saveMeta(getPlatform(this), this.meta);
      this.build();
    }
  }
}
