# ShiyingCutout 抠图流程

本项目新增素材优先使用用户提供的 `ShiyingCutout`，原始图片和游戏中现有文件均需保留。工具目录为项目根目录下的 `ShiyingCutout/`，具体授权以该目录的 `licenses/` 为准。

## 单张处理

```powershell
python -X utf8 scripts/stargarden-shiying-cutout.py --input 原图路径.png --output 新的透明图路径.png
```

脚本调用工具自带的主体分割和精细边缘引擎，启用边缘细化及去背景色处理；支持 GPU 时会使用 GPU。输出路径已存在时会拒绝覆盖。脚本读取工具 EXE 内打包的 Python 模块，不修改工具本身；工具版本、Python 版本或打包方式改变后需要重新验证兼容性。

## 检查与交付

- 保留生成原图、提示词及记录；不要直接覆盖已有游戏素材。
- 在深色和浅色背景分别检查发丝、衣服、手指、鞋子、配饰、主体内部孔隙和画面边缘；检查误删、残色与毛边。
- 检查实际游戏尺寸和人物站位，再由负责接入的人员统一导出与映射。模型生成及自动抠图不等于美术验收通过。
- 人物头像从选定立绘裁切，避免另行生成后人物不一致。

当前样例位于 `art-src/stargarden/requirements-v1/`：

- `shiying-cutouts/`：六张新人物和四张战斗素材的透明候选；`avatars/` 为六张人物对应头像。
- `previous-outfits-shiying/`：九张现有服装原图的新抠图；`cutout-tests/child-summer-shiying.png` 为第十张。
- `previous-outfits-shiying-review.jpg`：十张服装的深浅背景总览；`cutout-tests/child-summer-comparison.jpg`：夏装新旧抠图对比。
- `battle-cutouts-review.jpg`：四张战斗素材的深浅背景总览。

上述二十张透明图均已检查为 RGBA、透明范围为 0 到 255 且左上角透明；总览仅供检查整体，发丝和衣服边缘仍需放大复核。需求批次的新角色与新对手候选尚未接入游戏；旧服装的覆盖情况见下文。可运行 `python -X utf8 scripts/stargarden-cutout-review.py` 生成服装总览；为避免覆盖，该脚本在目标已存在时会退出。

## 旧游戏素材重新处理

2026-11-04 已重新处理并替换游戏中旧版透明素材，共 46 个 WebP：儿童及少年身体与衣服叠层 8 个、完整人物和旧战斗素材 15 个、成年衣装配色 2 个、表情头像 18 个、表情总图 3 个。空白对齐层是程序生成的透明占位图，不需要抠图；不透明的场景和插画也不属于抠图范围。

覆盖前的原文件和校验清单位于 `art-src/stargarden/backups/shiying-20261104-173622/`。处理后的审查图位于 `art-src/stargarden/requirements-v1/reprocess-v1/`；脚本 `scripts/stargarden-reprocess-shiying.py` 的 `build` 生成暂存结果，`install` 验证尺寸后备份并覆盖。执行 `install` 前应检查暂存结果。

旧的 `npm run assets:raising` 和 `npm run assets:raising:production` 仍使用各自原有抠图方法，并会覆盖部分游戏资源；不要在未检查输出的情况下运行。若需重新处理透明素材，使用上述 ShiyingCutout 流程并重新核对游戏中的换装和头像。
