import Phaser from 'phaser';
import { fmtNum, type BattleReplay } from '../core/game';
import type { BattleStep } from '../core/combat';
import { ASSET_KEYS, hasImage } from './assets';
import { audio } from './audio';
import { shakeAll } from './fx';
import { pillTex, SLICE, TEX } from './ink';
import { COLORS, DESIGN_W, TEXT_COLORS } from './theme';
import { getLayout, makeText } from './ui';

/** 每次出手的间隔（毫秒）；战斗太长时中段快进 */
const STEP_MS = 520;
const FAST_MS = 110;
/** 开头、结尾按正常速度播放的出手次数 */
const HEAD = 8;
const TAIL = 4;
/** 立绘基准尺寸（屏幕较矮时按比例缩小） */
const PORTRAIT_E = 360;
const PORTRAIT_P = 250;
const BAR_W = 480;
/** 法术大字所在的中线、回合叙述所在行（占屏幕高度的比例） */
const MID = 0.5;
const CAPTION = 0.585;

type Obj = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

/** 一条圆角血条 */
interface PillBar {
  track: Phaser.GameObjects.NineSlice;
  fill: Phaser.GameObjects.NineSlice;
  h: number;
}

/**
 * 战斗回放：敌我立绘、血条、逐回合出手动画、伤害数字、法术字、胜负印章。
 * 点击：播放中跳到结局，结局时关闭。
 */
export class BattleView {
  private objs: Obj[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private finished = false;
  private closed = false;

  private eHpBar!: PillBar;
  private pHpBar!: PillBar;
  private pMpBar: PillBar | null = null;
  private ePortrait!: Phaser.GameObjects.Container;
  private pPortrait!: Phaser.GameObjects.Container;
  private caption!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private eHpText!: Phaser.GameObjects.Text;
  private pHpText!: Phaser.GameObjects.Text;
  private eY = 0;
  private pY = 0;
  /** 实际立绘尺寸 */
  private pe = PORTRAIT_E;
  private pp = PORTRAIT_P;

  constructor(
    private scene: Phaser.Scene,
    private ox: number,
    private r: BattleReplay,
    private playerPortrait: string,
    private done: () => void,
  ) {}

  play(): void {
    const s = this.scene;
    const { height: H } = getLayout(s);
    const W = DESIGN_W;
    const cx = this.ox + W / 2;
    // 以 750×1624（常见全面屏）为基准，矮屏按比例缩小立绘
    const k = Math.max(0.68, Math.min(1, H / 1624));
    this.pe = Math.round(this.pe * k);
    this.pp = Math.round(this.pp * k);
    this.eY = H * 0.25;
    this.pY = H * 0.76;

    // 底：纸色遮罩 + 宣纸纹 + 中央一道墨痕
    this.add(s.add.image(this.ox, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(COLORS.bg).setAlpha(0.97));
    this.add(s.add.tileSprite(this.ox, 0, W, H, TEX.paper).setOrigin(0, 0).setTint(COLORS.fiber).setAlpha(0.9));
    this.add(s.add.image(this.ox, H - 420, TEX.mountains).setOrigin(0, 0).setDisplaySize(W, 420).setTint(COLORS.mountain).setAlpha(0.35));
    this.add(s.add.image(this.ox, H * MID, TEX.brush).setOrigin(0, 0.5).setDisplaySize(W, 40).setTint(COLORS.ink).setAlpha(0.12));

    // 敌人
    this.ePortrait = this.portrait(cx, this.eY, this.pe, ASSET_KEYS.enemy(this.r.enemyId), this.r.enemyName);
    this.add(makeText(s, cx, this.eY + this.pe / 2 + 18, this.r.enemyName, { size: 36, color: TEXT_COLORS.title, bold: true, scale: 1 }).setOrigin(0.5, 0));
    this.eHpBar = this.makeBar(this.eY + this.pe / 2 + 70, 18);
    this.eHpText = this.add(makeText(s, cx, this.eY + this.pe / 2 + 96, '', { size: 22, color: TEXT_COLORS.dim, scale: 1 }).setOrigin(0.5, 0));

    // 玩家
    this.pPortrait = this.portrait(cx, this.pY, this.pp, this.playerPortrait, '你');
    this.add(makeText(s, cx, this.pY + this.pp / 2 + 14, this.r.pName, { size: 30, color: TEXT_COLORS.gold, bold: true, scale: 1 }).setOrigin(0.5, 0));
    this.pHpBar = this.makeBar(this.pY + this.pp / 2 + 60, 18);
    if (this.r.pMaxMp > 0) this.pMpBar = this.makeBar(this.pY + this.pp / 2 + 84, 10);
    this.pHpText = this.add(makeText(s, cx, this.pY + this.pp / 2 + 102, '', { size: 22, color: TEXT_COLORS.dim, scale: 1 }).setOrigin(0.5, 0));

    this.caption = this.add(
      makeText(s, cx, H * CAPTION, '', { size: 30, color: TEXT_COLORS.normal, wrap: W - 100, align: 'center', scale: 1 }).setOrigin(0.5),
    );
    this.hint = this.add(makeText(s, cx, H - 26, '点击跳过', { size: 22, color: TEXT_COLORS.dim, scale: 1 }).setOrigin(0.5));

    const zone = this.add(s.add.zone(this.ox, 0, W, H).setOrigin(0, 0).setInteractive());
    zone.on('pointerup', () => (this.finished ? this.close() : this.skip()));

    this.drawBars(this.r.eHp0, this.r.pHp0, this.r.pMaxMp);
    this.setDepth();

    // 入场：立绘从两侧滑入
    this.ePortrait.x += 200;
    this.pPortrait.x -= 200;
    s.tweens.add({ targets: this.ePortrait, x: cx, duration: 380, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: this.pPortrait, x: cx, duration: 380, ease: 'Cubic.easeOut' });
    this.caption.setText(this.r.tribulation ? `${this.r.enemyName}降临！` : `${this.r.enemyName}拦住了去路！`);

    let t = 520;
    // 开场符箓
    for (const o of this.r.opening) {
      this.at(t, () => this.showOpening(o));
      t += STEP_MS + 200;
    }
    // 出手
    const n = this.r.steps.length;
    this.r.steps.forEach((step, i) => {
      const fast = i >= HEAD && i < n - TAIL;
      if (fast && i === HEAD) this.at(t, () => this.caption.setText('……双方缠斗不休……'));
      this.at(t, () => this.showStep(step, fast));
      t += fast ? FAST_MS : STEP_MS;
    });
    this.at(t + 250, () => this.finish());
  }

  // ---------- 回合 ----------

  private showOpening(o: BattleReplay['opening'][number]): void {
    this.caption.setText(o.kind === 'damage' ? `你祭出【${o.name}】！` : `你拍出【${o.name}】，周身泛起金光！`);
    this.bigWord(o.name, COLORS.seal);
    if (o.kind === 'damage') {
      this.hitPortrait(this.ePortrait, this.eY, this.pe, o.value, false);
      this.drawBars(Math.max(1, this.r.eHp0), this.r.pHp0, this.r.pMaxMp);
    } else {
      this.floatText(this.pPortrait.x, this.pY - this.pp / 2, `防御 +${o.value}`, TEXT_COLORS.good, 30);
    }
  }

  private showStep(step: BattleStep, fast: boolean): void {
    const mine = step.by === 'p';
    if (!fast) {
      const who = mine ? '你' : this.r.enemyName;
      const act = step.spell ? `施展【${step.spell}】` : mine ? this.r.pVerb : this.r.eVerb;
      if (this.r.tribulation) {
        const n = this.r.eMaxHp - step.eHp;
        this.caption.setText(step.crit ? `最后一道天雷！` : `第 ${n} 道天雷劈落！`);
        if (step.crit) this.bigWord('最后一道天雷', COLORS.seal);
        shakeAll(this.scene, 140, 0.008);
      } else {
        this.caption.setText(`${who}${act}${step.crit ? '，正中要害！' : '。'}`);
      }
      if (step.spell) this.bigWord(step.spell, mine ? COLORS.bar : COLORS.seal);
      audio.sfx(step.crit ? 'hit' : 'click');
    }
    // 出手方往前一冲
    const att = mine ? this.pPortrait : this.ePortrait;
    const dir = mine ? -1 : 1;
    if (!fast) this.scene.tweens.add({ targets: att, y: att.y + dir * 30, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    const target = mine ? this.ePortrait : this.pPortrait;
    const ty = mine ? this.eY : this.pY;
    const size = mine ? this.pe : this.pp;
    if (step.dodge) {
      // 闪开：被打的一方往旁边一让，飘一个"闪"字
      if (!fast) this.scene.tweens.add({ targets: target, x: target.x + 40, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
      this.floatText(target.x, ty - size * 0.15, '闪', TEXT_COLORS.dim, fast ? 30 : 44);
    } else {
      this.hitPortrait(target, ty, size, step.dmg, step.crit, fast);
    }
    this.drawBars(step.eHp, step.pHp, step.pMp);
  }

  private hitPortrait(target: Phaser.GameObjects.Container, y: number, size: number, dmg: number, crit: boolean, fast = false): void {
    const s = this.scene;
    if (!fast) {
      s.tweens.add({ targets: target, x: target.x + (crit ? 16 : 8), duration: 40, yoyo: true, repeat: crit ? 3 : 1 });
      const flashRect = target.getAt(target.length - 1) as Phaser.GameObjects.Image;
      flashRect.setAlpha(crit ? 0.7 : 0.45);
      s.tweens.add({ targets: flashRect, alpha: 0, duration: 260 });
    }
    const color = crit ? '#c0392b' : TEXT_COLORS.bad;
    const offset = (Math.random() - 0.5) * size * 0.5;
    this.floatText(target.x + offset, y - size * 0.15, `${crit ? '暴击 ' : ''}-${dmg}`, color, crit ? 60 : fast ? 30 : 46);
  }

  /** 法术、符箓名：大字从右扫到中间，停一下淡出 */
  private bigWord(text: string, tint: number): void {
    const s = this.scene;
    const { height: H } = getLayout(s);
    const cx = this.ox + DESIGN_W / 2;
    const stroke = this.add(s.add.image(cx, H * MID, TEX.brush).setDisplaySize(DESIGN_W * 0.9, 120).setTint(tint).setAlpha(0).setDepth(1105));
    const word = this.add(makeText(s, cx + 120, H * MID, text, { size: 64, color: '#fff8ee', bold: true, scale: 1 }).setOrigin(0.5).setAlpha(0).setDepth(1106));
    word.setShadow(0, 3, '#000000', 10, false, true);
    s.tweens.add({ targets: stroke, alpha: 0.85, duration: 120 });
    s.tweens.add({ targets: word, alpha: 1, x: cx, duration: 180, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: [stroke, word], alpha: 0, delay: 420, duration: 200, onComplete: () => { stroke.destroy(); word.destroy(); } });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const s = this.scene;
    const t = this.add(makeText(s, x, y, text, { size, color, bold: true, scale: 1 }).setOrigin(0.5).setDepth(1107));
    t.setStroke('#fff8ee', 6);
    s.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 250, duration: 650, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  // ---------- 结局 ----------

  private skip(): void {
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    const last = this.r.steps[this.r.steps.length - 1];
    if (last) this.drawBars(last.eHp, last.pHp, last.pMp);
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const s = this.scene;
    const { height: H } = getLayout(s);
    const cx = this.ox + DESIGN_W / 2;
    const r = this.r;
    const char = r.tribulation ? (r.result === 'win' ? '过' : '殒') : r.result === 'win' ? '胜' : r.result === 'lose' ? '败' : '平';
    const lines: Record<string, string> = r.tribulation
      ? { win: '天雷尽数落下，你还站着！', draw: '劫云散去。', lose: '天雷将你劈落尘埃……' }
      : {
          win: `${r.enemyName}倒下了。`,
          draw: '久战不下，双方各自退去。',
          lose: '你不敌对手……',
        };
    let text = lines[r.result];
    if (r.aftermath?.kind === 'escape') text = `眼看不敌，你捏碎【${r.aftermath.talisman}】遁走。`;
    if (r.aftermath?.kind === 'fled') text = r.tribulation ? '你拼着最后一口气护住了元神。' : '你身受重伤，拼死逃脱。';
    if (r.aftermath?.kind === 'killed') text = r.tribulation ? '雷光吞没了一切……' : '一击穿心，眼前渐渐暗了下去……';
    this.caption.setText(text);
    if (r.result === 'win') {
      audio.sfx('win');
      s.tweens.add({ targets: this.ePortrait, alpha: 0.25, angle: 8, y: this.eY + 20, duration: 500 });
    } else if (r.result === 'lose') {
      audio.sfx('hit');
      s.tweens.add({ targets: this.pPortrait, alpha: 0.35, duration: 500 });
    }

    // 胜负印章
    const S = 200;
    const g = s.add
      .nineslice(-S / 2, -S / 2, TEX.btn, undefined, S, S, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(r.result === 'win' ? COLORS.seal : 0x4a4038);
    const inner = s.add
      .nineslice(-S / 2 + 14, -S / 2 + 14, TEX.edge, undefined, S - 28, S - 28, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(0xffffff)
      .setAlpha(0.85);
    const t = makeText(s, 0, 0, char, { size: 128, color: '#fff8ee', bold: true, scale: 1 }).setOrigin(0.5);
    const seal = this.add(s.add.container(cx + 200, H * MID - 120, [g, inner, t]).setDepth(1108).setScale(2.6).setAlpha(0).setAngle(-16));
    s.tweens.add({ targets: seal, scale: 1, alpha: 1, angle: -8, duration: 300, ease: 'Back.easeIn' });
    shakeAll(s, 180, 0.006);
    this.hint.setText('点击继续');
    // 自动关闭
    this.at(2200, () => this.close(), true);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const t of this.timers) t.remove(false);
    const s = this.scene;
    s.tweens.add({
      targets: this.objs, alpha: 0, duration: 300,
      onComplete: () => {
        for (const o of this.objs) o.destroy();
        this.done();
      },
    });
  }

  // ---------- 工具 ----------

  private portrait(x: number, y: number, size: number, key: string, fallback: string): Phaser.GameObjects.Container {
    const s = this.scene;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const frame = s.add.image(0, 0, TEX.white).setDisplaySize(size + 12, size + 12).setTint(COLORS.panel);
    parts.push(frame);
    if (hasImage(s, key)) {
      parts.push(s.add.image(0, 0, key).setDisplaySize(size, size).setTint(COLORS.artTint));
    } else {
      parts.push(makeText(s, 0, 0, fallback.slice(0, 1), { size: size * 0.45, color: TEXT_COLORS.title, bold: true, scale: 1 }).setOrigin(0.5));
    }
    if (s.textures.exists('ui_frame_brush')) {
      parts.push(s.add.nineslice(0, 0, 'ui_frame_brush', undefined, (size + 24) * 2, (size + 24) * 2, 22, 22, 22, 22).setScale(0.5).setTint(COLORS.btnBorder));
    }
    // 受击闪白，放在最上层
    parts.push(s.add.image(0, 0, TEX.white).setDisplaySize(size, size).setAlpha(0));
    return this.add(s.add.container(x, y, parts));
  }

  /** 圆角血条：底槽 + 填充两张图片，更新时只改填充宽度 */
  private makeBar(y: number, h: number): PillBar {
    const s = this.scene;
    const cx = this.ox + DESIGN_W / 2;
    const pill = pillTex(s, h);
    const track = s.add.nineslice(cx - BAR_W / 2, y, pill, undefined, BAR_W, h, h / 2, h / 2, 0, 0).setOrigin(0, 0).setTint(COLORS.barBg);
    const fill = s.add.nineslice(cx - BAR_W / 2, y, pill, undefined, BAR_W, h, h / 2, h / 2, 0, 0).setOrigin(0, 0);
    this.add(track);
    this.add(fill);
    return { track, fill, h };
  }

  private drawBars(eHp: number, pHp: number, pMp: number): void {
    const r = this.r;
    const set = (bar: PillBar, ratio: number, color: number) => {
      bar.fill.setTint(color).setSize(Math.max(bar.h, BAR_W * Math.max(0, Math.min(1, ratio))), bar.h);
    };
    set(this.eHpBar, eHp / r.eMaxHp, 0xb5402b);
    this.eHpText.setText(r.tribulation ? `天雷 剩余 ${Math.max(0, eHp)} / ${r.eMaxHp} 道` : `气血 ${fmtNum(Math.max(0, eHp))} / ${fmtNum(r.eMaxHp)}`);
    this.pHpText.setText(`气血 ${fmtNum(Math.max(0, pHp))} / ${fmtNum(r.pMaxHp)}${r.pMaxMp > 0 ? `  ·  灵力 ${fmtNum(pMp)} / ${fmtNum(r.pMaxMp)}` : ''}`);
    set(this.pHpBar, pHp / r.pMaxHp, 0x5f8f4e);
    if (this.pMpBar) set(this.pMpBar, pMp / r.pMaxMp, 0x4a6fa5);
  }

  private add<T extends Obj>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private setDepth(): void {
    for (const o of this.objs) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(1100);
  }

  private at(ms: number, fn: () => void, force = false): void {
    if (this.closed || (this.finished && !force)) return;
    this.timers.push(this.scene.time.delayedCall(ms, fn));
  }
}
