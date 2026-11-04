"""Design the user-supplied second slot once, then audition strong emotions."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    voice = load('teen_design', 'stargarden-voice-design-test.py')
    voice.OUT = ROOT / 'art-src/stargarden/audio/voice-design-teen-v1'
    voice.PUBLIC = ROOT / 'public/assets/stargarden/audio/voice-design-teen-v1'
    voice.CONFIG = ROOT / '音色设计少女配置.json'
    voice.PROMPT = ('14岁少女，标准普通话，清澈柔和的少女中高音，已经告别童声，'
                    '比10岁女孩明显更沉稳，气息稳定、咬字清楚利落。自然中音区，'
                    '亲切温暖，略带含蓄和自己的想法，适合清新温馨的成长养成游戏。'
                    '保留年轻明亮的质地，不要幼儿腔、娃娃音、捏嗓子、夸张撒娇、成熟御姐腔或播音腔。')
    voice.EMOTIONS = []
    voice.publish = lambda speaker_id, clips: None
    voice.main()
    emotions = load('teen_emotions', 'stargarden-voice-emotion-v2.py')
    emotions.main('S_yknZmKn32', 'voice-emotions-teen-v1', '14—15岁少女')


if __name__ == '__main__':
    main()
