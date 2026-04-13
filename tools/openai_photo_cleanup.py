#!/usr/bin/env python3
"""Clean DJ photos with OpenAI image edits.

What it does:
- Removes the circular logo near the bottom center.
- Recreates background areas with natural crowd silhouettes.
- Preserves the DJ/person in foreground as much as possible.

Default targets:
- static/photos/photo-1.jpeg
- static/photos/photo-8.jpeg

Requirements:
- OPENAI_API_KEY set in environment
- pip install openai pillow

Usage examples:
  python tools/openai_photo_cleanup.py
  python tools/openai_photo_cleanup.py --in-place
  python tools/openai_photo_cleanup.py --files static/photos/photo-1.jpeg static/photos/photo-8.jpeg
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import io
import os
from pathlib import Path
from typing import Iterable

from openai import OpenAI
from PIL import Image, ImageDraw

DEFAULT_FILES = [
    Path("static/photos/photo-1.jpeg"),
    Path("static/photos/photo-8.jpeg"),
]

PROMPT_BY_NAME = {
    "photo-1.jpeg": (
        "Edit only the transparent mask area. Remove any watermark or circular logo at the bottom center. "
        "Reconstruct realistic DJ booth details and natural shadows where the logo was. "
        "In the upper background only, add subtle out-of-focus nightclub crowd silhouettes on the sides. "
        "Keep the main DJ person, pose, face, hands, clothing, headphones, and lighting unchanged. "
        "No text, no logos, no watermark. Preserve original photo realism and color mood."
    ),
    "photo-8.jpeg": (
        "Edit only the transparent mask area. Remove any watermark or circular logo at the bottom center. "
        "Reconstruct realistic clothing and scene texture where the logo was. "
        "In the upper background only, add subtle out-of-focus nightclub crowd silhouettes on the sides. "
        "Keep the main DJ person, pose, face, raised arm, headphones, shirt details, neon lights, and framing unchanged. "
        "No text, no logos, no watermark. Preserve original photo realism and color mood."
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cleanup logos and add crowd in DJ photos")
    parser.add_argument(
        "--files",
        nargs="+",
        type=Path,
        default=DEFAULT_FILES,
        help="Target image files",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("static/photos/edited"),
        help="Output directory when not using --in-place",
    )
    parser.add_argument(
        "--model",
        default="gpt-image-1",
        help="OpenAI image model",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite originals after creating backups",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=Path("static/photos/backups"),
        help="Backup directory used with --in-place",
    )
    return parser.parse_args()


def ensure_dependencies() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")


def rounded_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=(0, 0, 0, 0))


def build_mask(image_path: Path) -> Image.Image:
    img = Image.open(image_path).convert("RGBA")
    w, h = img.size

    mask = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(mask)

    logo_r = int(min(w, h) * 0.12)
    logo_cx = int(w * 0.5)
    logo_cy = int(h * 0.86)
    draw.ellipse(
        (logo_cx - logo_r, logo_cy - logo_r, logo_cx + logo_r, logo_cy + logo_r),
        fill=(0, 0, 0, 0),
    )

    if image_path.name == "photo-1.jpeg":
        rounded_rect(draw, (int(w * 0.03), int(h * 0.20), int(w * 0.28), int(h * 0.56)), int(w * 0.03))
        rounded_rect(draw, (int(w * 0.72), int(h * 0.19), int(w * 0.97), int(h * 0.56)), int(w * 0.03))
    elif image_path.name == "photo-8.jpeg":
        rounded_rect(draw, (int(w * 0.03), int(h * 0.08), int(w * 0.26), int(h * 0.40)), int(w * 0.03))
        rounded_rect(draw, (int(w * 0.74), int(h * 0.08), int(w * 0.97), int(h * 0.40)), int(w * 0.03))

    return mask


def extract_image_bytes(result) -> bytes:
    if not getattr(result, "data", None):
        raise RuntimeError("OpenAI response has no image data")

    item = result.data[0]
    b64_data = getattr(item, "b64_json", None)
    if b64_data:
        return base64.b64decode(b64_data)

    image_url = getattr(item, "url", None)
    if image_url:
        from urllib.request import urlopen

        with urlopen(image_url) as response:
            return response.read()

    raise RuntimeError("Unsupported OpenAI image response format")


def backup_file(src: Path, backup_root: Path) -> Path:
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = backup_root / stamp
    backup_dir.mkdir(parents=True, exist_ok=True)
    dst = backup_dir / src.name
    dst.write_bytes(src.read_bytes())
    return dst


def output_path_for(src: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{src.stem}-edited{src.suffix}"


def process_file(client: OpenAI, image_path: Path, model: str, out_path: Path) -> None:
    prompt = PROMPT_BY_NAME.get(
        image_path.name,
        (
            "Edit only the transparent mask area. Remove logos/watermarks and reconstruct the scene naturally. "
            "Add subtle out-of-focus nightclub crowd silhouettes only in background masked areas. "
            "Keep foreground person identity, pose, and lighting unchanged. No text, no logos, no watermark."
        ),
    )

    mask = build_mask(image_path)
    with io.BytesIO() as mask_buffer:
        mask.save(mask_buffer, format="PNG")
        mask_buffer.seek(0)

        with image_path.open("rb") as image_file:
            result = client.images.edit(
                model=model,
                image=image_file,
                mask=(f"{image_path.stem}-mask.png", mask_buffer.read(), "image/png"),
                prompt=prompt,
            )

    output_bytes = extract_image_bytes(result)
    out_path.write_bytes(output_bytes)


def validate_files(files: Iterable[Path]) -> list[Path]:
    resolved = []
    for f in files:
        p = Path(f)
        if not p.exists():
            raise FileNotFoundError(f"File not found: {p}")
        resolved.append(p)
    return resolved


def main() -> int:
    args = parse_args()
    try:
        ensure_dependencies()
        files = validate_files(args.files)
    except Exception as exc:
        print(f"[error] {exc}")
        return 1

    client = OpenAI()

    for file_path in files:
        try:
            if args.in_place:
                backup = backup_file(file_path, args.backup_dir)
                out_path = file_path
                print(f"[backup] {file_path} -> {backup}")
            else:
                out_path = output_path_for(file_path, args.out_dir)

            process_file(client, file_path, args.model, out_path)
            print(f"[ok] {file_path} -> {out_path}")
        except Exception as exc:
            print(f"[error] Failed on {file_path}: {exc}")
            return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
