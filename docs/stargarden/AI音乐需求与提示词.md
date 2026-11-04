# AI 音乐需求与提示词

> 2026-11-04：曲目清单与 Suno 提示词已更新到 `美术音乐音效需求.md`，以该文档为准；本文的响度、循环和验收要求仍然有效。

日期：2026-11-01。交付状态：需求和提示词已完成；目前游戏仍用原有合成旋律作占位，下面七首音乐尚未生成。音效已单独使用 CC0 素材接入。

## 统一音乐方向

原创、明亮、干净、清新，具有经典日式养成游戏的小型室内乐气息。旋律亲切，编曲克制，长时间循环不疲劳。用同一段原创主题动机的不同变奏联系家园、夜晚和成长结局；不引用已有游戏旋律。

每首主体 60–120 秒，纯器乐。生成时优先要求 90 秒，再根据结果剪辑。交付立体声 WAV（44.1 或 48 kHz）母带；有条件时另交旋律与伴奏分轨。运行时另压缩 OGG，并在需要的平台准备 AAC 版本。

背景音乐统一响度，建议约 -20 LUFS、真峰值不高于 -2 dBTP；实际以不盖过界面与战斗音效为准。保留 WAV 母版、生成平台、模型、完整提示词与使用权记录。

## 直接可用的提示词

每首使用「共同要求 + 对应场景追加要求」，工具不支持中文时可使用下面的英文共同要求。

共同要求：

> 原创器乐游戏配乐，用于明亮清新的欧洲幻想女儿养成游戏。带有 1990 年代日式模拟养成游戏的温暖、细腻与日常气息。小型室内乐编制，旋律清楚，编曲克制，音色自然柔和，适合长时间聆听。无人声，无环境音，无强烈电子低音，无突发音量变化，无电影预告片式高潮，不引用已有作品旋律。约 90 秒，节奏稳定，可无缝循环；首尾节拍、速度、和声与混响尾音自然衔接，避免淡出、终止式和长引子。

English shared prompt:

> Original instrumental background music for a bright, clean and fresh European fantasy daughter-raising simulation. Warm, intimate everyday charm reminiscent of early 1990s Japanese simulation game instrumentation. Small chamber ensemble, memorable gentle melody, restrained natural acoustic arrangement, comfortable for repeated long listening. No vocals, environmental sound effects, heavy electronic bass, abrupt loudness changes, trailer-style climax, or quotations from existing melodies. Approximately 90 seconds, steady tempo, seamless loop with matching meter, tempo, harmony and reverb tails. No fade-out, final cadence, or long intro.

| 编号 | 使用场景 | 场景追加提示词 |
|---|---|---|
| bgm_home | 主界面、衣橱、普通家庭事件 | 安心、亲切、轻快，像午后窗边的阳光。长笛、单簧管、拨弦弦乐和柔和钢琴，约 90 BPM，轻盈 6/8 拍或平稳 4/4 拍。旋律自然，不甜腻，无强烈鼓点。 |
| bgm_town | 城镇、商店、课程选择 | 晨间小镇的生活气息，略有期待与好奇。木管、原声吉他、拨弦和轻打击乐，约 105 BPM。清晰的小步节奏，活泼但不喧闹，避免游乐场音乐感。 |
| bgm_night | 谈心、挫折后的陪伴 | 安静、信任、温柔，如家人坐在灯下慢慢说话。钢琴、竖琴、少量温暖长音弦乐，约 65 BPM。留呼吸空间，避免苦情与悬疑，不把难过写成绝望。 |
| bgm_explore | 森林、古塔与山路探索 | 自然、好奇、未知，适度神秘。长笛、单簧管、拨弦与轻柔打击乐，约 95 BPM。旋律带一点前进感，保留清亮空气，不做恐怖氛围。 |
| bgm_battle | 自动交锋与战斗回放 | 有行动感、紧迫感和克服困难的勇气，仍属于清新幻想世界。短弓弦乐、快速木管、克制定音鼓，约 135 BPM。清楚循环段，无重金属、史诗合唱或压迫性的巨大低音。 |
| bgm_festival | 生日、收获祭、展览 | 欢快、亲切、有仪式感，像大家一起庆祝一年的成长。木管、手鼓、拨弦和少量柔和铜管，约 115 BPM。温暖小型庆典，不做大型游行或喧闹电子舞曲。 |
| bgm_growing | 最后年度、成年、结局 | 温柔、感动、希望与轻微不舍。钢琴、大提琴、长笛，约 75 BPM。使用家园主题的舒展变奏，情绪缓慢展开，保留继续生活的明亮感，不悲壮，不做彻底告别的终止式。 |

## 短旋律需求

- 胜利提示：约 3–5 秒，木管与拨弦，明快而轻巧，可自然收尾，无人声。
- 节庆优胜：约 5–7 秒，温暖短小号与木管，喜悦、有小小荣誉感，不宏大。
- 结局揭晓：约 6–10 秒，钢琴与弦乐，把家园主题收束到一个温暖和弦，之后接成长音乐。

## 接入与验收

进入场景时做约 0.6–1 秒淡入淡出；同曲目不因普通界面刷新而从头重播。音乐与音效独立控制。手机首次用户交互后启用音频，切后台暂停，恢复时遵守浏览器播放限制。

每首连续播放至少五轮检查接缝、突变、爆音与疲劳感；在手机外放和耳机上分别试听。提示词写“无缝循环”不等于交付文件已经可循环，必要时裁切、交叉淡化并记录 loop 起止采样点。
