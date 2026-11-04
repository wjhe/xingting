"""Generate birthday and seasonal room candidates without overwriting prior art.

Birthday images use the project's text-to-image helper. Room images use the
OpenAI-compatible image-edit endpoint with a mask, then preserve the original
room outside that mask so furniture geometry cannot drift.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import io
import json
import mimetypes
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from genimage import API, BASE_URL, KEY_FILE, LOG, MODEL, QUALITY, generate

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art-src/stargarden/requirements-v2/candidates"
MASK_DIR = ROOT / "art-src/stargarden/requirements-v2/masks"
BASE_ROOM = ROOT / "art-src/stargarden/production-v1/room-portrait_2.png"
EDIT_API = BASE_URL + "/v1/images/edits"
SIZE_LANDSCAPE = "1536x1024"
SIZE_PORTRAIT = "1024x1536"
LOCK = threading.Lock()

STYLE = (
    "Original early 1990s Japanese fantasy daughter-raising game cel illustration. "
    "Fine warm brown hand-drawn contours, flat opaque local colors, exactly one crisp "
    "shadow tone per material. Bright clean fresh ivory, sage, dusty rose palette. "
    "No glossy modern anime, no gradients, no watercolor, no texture grain, no sepia, "
    "no text, no watermark. Restrained small amber-brown eyes, natural face. "
)
CHARACTER = (
    "The same original girl Ellie: chestnut brown shoulder-length bob, lightly curled "
    "ends, wispy bangs, amber-brown eyes, small dark sage ribbon on the left side of "
    "her hair, soft gentle face. "
)
BIRTHDAY_NEGATIVE = (
    "No other people, no parents, no siblings, no guests, no adult face, no adult body, "
    "only one hand at most, no multiple candles with countable numbers, no text on the "
    "cake, no party hats, no balloons crowd. No text, no logo, no watermark anywhere."
)
ROOM_INVARIANTS = (
    "Keep the exact same room composition as the input image: same camera angle, same "
    "perspective, same positions and shapes of the window, curtains, writing desk and "
    "chair, bookshelf, table lamp, wardrobe, wall shelf, framed picture, hanging dried "
    "flowers, wooden floor planks and the dusty rose oval rug in the center. Do not "
    "move, add or remove furniture outside the mask. Keep the center of the room clear. "
    "No people. Keep the same 1990s Japanese cel animation style with fine brown "
    "outlines and flat colors. No text, no logo, no watermark."
)

BIRTHDAYS = {
    "birthday-child": (
        STYLE
        + CHARACTER
        + "She is 11 years old, age-appropriate child proportions, wearing an ivory "
        "puff-sleeve blouse and sage pinafore with a small dusty rose bow. A cozy small "
        "home birthday at a wooden table by the window in the evening, warm lamp light. "
        "In front of her is a small round honey cake with cream and berries and one "
        "single star-shaped candle. She leans forward with eyes gently closed and hands "
        "clasped, about to make a wish, a shy happy smile. From the right edge of the "
        "frame, only one kind adult hand in a plain oatmeal knit sleeve gently places a "
        "small gift box wrapped in sage paper with a ribbon on the table; no adult face "
        "or body visible. A little green journal rests at the corner of the table. "
        "Through the window, the lights of a small European fantasy town. Warm, "
        "intimate, quiet. "
        + BIRTHDAY_NEGATIVE
    ),
    "birthday-teen": (
        STYLE
        + CHARACTER
        + "She is 14 years old, natural adolescent proportions, wearing an ivory blouse "
        "and sage dress. A cozy home birthday at a wooden table by the window in the "
        "evening, soft warm lamp light. A round honey cake with cream and berries and "
        "one single star-shaped candle glowing. She holds the knife to cut the first "
        "slice and looks up toward the viewer with a happy, slightly embarrassed smile. "
        "From the left edge of the frame, only one adult hand in a plain oatmeal knit "
        "sleeve offers a small wrapped gift with a dusty rose ribbon; no adult face or "
        "body visible. A green journal and a teapot on the table. Small town lights "
        "outside the window. Warm and gentle. "
        + BIRTHDAY_NEGATIVE
    ),
    "birthday-grown": (
        STYLE
        + CHARACTER
        + "She is 17 years old, clearly an older adolescent young woman with older facial "
        "proportions, wearing an ivory high-collar blouse and sage dress. A quiet home "
        "birthday at a wooden table by the window in the evening, warm lamp light. A "
        "round honey cake with one single star-shaped candle. She holds a small opened "
        "gift in both hands, a simple silver key-shaped pendant on a ribbon, and looks "
        "toward the viewer with a grateful, tender smile. From the right edge of the "
        "frame, only one adult hand in a plain oatmeal knit sleeve rests on the table "
        "near her; no adult face or body visible. The green journal lies open beside "
        "the cake. Town lights and the first stars outside the window. Warm, grown-up, "
        "a little emotional. "
        + BIRTHDAY_NEGATIVE
    ),
}

ROOMS = {
    "home-room-spring": (
        "Spring version: outside the window, soft pale green new leaves and pink and "
        "white blossoming fruit trees under a clear light blue sky with small white "
        "clouds. A few cherry-blossom petals drifting near the window. On the desk, a "
        "small glass jar with fresh spring flowers. Bright fresh morning light.",
        [(4, 120, 292, 700), (100, 698, 235, 775)],
    ),
    "home-room-summer": (
        "Summer version: outside the window, lush deep green trees and a bright saturated "
        "blue sky with tall white cumulus clouds. A small glass wind chime hanging at the "
        "window frame, with the curtains only gently lifted by a light breeze and kept in "
        "the same overall silhouette. A small bowl of cherries on the desk. Strong clear "
        "sunlight with crisp shadows on the floor.",
        [(4, 120, 292, 700), (100, 698, 235, 775)],
    ),
    "home-room-autumn": (
        "Autumn version: outside the window, trees in warm orange, amber and red, a few "
        "falling leaves, a soft golden afternoon sky. On the desk, a small basket with "
        "apples and a few red maple leaves. Warm golden light slanting across the floor.",
        [(4, 120, 292, 700), (100, 698, 235, 775)],
    ),
    "home-room-winter": (
        "Winter version: outside the window, snow-covered rooftops and trees under a pale "
        "winter sky, gentle falling snow, a little frost at the corners of the window "
        "glass. A soft knitted cream blanket folded over the desk chair, a steaming mug "
        "on the desk. Cool bright daylight inside, cozy and warm, not gloomy.",
        [(4, 120, 292, 700), (100, 698, 235, 775), (4, 740, 150, 1050)],
    ),
    "home-room-night": (
        "Night version: outside the window, a deep navy starry night sky with a crescent "
        "moon and a few warm town lights in the distance. The table lamp on the bookshelf "
        "is switched on, casting a warm amber glow over the room. The room is dimmer than "
        "daytime but still clearly readable, about 70 percent of daytime brightness, soft "
        "warm tones, no harsh darkness, no heavy vignette.",
        [(4, 120, 292, 700), (860, 550, 990, 705)],
    ),
}


def append_log(record: dict) -> None:
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def build_mask(regions: list[tuple[int, int, int, int]]) -> Image.Image:
    """Build an RGBA mask: transparent means editable, opaque means protected."""
    with Image.open(BASE_ROOM) as source:
        width, height = source.size
    rgba = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    alpha = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(alpha)
    for left, top, right, bottom in regions:
        draw.rounded_rectangle((left, top, right, bottom), radius=8, fill=0)
    rgba.putalpha(alpha)
    return rgba


def multipart_body(
    fields: dict[str, str], files: list[tuple[str, Path]]
) -> tuple[bytes, str]:
    boundary = f"----stargarden-{time.time_ns()}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    for field, path in files:
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                (
                    f'Content-Disposition: form-data; name="{field}"; '
                    f'filename="{path.name}"\r\n'
                ).encode(),
                f"Content-Type: {mime}\r\n\r\n".encode(),
                path.read_bytes(),
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), boundary


def request_edit(source: Path, mask: Path, prompt: str, size: str) -> tuple[bytes, str]:
    key = KEY_FILE.read_text(encoding="utf-8").strip()
    body, boundary = multipart_body(
        {
            "model": MODEL,
            "prompt": prompt,
            "size": size,
            "quality": QUALITY,
            "n": "1",
        },
        [("image", source), ("mask", mask)],
    )
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    }
    request = urllib.request.Request(EDIT_API, data=body, headers=headers, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=420) as response:
                payload = json.loads(response.read())
            item = payload["data"][0]
            if item.get("b64_json"):
                import base64

                return base64.b64decode(item["b64_json"]), "b64_json"
            with urllib.request.urlopen(item["url"], timeout=180) as response:
                return response.read(), "url"
        except urllib.error.HTTPError as error:
            message = error.read().decode("utf-8", "replace")[:500]
            if error.code < 500 or attempt == 2:
                raise RuntimeError(f"HTTP {error.code}: {message}") from None
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 2:
                raise RuntimeError(f"Network error: {error}") from None
        time.sleep(5 * (attempt + 1))
    raise RuntimeError("Image edit failed")


def composite_masked_edit(original: Path, generated: bytes, mask: Path, night: bool) -> bytes:
    """Copy generated pixels only from the mask; keep every protected pixel exactly."""
    with Image.open(original) as opened:
        base = opened.convert("RGB")
    with Image.open(io.BytesIO(generated)) as opened:
        edited = opened.convert("RGB")
    with Image.open(mask) as opened:
        transparency = opened.getchannel("A")
    if edited.size != base.size:
        edited = edited.resize(base.size, Image.Resampling.LANCZOS)
    editable = transparency.point(lambda value: 255 if value < 128 else 0)
    # Feather inward while forcing every protected pixel to remain exactly equal
    # to the source room.
    feather = ImageChops.multiply(
        editable.filter(ImageFilter.GaussianBlur(5)),
        editable,
    )
    composed = Image.composite(edited, base, feather)

    if night:
        # Preserve geometry while gently lowering room brightness and adding a warm
        # localized glow around the existing lamp. This avoids moving furniture.
        pixels = composed.load()
        for y in range(composed.height):
            for x in range(composed.width):
                red, green, blue = pixels[x, y]
                pixels[x, y] = (
                    round(red * 0.80 + 8),
                    round(green * 0.78 + 4),
                    round(blue * 0.82 + 5),
                )
        glow = Image.new("L", composed.size, 0)
        draw = ImageDraw.Draw(glow)
        draw.ellipse((760, 425, 1060, 835), fill=80)
        glow = glow.filter(ImageFilter.GaussianBlur(95))
        warm = Image.new("RGB", composed.size, (255, 176, 82))
        composed = Image.composite(warm, composed, glow.point(lambda value: value // 2))

    output = io.BytesIO()
    composed.save(output, format="PNG")
    return output.getvalue()


def run_birthday(task: tuple[str, str, int]) -> str:
    name, prompt, variant = task
    path = OUT / f"{name}-{variant}.png"
    if path.exists():
        with Image.open(path) as image:
            image.verify()
        return f"{path.name} cached"
    started = time.time()
    data = generate(prompt, SIZE_LANDSCAPE)
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with LOCK:
        with path.open("xb") as handle:
            handle.write(data)
        append_log(
            {
                "file": path.relative_to(ROOT).as_posix(),
                "model": MODEL,
                "api": API,
                "size": SIZE_LANDSCAPE,
                "quality": QUALITY,
                "prompt": prompt,
                "time": datetime.datetime.now().isoformat(timespec="seconds"),
                "batch": "requirements-v2",
                "variant": variant,
                "method": "text-to-image",
            }
        )
    return f"{path.name} ready ({time.time() - started:.0f}s)"


def run_room(task: tuple[str, str, int]) -> str:
    name, version_prompt, variant = task
    path = OUT / f"{name}-{variant}.png"
    if path.exists():
        with Image.open(path) as image:
            image.verify()
        return f"{path.name} cached"
    regions = ROOMS[name][1]
    mask = build_mask(regions)
    mask_path = MASK_DIR / f"{name}.png"
    mask_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(mask_path)
    prompt = (
        "Use case: lighting-weather\n"
        "Asset type: game room background, 2:3 portrait\n"
        "Input images: Image 1: exact room edit target; Image 2: transparency mask\n"
        "Primary request: replace only the environment inside the transparent mask. "
        + version_prompt
        + "\n"
        + ROOM_INVARIANTS
    )
    started = time.time()
    raw, response_kind = request_edit(BASE_ROOM, mask_path, prompt, SIZE_PORTRAIT)
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    composed = composite_masked_edit(BASE_ROOM, raw, mask_path, name.endswith("night"))
    with LOCK:
        with path.open("xb") as handle:
            handle.write(composed)
        append_log(
            {
                "file": path.relative_to(ROOT).as_posix(),
                "model": MODEL,
                "api": EDIT_API,
                "size": SIZE_PORTRAIT,
                "quality": QUALITY,
                "prompt": prompt,
                "source_image": BASE_ROOM.relative_to(ROOT).as_posix(),
                "mask": mask_path.relative_to(ROOT).as_posix(),
                "strength": "mask-constrained; service exposes no numeric strength parameter",
                "postprocess": (
                    "preserve source outside mask; night-only 80% brightness and local warm lamp glow"
                    if name.endswith("night")
                    else "preserve source outside mask"
                ),
                "response_format": response_kind,
                "time": datetime.datetime.now().isoformat(timespec="seconds"),
                "batch": "requirements-v2",
                "variant": variant,
                "method": "masked-image-edit",
            }
        )
    return f"{path.name} ready ({time.time() - started:.0f}s)"


def jobs_for(selected: set[str]) -> list[tuple[str, tuple]]:
    jobs: list[tuple[str, tuple]] = []
    for name, prompt in BIRTHDAYS.items():
        if not selected or name in selected:
            jobs.extend((name, (name, prompt, variant)) for variant in (1, 2))
    for name in ROOMS:
        if not selected or name in selected:
            jobs.extend((name, (name, ROOMS[name][0], variant)) for variant in (1, 2))
    return jobs


def main() -> int:
    global OUT
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", choices=list(BIRTHDAYS) + list(ROOMS))
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--out",
        type=Path,
        default=OUT,
        help="Candidate output directory inside the project root",
    )
    args = parser.parse_args()
    if not BASE_ROOM.exists():
        raise SystemExit(f"Missing room base: {BASE_ROOM}")
    OUT = args.out.resolve()
    if ROOT not in OUT.parents:
        raise SystemExit("--out must be inside the project root")
    OUT.mkdir(parents=True, exist_ok=True)
    selected = set(args.only or [])
    jobs = jobs_for(selected)
    unknown = selected - set(BIRTHDAYS) - set(ROOMS)
    if unknown:
        raise SystemExit(f"Unknown jobs: {', '.join(sorted(unknown))}")
    print(f"{len(jobs)} candidate files", flush=True)
    failures: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=max(1, min(args.workers, 3))
    ) as pool:
        futures = {
            pool.submit(run_birthday if name in BIRTHDAYS else run_room, payload): name
            for name, payload in jobs
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                print(future.result(), flush=True)
            except Exception as error:
                failures.append(f"{futures[future]}: {type(error).__name__}: {error}")
                print("FAILED " + failures[-1], flush=True)
    if failures:
        raise SystemExit(f"{len(failures)} generations failed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
