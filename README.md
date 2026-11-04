# 星庭物语

当前网页入口是新开发的原创竖屏女儿养成游戏。玩法、运行方式、架构与平台范围请看 [星庭物语开发说明](docs/星庭物语开发说明.md)。

```bash
npm run dev -- --host 0.0.0.0  # 电脑和同一 Wi-Fi 的手机试玩
npm run build                  # 构建新游戏网页版
npm run test:raising           # 养成规则与完整通关验证
npm run sim:raising -- 300      # 批量培养模拟
npm run smoke:raising          # 浏览器交互与竖屏布局验证
```

以下保留原技术骨架的说明，其中微信、安卓和旧模拟脚本尚未改为新游戏。

---

# 原技术骨架：问道长生

文字修仙游戏，同一套代码发布到浏览器、微信小游戏和 Android APK。策划案见 [docs/策划案.md](docs/策划案.md)。

## 常用命令

```bash
npm run dev            # 浏览器开发，http://localhost:5173
npm test               # 单元测试 + 事件配置校验
npm run assets         # 处理 art-src/ 里的 AI 素材 → public/assets/，需求见 docs/美术与音频需求.md
npm run sim -- 600 8   # 600 个玩家各连续玩 8 世（带轮回点和天赋），统计每世境界分布、时长，用来调数值
npm run build          # 网页版构建 → dist/
npm run build:wechat   # 微信小游戏构建 → dist-wechat/（用微信开发者工具导入这个目录）
node scripts/smoke.mjs # 用本机 Edge 自动试玩并截图 → screenshots/（需要先 npm run dev）
node scripts/showcase.mjs  # 自动截取各关键画面 → screenshots/showcase/，检查美术表现（需要先 npm run dev）
node scripts/playthrough.mjs 1  # 不作弊、纯点界面完整玩一世，逐步核对界面与状态（需要先 npm run dev）
```

## 目录

```
src/core/      游戏逻辑，不依赖引擎和平台（境界、闭关、事件引擎、存档）
src/data/      物品、功法、敌人、天赋、结局、坊市货架配置（JSON）
src/data/events/  事件配置，按区域分文件；新文件要在 src/data/index.ts 登记
src/render/    Phaser 场景和 UI
src/platform/  平台接口及各平台实现（存储、屏幕、输入框）
art-src/       AI 生成的原始素材（按需求文档命名）；public/assets/ 是处理后的成品
src/wechat/    微信小游戏入口和 DOM 适配层
wechat-template/  小游戏工程文件模板
tests/         单元测试
docs/事件写作规范.md  写新事件的格式、文风、数值、插图清单
docs/深度改进计划.md  试玩反馈后的问题诊断与五期改进计划
```
