// 适配层必须最先加载
import { screenCanvas } from './adapter';
import { wechatPlatform } from '../platform/wechat';
import { startGame } from '../render/boot';

startGame({ platform: wechatPlatform, canvas: screenCanvas as HTMLCanvasElement });
