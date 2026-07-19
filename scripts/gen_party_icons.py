"""Generate Party Arena app icons (four colored player-dots on a violet gradient) without external assets."""
from PIL import Image, ImageDraw
import math

def lerp(a, b, t):
    return a + (b - a) * t

def gradient_bg(size, c1, c2):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / size
        r = lerp(c1[0], c2[0], t)
        g = lerp(c1[1], c2[1], t)
        b = lerp(c1[2], c2[2], t)
        for x in range(size):
            px[x, y] = (int(r), int(g), int(b))
    return img

def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask

PLAYER_COLORS = [(255, 90, 95), (77, 141, 255), (77, 225, 127), (255, 209, 102)]

def draw_dots(draw, cx, cy, s):
    r = s * 0.17
    offset = s * 0.24
    positions = [
        (cx, cy - offset),
        (cx + offset, cy),
        (cx, cy + offset),
        (cx - offset, cy),
    ]
    for (x, y), color in zip(positions, PLAYER_COLORS):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color, outline=(28, 17, 48, 255), width=max(2, int(s * 0.014)))

def make_icon(size, maskable=False):
    c1 = (122, 58, 237)
    c2 = (42, 17, 96)
    bg = gradient_bg(size, c1, c2)
    radius = int(size * (0.5 if maskable else 0.22))
    mask = rounded_mask(size, radius) if not maskable else Image.new("L", (size, size), 255)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)
    draw = ImageDraw.Draw(canvas)
    scale = 0.92 if not maskable else 0.56
    draw_dots(draw, size / 2, size / 2, size * scale)
    return canvas

for size in (192, 512):
    make_icon(size).save(f"/home/user/Emperator-coin/party/icons/icon-{size}.png")

make_icon(512, maskable=True).save("/home/user/Emperator-coin/party/icons/icon-512-maskable.png")

apple = make_icon(180)
apple.convert("RGB").save("/home/user/Emperator-coin/party/icons/apple-touch-icon.png")

favicon = make_icon(32)
favicon.save("/home/user/Emperator-coin/party/icons/favicon.png")

print("party icons generated")
