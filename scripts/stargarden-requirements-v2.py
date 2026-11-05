"""Generate birthday and seasonal room candidates without overwriting prior art.

Birthday images use the project's text-to-image helper. Seasonal day rooms use
the image-edit endpoint with a mask. Seasonal night rooms use the selected
daytime room as the single full-canvas edit target, preserving all room geometry
through a direct AI rewrite.
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

from PIL import Image, ImageDraw, ImageFilter

from genimage import API, BASE_URL, KEY_FILE, LOG, MODEL, QUALITY, generate

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art-src/stargarden/requirements-v2/candidates"
MASK_DIR = ROOT / "art-src/stargarden/requirements-v2/masks"
RAW_EDIT_DIR = ROOT / "art-src/stargarden/requirements-v2/raw-edits"
BASE_ROOM = ROOT / "art-src/stargarden/production-v1/room-portrait_2.png"
EDIT_API = BASE_URL + "/v1/images/edits"
SIZE_LANDSCAPE = "1536x1024"
SIZE_PORTRAIT = "1024x1536"
NIGHT_COMPOSITE_REGIONS = [
    (0, 100, 310, 730),
]
LOCK = threading.Lock()
ACTIVE_MODEL = MODEL
ACTIVE_QUALITY = QUALITY
ACTIVE_KEY_FILE = KEY_FILE
ACTIVE_API = API
ACTIVE_EDIT_API = EDIT_API
DIRECT_ROOM = False

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
    "move, add or remove furniture. Keep the center of the room clear. "
    "Every seasonal prop must be a single complete object with its entire silhouette, "
    "base, rim, handle and cast shadow fully visible and at least 18 pixels away from "
    "the mask edge. Never crop, truncate, merge or cut an object at the edge of the mask. "
    "Match the surrounding wall color and lighting naturally and blend all revised "
    "wall and floor areas seamlessly into the untouched room; no rectangular seam, "
    "straight transition line or visible edit boundary. "
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
        "clouds. A few cherry-blossom petals drifting near the window. On the clear right "
        "side of the desk, place one complete small clear glass jar with fresh spring "
        "flowers. The full round foot, glass rim, stems and every flower petal are "
        "visible; keep the jar separate from the books with a visible soft shadow. "
        "Bright fresh morning light.",
        [(0, 45, 360, 760), (45, 620, 440, 900)],
    ),
    "home-room-summer": (
        "Summer version: outside the window, lush deep green trees and a bright saturated "
        "blue sky with tall white cumulus clouds. One complete small glass wind chime "
        "hangs inside the window frame, with all top and bottom edges visible and the "
        "curtains only gently lifted by a light breeze while keeping the same overall "
        "silhouette. On the clear right side of the desk, place one complete shallow "
        "ceramic bowl of cherries with its entire rim, body and foot visible. The bowl "
        "must not touch the books or the mask edge. Strong clear sunlight with crisp "
        "shadows on the floor.",
        [(0, 45, 360, 760), (45, 620, 440, 900)],
    ),
    "home-room-autumn": (
        "Autumn version: outside the window, trees in warm orange, amber and red, a few "
        "falling leaves, a soft golden afternoon sky. On the clear right side of the "
        "desk, place one complete small woven basket filled with apples, with its entire "
        "arched handle, rim and base visible. Add only two or three complete red maple "
        "leaves beside it. Keep the basket separate from the books with a visible soft "
        "shadow. Warm golden light slanting across the floor.",
        [(0, 45, 360, 760), (45, 620, 440, 900)],
    ),
    "home-room-winter": (
        "Winter version: outside the window, snow-covered rooftops and trees under a pale "
        "winter sky, gentle falling snow, a little frost at the corners of the window "
        "glass. A soft knitted cream blanket is neatly folded over the back of the desk "
        "chair, fully visible and not touching the floor. On the clear right side of the "
        "desk, place one complete steaming ceramic mug with its full handle, rim and "
        "base clearly visible. Keep it separate from the books. Cool bright daylight "
        "inside, cozy and warm, not gloomy.",
        [(0, 45, 360, 760), (45, 620, 440, 900), (0, 680, 200, 1100)],
    ),
    "home-room-night": (
        "Night version: outside the window, a deep navy starry night sky with a crescent "
        "moon and a few warm town lights in the distance. The table lamp on the bookshelf "
        "is switched on, casting a warm amber glow over the room. The room is dimmer than "
        "daytime but still clearly readable, about 70 percent of daytime brightness, soft "
        "warm tones, no harsh darkness, no heavy vignette.",
        [(0, 45, 360, 760), (820, 460, 1024, 820)],
    ),
}

SEASONAL_NIGHT_ROOMS = {
    "home-room-spring-night": (
        "Outside: blossoming trees faintly pale pink in the moonlight, a few petals "
        "drifting. A mild, gentle spring night.",
        ROOT
        / "art-src/stargarden/requirements-v2/candidates-direct/home-room-spring-1.png",
    ),
    "home-room-summer-night": (
        "Outside: dark lush trees, a few fireflies glowing near the window, the glass "
        "wind chime catching the lamplight. The window is slightly open on a warm "
        "summer night.",
        ROOT
        / "art-src/stargarden/requirements-v2/candidates-direct/home-room-summer-2.png",
    ),
    "home-room-autumn-night": (
        "Outside: autumn trees with dark red and orange leaves under the moon, a few "
        "leaves falling. A crisp, quiet autumn night.",
        ROOT
        / "art-src/stargarden/requirements-v2/candidates-direct/home-room-autumn-1.png",
    ),
    "home-room-winter-night": (
        "Outside: snow-covered rooftops and trees glowing softly blue-white in the "
        "moonlight, gentle falling snow, a little frost at the window corners. The "
        "steaming mug on the desk. A cozy winter night, warm inside.",
        ROOT
        / "art-src/stargarden/requirements-v2/candidates-direct/home-room-winter-2.png",
    ),
}

SEASONAL_NIGHT_COMMON = (
    "Night version of this same room and the same season. Keep every object from the "
    "input image, including the seasonal items on the desk and chair. Outside the "
    "window it is now night: a deep navy starry sky with a crescent moon, the same "
    "seasonal scenery dimly visible in moonlight, and a few warm lights of the distant "
    "town. The table lamp on the bookshelf is switched on and casts a soft warm amber "
    "glow across the room and the rug. The room is dimmer than daytime but still "
    "clearly readable, about 70 percent of daytime brightness, warm cozy tones, no "
    "harsh darkness, no heavy vignette."
)


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


def request_edit(
    source: Path,
    mask: Path | None,
    prompt: str,
    size: str,
) -> tuple[bytes, str]:
    key = ACTIVE_KEY_FILE.read_text(encoding="utf-8").strip()
    fields = {
        "model": ACTIVE_MODEL,
        "prompt": prompt,
        "size": size,
        "n": "1",
    }
    if ACTIVE_QUALITY:
        fields["quality"] = ACTIVE_QUALITY
    files = [("image", source)]
    if mask is not None:
        files.append(("mask", mask))
    body, boundary = multipart_body(fields, files)
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    }
    request = urllib.request.Request(ACTIVE_EDIT_API, data=body, headers=headers, method="POST")
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
    """Blend the generated room without introducing a visible rectangular seam."""
    with Image.open(original) as opened:
        base = opened.convert("RGB")
    with Image.open(io.BytesIO(generated)) as opened:
        edited = opened.convert("RGB")
    with Image.open(mask) as opened:
        transparency = opened.getchannel("A")
    if edited.size != base.size:
        edited = edited.resize(base.size, Image.Resampling.LANCZOS)

    if night:
        # Keep one continuous nightly lighting pass over the source room, then copy
        # only the sky and lit lamp from the generated image.
        composed = base.copy()
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
        night_mask = build_mask(NIGHT_COMPOSITE_REGIONS)
        editable = night_mask.getchannel("A").point(
            lambda value: 255 if value < 128 else 0
        )
        feather = editable.filter(ImageFilter.GaussianBlur(4))
        composed = Image.composite(edited, composed, feather)
    else:
        editable = transparency.point(lambda value: 255 if value < 128 else 0)
        # A wide soft transition prevents a visible rectangular boundary where the
        # model's wall color and lighting differ slightly from the source image.
        feather = editable.filter(ImageFilter.GaussianBlur(48))
        composed = Image.composite(edited, base, feather)

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
    data = generate(
        prompt,
        SIZE_LANDSCAPE,
        model=ACTIVE_MODEL,
        quality=ACTIVE_QUALITY,
        api=ACTIVE_API,
        key_file=ACTIVE_KEY_FILE,
    )
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with LOCK:
        with path.open("xb") as handle:
            handle.write(data)
        append_log(
            {
                "file": path.relative_to(ROOT).as_posix(),
                "model": ACTIVE_MODEL,
                "api": ACTIVE_API,
                "size": SIZE_LANDSCAPE,
                "quality": ACTIVE_QUALITY,
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
    seasonal_night = name in SEASONAL_NIGHT_ROOMS
    source = (
        SEASONAL_NIGHT_ROOMS[name][1] if seasonal_night else BASE_ROOM
    )
    direct_rewrite = DIRECT_ROOM or seasonal_night
    mask_path: Path | None = None
    if not direct_rewrite:
        regions = ROOMS[name][1]
        mask = build_mask(regions)
        mask_path = MASK_DIR / f"{name}.png"
        mask_path.parent.mkdir(parents=True, exist_ok=True)
        mask.save(mask_path)
    prompt = (
        "Use case: lighting-weather\n"
        "Asset type: game room background, 2:3 portrait\n"
        + (
            "Input images: Image 1: exact room edit target and full-image rewrite\n"
            "Primary request: directly rewrite the complete room image while preserving "
            "all room geometry. "
            if direct_rewrite
            else "Input images: Image 1: exact room edit target; Image 2: transparency mask\n"
            "Primary request: replace only the environment inside the transparent mask. "
        )
        + version_prompt
        + "\n"
        + ROOM_INVARIANTS
    )
    started = time.time()
    RAW_EDIT_DIR.mkdir(parents=True, exist_ok=True)
    raw_name = (
        f"{name}-direct-{variant}.png"
        if direct_rewrite
        else f"{name}-{variant}.png"
    )
    raw_path = RAW_EDIT_DIR / raw_name
    if raw_path.exists():
        raw = raw_path.read_bytes()
        response_kind = "cached"
    else:
        raw, response_kind = request_edit(source, mask_path, prompt, SIZE_PORTRAIT)
        raw_path.write_bytes(raw)
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    composed = (
        raw
        if direct_rewrite
        else composite_masked_edit(source, raw, mask_path, name.endswith("night"))
    )
    with LOCK:
        with path.open("xb") as handle:
            handle.write(composed)
        append_log(
            {
                "file": path.relative_to(ROOT).as_posix(),
                "model": ACTIVE_MODEL,
                "api": ACTIVE_EDIT_API,
                "size": SIZE_PORTRAIT,
                "quality": ACTIVE_QUALITY,
                "prompt": prompt,
                "source_image": source.relative_to(ROOT).as_posix(),
                "mask": (
                    None
                    if mask_path is None
                    else mask_path.relative_to(ROOT).as_posix()
                ),
                "strength": (
                    "full-canvas direct edit; no mask"
                    if direct_rewrite
                    else "mask-constrained; service exposes no numeric strength parameter"
                ),
                "postprocess": (
                    "direct full-canvas AI output; no compositing"
                    if direct_rewrite
                    else (
                        "continuous 80% night grade; generated sky layered softly"
                        if name.endswith("night")
                        else "48px soft seam blend"
                    )
                ),
                "raw_edit": raw_path.relative_to(ROOT).as_posix(),
                "response_format": response_kind,
                "time": datetime.datetime.now().isoformat(timespec="seconds"),
                "batch": "requirements-v2",
                "variant": variant,
                "method": (
                    "direct-image-edit" if direct_rewrite else "masked-image-edit"
                ),
            }
        )
    return f"{path.name} ready ({time.time() - started:.0f}s)"


def jobs_for(
    selected: set[str],
    variants: tuple[int, ...] = (1, 2),
) -> list[tuple[str, tuple]]:
    jobs: list[tuple[str, tuple]] = []
    for name, prompt in BIRTHDAYS.items():
        if not selected or name in selected:
            jobs.extend((name, (name, prompt, variant)) for variant in variants)
    for name in ROOMS:
        if not selected or name in selected:
            jobs.extend((name, (name, ROOMS[name][0], variant)) for variant in variants)
    for name, (version_prompt, _) in SEASONAL_NIGHT_ROOMS.items():
        if not selected or name in selected:
            prompt = SEASONAL_NIGHT_COMMON + " " + version_prompt
            jobs.extend((name, (name, prompt, variant)) for variant in variants)
    return jobs


def main() -> int:
    global ACTIVE_API, ACTIVE_EDIT_API, ACTIVE_KEY_FILE, ACTIVE_MODEL
    global ACTIVE_QUALITY, DIRECT_ROOM, OUT
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only",
        nargs="*",
        choices=list(BIRTHDAYS) + list(ROOMS) + list(SEASONAL_NIGHT_ROOMS),
    )
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--quality", default=QUALITY, choices=("low", "medium", "high", "auto"))
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument(
        "--key-file",
        type=Path,
        default=KEY_FILE,
        help="Bearer-token file; relative paths resolve from the project root",
    )
    parser.add_argument("--direct-room", action="store_true")
    parser.add_argument("--variant", type=int, choices=(1, 2))
    parser.add_argument(
        "--out",
        type=Path,
        default=OUT,
        help="Candidate output directory inside the project root",
    )
    args = parser.parse_args()
    if not BASE_ROOM.exists():
        raise SystemExit(f"Missing room base: {BASE_ROOM}")
    base_url = args.base_url.rstrip("/")
    ACTIVE_API = base_url + "/v1/images/generations"
    ACTIVE_EDIT_API = base_url + "/v1/images/edits"
    ACTIVE_MODEL = args.model
    ACTIVE_QUALITY = args.quality
    ACTIVE_KEY_FILE = (
        args.key_file if args.key_file.is_absolute() else ROOT / args.key_file
    ).resolve()
    if not ACTIVE_KEY_FILE.is_file():
        raise SystemExit(f"Missing key file: {ACTIVE_KEY_FILE}")
    DIRECT_ROOM = args.direct_room
    OUT = args.out.resolve()
    if ROOT not in OUT.parents:
        raise SystemExit("--out must be inside the project root")
    OUT.mkdir(parents=True, exist_ok=True)
    selected = set(args.only or [])
    jobs = jobs_for(
        selected,
        (args.variant,) if args.variant is not None else (1, 2),
    )
    unknown = selected - set(BIRTHDAYS) - set(ROOMS) - set(SEASONAL_NIGHT_ROOMS)
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
