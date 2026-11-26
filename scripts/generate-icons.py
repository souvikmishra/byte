"""
Generate BYTE PNG icons (pure stdlib, no dependencies).
Draws a red prohibition circle (⊘) on a transparent background.

Usage:
  python3 scripts/generate-icons.py
"""

import math
import struct
import zlib
import os

SIZES = [16, 32, 48, 128]
RED = (255, 0, 0, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def lerp(a, b, t):
    return a + (b - a) * t


def make_png(width, height, pixels):
    """Encode a list of (r,g,b,a) tuples into a valid PNG bytestring."""

    def chunk(tag, data):
        payload = tag + data
        return (
            struct.pack('>I', len(data))
            + payload
            + struct.pack('>I', zlib.crc32(payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type: None
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw.extend([r, g, b, a])

    compressed = zlib.compress(bytes(raw), 9)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )


def render_icon(size):
    pixels = [TRANSPARENT] * (size * size)
    cx = cy = (size - 1) / 2.0
    outer_r = size * 0.46
    inner_r = size * 0.32
    stroke = outer_r - inner_r          # ring thickness
    bar_half = stroke * 0.55            # diagonal bar half-width

    # Super-sample each pixel to reduce aliasing on small sizes.
    samples = 3 if size <= 32 else 2
    step = 1.0 / samples
    offsets = [step * i + step * 0.5 - 0.5 for i in range(samples)]

    for y in range(size):
        for x in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0

            for dy in offsets:
                for dx in offsets:
                    sx = x + dx
                    sy = y + dy
                    dist = math.hypot(sx - cx, sy - cy)

                    # Is this sample inside the outer circle?
                    if dist > outer_r:
                        # Outside everything — transparent.
                        continue

                    # Diagonal bar: perpendicular distance to the line
                    # running at 45° from top-right to bottom-left.
                    # Line equation through centre: (sx-cx) + (sy-cy) = 0
                    perp = abs((sx - cx) + (sy - cy)) / math.sqrt(2)

                    if perp <= bar_half and dist <= outer_r:
                        # Inside the bar — red
                        ra, ga, ba, aa = RED
                    elif dist >= inner_r:
                        # Inside the ring (between inner_r and outer_r) — red
                        ra, ga, ba, aa = RED
                    else:
                        # Inside the hole — transparent
                        continue

                    r_acc += ra
                    g_acc += ga
                    b_acc += ba
                    a_acc += aa

            total = samples * samples
            if a_acc > 0:
                pixels[y * size + x] = (
                    round(r_acc / total),
                    round(g_acc / total),
                    round(b_acc / total),
                    round(a_acc / total),
                )

    return pixels


def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out_dir, exist_ok=True)

    for size in SIZES:
        pixels = render_icon(size)
        data = make_png(size, size, pixels)
        path = os.path.join(out_dir, f'icon{size}.png')
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  ✓  icon{size}.png  ({len(data)} bytes)')

    print('Done.')


if __name__ == '__main__':
    main()
