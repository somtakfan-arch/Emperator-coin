"""Generate StickAnim app icons (running stickman on a gradient) without external assets."""
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

def draw_stickman(draw, cx, cy, s, color, w):
    # running-pose stickman drawn with simple limb segments
    hip = (cx, cy + s * 0.06)
    neck = (cx - s * 0.02, cy - s * 0.30)
    head = (cx - s * 0.05, cy - s * 0.46)

    draw.line([hip, neck], fill=color, width=w)
    draw.ellipse([head[0] - s * 0.12, head[1] - s * 0.12, head[0] + s * 0.12, head[1] + s * 0.12], outline=color, width=w)

    # arms
    elbowL = (neck[0] - s * 0.26, neck[1] + s * 0.10)
    handL = (neck[0] - s * 0.14, neck[1] + s * 0.30)
    draw.line([neck, elbowL, handL], fill=color, width=w, joint="curve")

    elbowR = (neck[0] + s * 0.30, neck[1] - s * 0.02)
    handR = (neck[0] + s * 0.46, neck[1] + s * 0.10)
    draw.line([neck, elbowR, handR], fill=color, width=w, joint="curve")

    # legs
    kneeL = (hip[0] - s * 0.22, hip[1] + s * 0.24)
    footL = (hip[0] - s * 0.10, hip[1] + s * 0.46)
    draw.line([hip, kneeL, footL], fill=color, width=w, joint="curve")

    kneeR = (hip[0] + s * 0.26, hip[1] + s * 0.16)
    footR = (hip[0] + s * 0.42, hip[1] + s * 0.34)
    draw.line([hip, kneeR, footR], fill=color, width=w, joint="curve")

    for pt in (hip, neck, elbowL, handL, elbowR, handR, kneeL, footL, kneeR, footR):
        r = s * 0.028
        draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=color)

def make_icon(size, maskable=False):
    c1 = (63, 208, 255)   # cyan
    c2 = (47, 143, 224)   # blue
    bg = gradient_bg(size, c1, c2)
    radius = int(size * (0.5 if maskable else 0.22))
    mask = rounded_mask(size, radius) if not maskable else Image.new("L", (size, size), 255)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)
    draw = ImageDraw.Draw(canvas)
    scale = 0.92 if not maskable else 0.60
    w = max(2, int(size * 0.028))
    draw_stickman(draw, size / 2, size / 2 + size * 0.02, size * scale, (20, 21, 27, 255), w)
    return canvas

for size in (192, 512):
    make_icon(size).save(f"/home/user/Emperator-coin/stickman/icons/icon-{size}.png")

make_icon(512, maskable=True).save("/home/user/Emperator-coin/stickman/icons/icon-512-maskable.png")

apple = make_icon(180)
apple.convert("RGB").save("/home/user/Emperator-coin/stickman/icons/apple-touch-icon.png")

favicon = make_icon(32)
favicon.save("/home/user/Emperator-coin/stickman/icons/favicon.png")

print("stickman icons generated")
