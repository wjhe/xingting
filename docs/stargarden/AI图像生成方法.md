# 星庭物语：AI 图像生成方法

> 依据当前项目脚本整理。接口、模型、额度和费用可能变化；实际调用前以脚本配置及服务商账户为准。

## 当前接口

项目通过 `scripts/genimage.py` 调用用户已有的 OpenAI 兼容图像生成服务：

- 服务地址：`https://api.aigocode.dev`。
- 文生图端点：`https://api.aigocode.dev/v1/images/generations`。
- 图生图/遮罩编辑端点：`https://api.aigocode.dev/v1/images/edits`。
- 脚本当前配置的模型：`gpt-image-2.5-sunburst`。
- 画质固定为 `quality: high`，不要改为低质量档。
- 密钥：从项目根目录 `gpt_image_2_5_key.txt` 读取，以 Bearer 方式鉴权。
- 请求包含 `model`、`prompt`、`size`、`quality` 和 `n`；`quality` 固定为 `high`，每次请求 `n=1`，多张时逐张调用。
- 响应支持 `b64_json` 或图片 URL。

这是项目配置的第三方图像服务，不是官方 OpenAI 地址。密钥文件已列入 `.gitignore`；不要打印、复制、提交或放入网页。生成记录并非版权或商用授权证明，使用权仍需核对服务商条款。

## 单张生成

在项目根目录运行，当前目录为 `D:\美少女养成`；如目录移动，以实际项目根目录为准：

```powershell
python -X utf8 scripts/genimage.py <输出路径> <尺寸> '<提示词>' [张数]
```

例如生成一张横版场景候选：

```powershell
python -X utf8 scripts/genimage.py art-src/stargarden/candidates/garden-test.png 1536x1024 'Original bright clean cel-style fantasy garden, fine warm brown outlines, flat colors, one crisp shadow tone, simple composition, no characters, no text or watermark.' 1
```

项目既有任务常用 `1536x1024` 横版场景、`1024x1536` 竖版人物和 `1024x1024` 方图；实际是否可用以服务当前支持情况为准。多张时输出为 `文件名_1.png`、`文件名_2.png` 等，实际是多次请求，可能分别计费。

**单张脚本会覆盖同名目标文件**，不会提示。应先选择新的候选文件名并确认文件不存在，保留已确认原图。输出应放在项目根目录内：脚本写入图片后使用相对项目根目录的路径写日志，项目外路径可能导致日志步骤报错。

每次成功生成会向 `art-src/generation_log.jsonl` 追加输出路径、模型、接口、尺寸、画质档位、完整提示词和时间。对部分服务端或网络错误，脚本最多尝试三次；响应中断时不能仅凭本地报错断言服务端没有处理或计费，重试前检查文件及服务商记录。批量调用前确认授权和预算。

## 批量任务

`scripts/stargarden-produce.py` 的 `jobs()` 定义了人物、服装、场景、事件、战斗、表情及结局任务；原图输出到 `art-src/stargarden/production-v1/`：

```powershell
# 只整理任务清单，不请求生成；会重写 prompts.json
python -X utf8 scripts/stargarden-produce.py --prepare

# 仅生成指定任务；已有同名图片会跳过
python -X utf8 scripts/stargarden-produce.py --only child-summer event-kitten
```

每次运行都会写入 `art-src/stargarden/production-v1/prompts.json`，包括 `--prepare` 和 `--only`。未指定 `--prepare` 且未给出具体 `--only` 任务时会处理全部任务，并发上限为 3，应先核对范围和费用。已有原图按文件是否存在跳过，不代表该图片已通过质量审核。

## 美术方向

视觉基准为用户确认的 `art-src/stargarden/style-tests/cel-v3.png`。规范见 `docs/星庭物语美术规范.md`，结构化描述见 `art-src/stargarden/art-direction.json`。

共同方向：明亮、干净、清新的日式赛璐璐手绘，细棕色轮廓、平涂固有色、每种材质一层清晰硬边阴影、克制高光。避免水彩颗粒、厚重渐变、喷枪、泛黄、3D、过大的通用萌系眼睛、文字和水印。

女儿的主要识别特征：栗棕色齐肩微卷发、碎刘海、琥珀棕眼睛和深灰绿发带。年龄阶段为 10—13、14—15、16—18 岁。提示词应明确年龄、身体比例、服装款式、姿势、构图及用途，避免不同年龄像不同角色。

用于抠图的人物原图应尽量包含完整头身和鞋底、足够边距及纯色背景，避免投影和复杂遮挡；场景要为人物和界面留空间。提示词不能保证角色一致、透明背景或构图合格，生成后需人工筛选。

## 原图到游戏素材

1. 将候选原图和提示词保存在 `art-src/stargarden/` 并核对生成记录，保留已确认基准。
2. 人工检查风格、年龄、角色、服装、构图、细节和画面用途。
3. 新透明人物可按 `docs/stargarden/抠图与音效方案.md` 使用本地 BiRefNet ONNX；在深浅背景检查发丝、白衣、手指、鞋子、配饰及残留，并保留原图和蒙版。
4. 生产素材处理命令为 `npm run assets:raising:production`，依赖相应 Python 包和本地模型；默认素材处理命令为 `npm run assets:raising`。先阅读脚本和输出位置：这些命令会写入或更新现有素材，不适合作为无条件的单图转换命令。
5. 运行资源通常位于 `public/assets/stargarden/`，路径及年龄、服装映射集中于 `src/raising/art.ts`。接入后检查实际场景、手机尺寸和加载效果；涉及游戏代码时运行相应构建与内容检查。

## 排查

- 缺少密钥文件：检查文件位置和读取权限，不要把密钥贴到终端或聊天。
- HTTP 4xx：检查认证、余额、模型、尺寸以及服务商错误，不要无限重试。
- 网络错误或超时：先检查是否有生成文件、服务商是否已处理，再决定是否重新调用。
- 画风或年龄不对：核对提示词、参考图和实际输出；保留旧结果，用新文件名制作候选。
- 图片未显示：检查 `public/` 文件、`src/raising/art.ts` 映射、构建路径和浏览器网络请求。

相关文件：`scripts/genimage.py`、`scripts/stargarden-produce.py`、`scripts/stargarden-production-assets.py`、`docs/星庭物语美术规范.md`、`docs/stargarden/抠图与音效方案.md`。
