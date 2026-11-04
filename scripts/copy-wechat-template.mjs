// 把小游戏工程模板（game.js、game.json 等）拷进构建产物目录
import { cpSync } from 'node:fs';

cpSync('wechat-template', 'dist-wechat', { recursive: true });
console.log('已生成微信小游戏工程：dist-wechat/');
