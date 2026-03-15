#!/usr/bin/env python3
"""
Generate placeholder mobile app assets for LiveAzan.

Creates the following files using Python stdlib only (no Pillow required):
  apps/mobile/assets/icon.png              1024×1024  brand green #1B5E20
  apps/mobile/assets/adaptive-icon.png    1024×1024  brand green #1B5E20
  apps/mobile/assets/splash.png           2048×2048  brand green #1B5E20
  apps/mobile/assets/sounds/azan-default.wav  1 sec silent WAV 44100 Hz

Run once to unblock expo prebuild. Replace images with final artwork later.
"""

import os
import struct
import zlib
import wave

# ─── Brand colours ────────────────────────────────────────────────────────────

BRAND_GREEN = (0x1B, 0x5E, 0x20, 0xFF)   # #1B5E20
WHITE       = (0xFF, 0xFF, 0xFF, 0xFF)
LIGHT_GREEN = (0x81, 0xC7, 0x84, 0xFF)   # #81C784

# ─── PNG helpers (stdlib only) ────────────────────────────────────────────────

def _chunk(name: bytes, data: bytes) -> bytes:
    c = name + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

def _make_png(width: int, height: int, pixels) -> bytes:
    """
    Generate a minimal valid RGBA PNG.
    pixels: callable(x, y) -> (r, g, b, a) tuple
    """
    raw_rows = []
    for y in range(height):
        row = bytearray([0])  # filter type: None
        for x in range(width):
            r, g, b, a = pixels(x, y)
            row += bytearray([r, g, b, a])
        raw_rows.append(bytes(row))

    raw = b"".join(raw_rows)
    compressed = zlib.compress(raw, level=6)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    # colour type 6 = RGBA
    ihdr_data = struct.pack(">II", width, height) + bytes([8, 6, 0, 0, 0])
    png = (
        header
        + _chunk(b"IHDR", ihdr_data)
        + _chunk(b"IDAT", compressed)
        + _chunk(b"IEND", b"")
    )
    return png

# ─── Circle / crescent drawing ────────────────────────────────────────────────

def _in_circle(x: int, y: int, cx: float, cy: float, r: float) -> bool:
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2

def _icon_pixel(x: int, y: int, size: int):
    """
    Brand-green background, white crescent + dot.
    """
    cx, cy = size / 2, size / 2
    r = size * 0.32
    # Outer circle of crescent
    if _in_circle(x, y, cx, cy, r):
        # Cut the inner circle to form crescent (offset slightly right)
        inner_r = r * 0.78
        inner_cx = cx + r * 0.22
        if _in_circle(x, y, inner_cx, cy, inner_r):
            return BRAND_GREEN  # inside cutout → background
        return WHITE  # crescent body

    # Small star dot: upper right of crescent
    dot_cx = cx + r * 0.55
    dot_cy = cy - r * 0.55
    dot_r = r * 0.12
    if _in_circle(x, y, dot_cx, dot_cy, dot_r):
        return WHITE

    return BRAND_GREEN

def _splash_pixel(x: int, y: int, size: int):
    """
    Brand-green fill with a centred white crescent (larger).
    """
    cx, cy = size / 2, size / 2
    r = size * 0.18
    if _in_circle(x, y, cx, cy, r):
        inner_r = r * 0.78
        inner_cx = cx + r * 0.22
        if _in_circle(x, y, inner_cx, cy, inner_r):
            return BRAND_GREEN
        return WHITE
    dot_cx = cx + r * 0.55
    dot_cy = cy - r * 0.55
    dot_r = r * 0.12
    if _in_circle(x, y, dot_cx, dot_cy, dot_r):
        return WHITE
    return BRAND_GREEN

# ─── WAV helper ───────────────────────────────────────────────────────────────

def _make_silent_wav(path: str, duration_sec: float = 1.0, sample_rate: int = 44100):
    n_frames = int(duration_sec * sample_rate)
    with wave.open(path, "w") as w:
        w.setnchannels(1)       # mono
        w.setsampwidth(2)       # 16-bit
        w.setframerate(sample_rate)
        w.writeframes(b"\x00\x00" * n_frames)

# ─── Main ─────────────────────────────────────────────────────────────────────

ASSETS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "apps", "mobile", "assets"
)

def main():
    sounds_dir = os.path.join(ASSETS_DIR, "sounds")
    os.makedirs(sounds_dir, exist_ok=True)

    specs = [
        ("icon.png",          1024, _icon_pixel),
        ("adaptive-icon.png", 1024, _icon_pixel),
        ("splash.png",        2048, _splash_pixel),
    ]

    for filename, size, pixel_fn in specs:
        path = os.path.join(ASSETS_DIR, filename)
        print(f"  Generating {filename} ({size}×{size})... ", end="", flush=True)
        data = _make_png(size, size, lambda x, y, s=size, fn=pixel_fn: fn(x, y, s))
        with open(path, "wb") as f:
            f.write(data)
        kb = len(data) / 1024
        print(f"done ({kb:.0f} KB)")

    wav_path = os.path.join(sounds_dir, "azan-default.wav")
    print(f"  Generating azan-default.wav (1 s silent)... ", end="", flush=True)
    _make_silent_wav(wav_path)
    print("done")

    print()
    print("Assets written to:", ASSETS_DIR)
    print()
    print("Next steps:")
    print("  git add apps/mobile/assets/")
    print("  git commit -m 'feat(mobile): add placeholder app assets'")
    print("  git push")

if __name__ == "__main__":
    print("=== LiveAzan — Generating Mobile Assets ===")
    print()
    main()
