"""Иконки Badchat без внешних библиотек: рисуем пиксели и пишем PNG вручную."""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_alpha(x, y, size, radius):
    """Сглаженная альфа скруглённого квадрата."""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    d = math.hypot(x - cx, y - cy)
    return max(0.0, min(1.0, radius - d + 0.5))


def bubble_alpha(x, y, size):
    """Речевой пузырь с хвостиком."""
    s = size
    left, right = 0.22 * s, 0.78 * s
    top, bottom = 0.26 * s, 0.62 * s
    r = 0.12 * s
    cx = min(max(x, left + r), right - r)
    cy = min(max(y, top + r), bottom - r)
    body = max(0.0, min(1.0, r - math.hypot(x - cx, y - cy) + 0.5))

    # хвостик — треугольник слева снизу
    tail = 0.0
    tx, ty = x - 0.30 * s, y - bottom
    if 0 <= ty <= 0.16 * s:
        width = 0.13 * s * (1 - ty / (0.16 * s))
        if -0.02 * s <= tx <= width:
            tail = 1.0
    return max(body, tail)


def make_icon(size, maskable=False):
    pad = int(size * 0.10) if maskable else 0
    inner = size - 2 * pad
    radius = inner * (0.5 if maskable else 0.22)
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            ix, iy = x - pad, y - pad
            t = (ix + iy) / (2 * max(inner, 1))
            r = int(lerp(94, 124, t))
            g = int(lerp(176, 108, t))
            b = int(lerp(255, 255, t))

            a = rounded_alpha(ix, iy, inner, radius) if 0 <= ix < inner and 0 <= iy < inner else 0.0

            if a > 0:
                ba = bubble_alpha(ix, iy, inner)
                if ba > 0:
                    r = int(lerp(r, 10, ba))
                    g = int(lerp(g, 14, ba))
                    b = int(lerp(b, 20, ba))
            row += bytes((r, g, b, int(a * 255)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    print("написано", path.name, size)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        write_png(OUT / f"icon-{size}.png", make_icon(size), size)
    write_png(OUT / "icon-512-maskable.png", make_icon(512, maskable=True), 512)
    write_png(OUT / "apple-touch-icon.png", make_icon(180), 180)
