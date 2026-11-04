import Phaser from 'phaser';
import type { Game } from '../core/game';
import type { Platform } from '../platform/types';
import type { Overlay } from './fx';
import { SLICE, TEX } from './ink';
import { COLORS, DESIGN_W, FONT, TEXT_COLORS } from './theme';
import { makeText } from './ui';

const KEY = 'wdcs_guide_v1';

/** 引导判断需要的界面状态 */
export interface GuideContext {
  game: Game;
  tab: string;
  /** 行动区是否显示常规行动按钮（不是事件选项、菜单或死亡） */
  actionsShown: boolean;
  visitedBag: boolean;
  /** 行动区顶部（设计坐标）。行动按钮的提示气泡放在它上方，免得挡住其它按钮 */
  panelTop: number;
}

interface GuideStep {
  text: string;
  /** 高亮的目标，对应 MainScene 提供的按钮 key */
  target: string;
  /** 满足时才显示这一步（默认总是显示） */
  when?: (c: GuideContext) => boolean;
  /** 满足时这一步完成 */
  done: (c: GuideContext) => boolean;
}

const STEPS: GuideStep[] = [
  {
    text: '寿元有限，每个行动都会耗去时日。\n先闭关修炼，尝试引气入体。',
    target: 'door2',
    done: (c) => c.game.char.realm !== 'fanren',
  },
  {
    text: '已入仙途！落霞山灵气充沛，\n去那里历练吧。',
    target: 'travel',
    done: (c) => c.game.state.region !== 'qingshi_village',
  },
  {
    text: '历练会遇到奇遇，也会遇到危险。\n选项后的百分比是成功的把握。',
    target: 'explore',
    done: (c) => c.game.state.log.some((l) => l.text.startsWith('▸')),
  },
  {
    text: '所得之物都在行囊里，\n丹药、功法、法器记得取用。',
    target: 'tab:bag',
    done: (c) => c.visitedBag,
  },
  {
    text: '修为已至瓶颈。突破筑基需要筑基丹，\n可去青云坊市购买，或在历练中寻找。',
    target: 'tab:shop',
    when: (c) => c.game.canBreakthrough && !!c.game.missingBreakItem,
    done: (c) => c.game.atMarket || !c.game.missingBreakItem || c.game.char.realm !== 'lianqi',
  },
  {
    text: '万事俱备，冲击瓶颈吧！\n突破可能失败，失败会折损寿元。',
    target: 'break',
    when: (c) => c.game.canBreakthrough && !c.game.missingBreakItem,
    done: (c) => c.game.char.realm !== 'lianqi' || c.game.state.log.some((l) => l.text.startsWith('冲击筑基失败')),
  },
];

/**
 * 第一世的新手引导。每步在目标按钮上方显示提示气泡，并让按钮外框闪烁。
 */
export class Guide {
  private step: number;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private shownStep = -1;
  private shownTarget = '';

  constructor(
    private scene: Phaser.Scene,
    private overlay: Overlay,
    private platform: Platform,
    enabled: boolean,
  ) {
    const saved = Number(platform.storage.get(KEY) ?? 0);
    this.step = enabled ? saved : STEPS.length;
  }

  get active(): boolean {
    return this.step < STEPS.length;
  }

  /** 每次界面刷新后调用 */
  update(c: GuideContext, targets: Record<string, { x: number; y: number; w: number; h: number } | undefined>): void {
    // 已完成的步骤一次性跳过
    while (this.active && STEPS[this.step].done(c)) {
      this.step++;
      this.platform.storage.set(KEY, String(this.step));
    }
    const s = STEPS[this.step];
    // 有事件选项或菜单时一律不显示，免得挡住选项；指向页签的提示允许在其它页签出现
    const tabTarget = s?.target.startsWith('tab:');
    const visible =
      !!s && !c.game.state.dead && (s.when?.(c) ?? true) && c.actionsShown && (tabTarget || c.tab === 'home');
    const rect = s ? targets[s.target] : undefined;
    if (!visible || !rect) return this.clear();
    if (this.shownStep === this.step && this.shownTarget === s.target && this.objs.length) return;
    this.clear();
    this.shownStep = this.step;
    this.shownTarget = s.target;
    // 主界面上，气泡统一放在行动区上方；在其它页签（没有行动区）就贴着目标
    this.draw(s.text, rect, c.tab === 'home' ? c.panelTop : rect.y);
  }

  clear(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.shownStep = -1;
  }

  private draw(text: string, r: { x: number; y: number; w: number; h: number }, above: number): void {
    const scene = this.scene;
    const ox = this.overlay.ox;
    // 目标按钮外的闪烁框
    const ring = scene.add
      .nineslice(ox + r.x - 6, r.y - 6, TEX.btnEdge, undefined, r.w + 12, r.h + 12, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(COLORS.bar)
      .setDepth(900);
    scene.tweens.add({ targets: ring, alpha: 0.25, duration: 650, yoyo: true, repeat: -1 });

    // 气泡放在目标上方
    const t = makeText(scene, 0, 0, text, { size: FONT.small, color: TEXT_COLORS.normal, wrap: DESIGN_W - 120, scale: 1 });
    const bw = Math.min(DESIGN_W - 60, t.width + 48);
    const bh = t.height + 36;
    const bx = Math.max(30, Math.min(DESIGN_W - 30 - bw, r.x + r.w / 2 - bw / 2));
    const by = above - bh - 24;
    const bubble = scene.add
      .nineslice(ox + bx, by, TEX.btn, undefined, bw, bh, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(COLORS.panel)
      .setDepth(901);
    const bubbleEdge = scene.add
      .nineslice(ox + bx, by, TEX.edge, undefined, bw, bh, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(COLORS.bar)
      .setDepth(901);
    t.setPosition(ox + bx + 24, by + 18).setDepth(902);
    this.objs.push(ring, bubble, bubbleEdge, t);
  }
}
