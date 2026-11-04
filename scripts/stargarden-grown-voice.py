"""Audition a built-in voice as the oldest daughter stage; no voice design."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('grown_emotions', ROOT / 'scripts/stargarden-voice-emotion-v2.py')
emotions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(emotions)

if __name__ == '__main__':
    emotions.main('zh_female_roumeinvyou_uranus_bigtts', 'voice-emotions-grown-official-v1', '16—18岁官方候选')
