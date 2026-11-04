"""Loudness-normalize final dialogue files without changing their timing."""
import argparse
import json
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art-src/stargarden/audio/dialogue-daughter-v1/derived"
NORMALIZED = ROOT / "art-src/stargarden/audio/dialogue-daughter-v1/normalized"
PUBLIC = ROOT / "public/assets/stargarden/audio/dialogue-daughter-v1"
MANIFEST = PUBLIC / "manifest.json"
FFMPEG = Path(r"C:\Users\Administrator\AppData\Local\JianyingPro\Apps\10.5.0.13988\ffmpeg.exe")
TARGET_LUFS = -18
TRUE_PEAK = -2


def info(path):
    with wave.open(str(path), "rb") as audio:
        rate, channels, frames = audio.getframerate(), audio.getnchannels(), audio.getnframes()
        samples = np.frombuffer(audio.readframes(frames), dtype=np.int16).astype(np.float32) / 32768
    rms = float(np.sqrt(np.mean(samples * samples)))
    peak = float(np.max(np.abs(samples)))
    return {
        "duration": frames / rate,
        "rms_dbfs": 20 * np.log10(max(rms, 1e-9)),
        "peak_dbfs": 20 * np.log10(max(peak, 1e-9)),
    }


def normalize(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        str(FFMPEG), "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-i", str(source),
        "-af", f"loudnorm=I={TARGET_LUFS}:TP={TRUE_PEAK}:LRA=7",
        "-ar", "24000", "-ac", "2", "-c:a", "pcm_s16le", str(destination),
    ], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = []
    for clip in manifest["clips"]:
        relative = Path(clip["src"])
        source = SOURCE / relative.name
        destination = NORMALIZED / relative.name
        if not source.exists():
            raise FileNotFoundError(source)
        if args.force or not destination.exists():
            if destination.exists():
                destination.unlink()
            normalize(source, destination)
        before, after = info(source), info(destination)
        if abs(before["duration"] - after["duration"]) > .12:
            raise ValueError("Normalization changed duration: " + source.name)
        if after["peak_dbfs"] > -1.4:
            raise ValueError("Normalization peak too high: " + source.name)
        public_file = PUBLIC / relative
        public_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, public_file)
        clip["duration"] = after["duration"]
        records.append({
            "file": relative.as_posix(),
            "before_rms_dbfs": before["rms_dbfs"],
            "after_rms_dbfs": after["rms_dbfs"],
            "after_peak_dbfs": after["peak_dbfs"],
        })
    manifest["normalization"] = {
        "method": "EBU R128 loudnorm",
        "target_lufs": TARGET_LUFS,
        "true_peak_db": TRUE_PEAK,
        "files": len(records),
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (NORMALIZED.parent / "normalization.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    average_rms = sum(item["after_rms_dbfs"] for item in records) / len(records)
    print(
        f"Normalized {len(records)} files; average RMS {average_rms:.2f} dBFS; "
        f"max peak {max(item['after_peak_dbfs'] for item in records):.2f} dBFS"
    )


if __name__ == "__main__":
    main()
