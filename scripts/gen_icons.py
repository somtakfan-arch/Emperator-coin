"""Generate Remindly app icons (gradient bell mark) without external assets."""
from PIL import Image, ImageDraw
import math

def lerp(a, b, t):
    return a + (b - a) * t

def gradient_bg(size, c1, c2, c3):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            if t < 0.5:
                tt = t / 0.5
                r = lerp(c1[0], c2[0], tt)
                g = lerp(c1[1], c2[1], tt)
                b = lerp(c1[2], c2[2], tt)
            else:
                tt = (t - 0.5) / 0.5
                r = lerp(c2[0], c3[0], tt)
                g = lerp(c2[1], c3[1], tt)
                b = lerp(c2[2], c3[2], tt)
            px[x, y] = (int(r), int(g), int(b))
    return img

def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask

def draw_bell(draw, cx, cy, s, color):
    top = cy - s * 0.42
    bottom = cy + s * 0.30
    width_top = s * 0.06
    width_bottom = s * 0.46

    left_pts, right_pts = [], []
    steps = 48
    for i in range(steps + 1):
        t = i / steps
        w = width_top + (width_bottom - width_top) * (t ** 0.72)
        y = top + (bottom - top) * t
        left_pts.append((cx - w, y))
        right_pts.append((cx + w, y))
    outline = left_pts + right_pts[::-1]
    draw.polygon(outline, fill=color)

    knob_r = s * 0.055
    draw.ellipse([cx - knob_r, top - knob_r * 1.6, cx + knob_r, top + knob_r * 0.4], fill=color)

    base_w = width_bottom * 1.08
    base_h = s * 0.07
    draw.rounded_rectangle(
        [cx - base_w, bottom - s * 0.02, cx + base_w, bottom - s * 0.02 + base_h],
        radius=base_h / 2,
        fill=color,
    )

    clapper_r = s * 0.075
    clapper_y = bottom - s * 0.02 + base_h + s * 0.03
    draw.ellipse(
        [cx - clapper_r, clapper_y, cx + clapper_r, clapper_y + clapper_r * 2],
        fill=color,
    )

def make_icon(size, maskable=False):
    c1 = (255, 77, 141)   # pink
    c2 = (255, 122, 60)   # orange
    c3 = (255, 214, 40)   # yellow/lime
    bg = gradient_bg(size, c1, c2, c3)
    radius = int(size * (0.5 if maskable else 0.22))
    mask = rounded_mask(size, radius) if not maskable else Image.new("L", (size, size), 255)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)
    draw = ImageDraw.Draw(canvas)
    scale = 0.62 if not maskable else 0.42
    draw_bell(draw, size / 2, size / 2, size * scale, (13, 13, 16, 255))
    return canvas

for size in (192, 512):
    make_icon(size).save(f"/home/user/Emperator-coin/icons/icon-{size}.png")

make_icon(512, maskable=True).save("/home/user/Emperator-coin/icons/icon-512-maskable.png")

apple = make_icon(180)
apple.convert("RGB").save("/home/user/Emperator-coin/icons/apple-touch-icon.png")

favicon = make_icon(32)
favicon.save("/home/user/Emperator-coin/icons/favicon.png")

print("icons generated")
