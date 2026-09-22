#!/usr/bin/env python3
"""Собирает PDF-версию презентации из index.html.

Что делает:
  1. готовит картинки под печать: обрезает под 1280x720, впечатывает CSS-фильтры
     и прозрачность (иначе Chrome пересжимает фото в PDF и файл распухает до 100+ МБ);
  2. скачивает и встраивает шрифты (из Chrome в этой среде сеть недоступна);
  3. печатает каждый слайд отдельной страницей 13,333 x 7,5 дюйма.

Запуск: python3 build_pdf.py
"""
import base64, os, re, shutil, subprocess, sys
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, DST = os.path.join(HERE, "img"), os.path.join(HERE, "img_print")
PDF = os.path.join(HERE, "Открытие-Америки.pdf")
CHROME = next((p for p in ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                           shutil.which("chromium") or "", shutil.which("google-chrome") or ""] if p and os.path.exists(p)), None)
FONTS_CSS = ("https://fonts.googleapis.com/css2?family=Oswald:wght@300;500;700"
             "&family=Golos+Text:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap")
INK = (8, 13, 17)
# точка фокуса кадра (доля ширины, доля высоты) — чтобы у портретов не срезало лица
FOCUS = {"columbus": (0.68, 0.16), "vespucci": (0.70, 0.18), "magellan": (0.68, 0.14),
         "isabella": (0.62, 0.22), "conquest": (0.58, 0.50)}

def curl(url):
    return subprocess.run(["curl", "-sS", "-m", "90", "-A", "Mozilla/5.0", url],
                          capture_output=True).stdout

def prepare_images():
    os.makedirs(DST, exist_ok=True)
    def cover(im, w, h, focus=(0.5, 0.5)):
        s = max(w / im.width, h / im.height)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        l = round((im.width - w) * focus[0])
        t = round((im.height - h) * focus[1])
        return im.crop((l, t, l + w, t + h))
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".jpg"):
            continue
        slug = name[:-4]
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        im = cover(im, 1280, 720, FOCUS.get(slug, (0.5, 0.5)))
        im = ImageEnhance.Color(im).enhance(1.06)
        im = ImageEnhance.Contrast(im).enhance(1.04)
        im = Image.blend(Image.new("RGB", im.size, INK), im, 0.94)
        im.save(os.path.join(DST, name), "JPEG", quality=80, optimize=True, progressive=True)

def inline_fonts():
    css = curl(FONTS_CSS).decode("utf-8", "replace")
    keep = {"cyrillic", "cyrillic-ext", "latin", "latin-ext"}
    out = []
    for subset, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S):
        if subset not in keep:
            continue
        m = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", block)
        if not m:
            continue
        data = curl(m.group(1))
        if len(data) < 500:
            continue
        b64 = base64.b64encode(data).decode()
        out.append(block.replace(m.group(0), f"url(data:font/woff2;base64,{b64}) format('woff2')")
                        .replace("format('woff2') format('woff2')", "format('woff2')"))
    return "\n".join(out)

PRINT_CSS = """
@page{ size: 13.333in 7.5in; margin: 0; }
html,body{ margin:0; padding:0; background:#080D11; display:block; min-height:0; overflow:visible; }
.deck{ width:1280px; height:auto; aspect-ratio:auto; display:block; overflow:visible;
       box-shadow:none; container-type:inline-size; }
.slide{ position:relative; inset:auto; width:1280px; height:720px; opacity:1; visibility:visible;
        overflow:hidden; display:block; break-after:page; page-break-after:always; animation:none!important; }
.slide:last-of-type{ break-after:auto; page-break-after:auto; }
.slide *{ animation:none!important; transition:none!important; }
.wrap{ overflow:visible!important; padding-bottom:7.6cqw!important; }
.bg img{ transform:none!important; opacity:1!important; filter:none!important; }
.duo img{ filter:none!important; }
.coast{ stroke-dasharray:none!important; stroke-dashoffset:0!important; }
.pin{ opacity:1!important; transform:none!important; }
.pin circle.ring{ opacity:.35!important; }
.bar,.rail,.nav,.brand,.count,.geo{ display:none!important; }
.slide::after{ content:attr(data-geo); position:absolute; left:clamp(16px,4.2cqw,96px); bottom:2cqw;
  font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:clamp(8.5px,.8cqw,15px);
  letter-spacing:.1em; color:#8FA0A9; max-width:60cqw; }
.slide::before{ content:attr(data-num); position:absolute; right:clamp(16px,4.2cqw,96px); top:1.6cqw; z-index:6;
  font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:clamp(8.5px,.8cqw,15px);
  letter-spacing:.1em; color:#8FA0A9; }
"""

FIT_SCRIPT = """
<script>
/* Вписываем содержимое каждого слайда в страницу: на печати прокрутки нет,
   поэтому длинные слайды слегка уменьшаем, чтобы текст не налезал на подпись. */
document.querySelectorAll('.slide .wrap').forEach(function(w){
  var need = w.scrollHeight, have = w.clientHeight;
  if (need > have - 2) {
    var k = Math.max(0.62, (have - 6) / need);
    w.style.transform = 'scale(' + k.toFixed(4) + ')';
    w.style.transformOrigin = 'center center';
  }
});
</script>
"""

def build_html(fonts):
    d = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    d = re.sub(r"<script>.*?</script>", "", d, flags=re.S)
    d = re.sub(r'<link[^>]*fonts\.(googleapis|gstatic)[^>]*>', "", d)
    d = d.replace('src="img/', 'src="img_print/').replace('data-src="img/', 'data-src="img_print/')
    d = d.replace('<section class="slide active"', '<section class="slide"')
    total = d.count('<section class="slide"')
    n = [0]
    def number(m):
        n[0] += 1
        return f'<section class="slide" data-num="{n[0]:02d} / {total}"'
    d = re.sub(r'<section class="slide"', number, d)
    d = d.replace("</style>", "</style>\n<style>" + fonts + "</style>\n<style>" + PRINT_CSS + "</style>")
    d += FIT_SCRIPT
    path = os.path.join(HERE, "_print.html")
    open(path, "w", encoding="utf-8").write("<!doctype html><meta charset='utf-8'>" + d)
    return path, total

def main():
    if not CHROME:
        sys.exit("Не найден Chrome/Chromium")
    prepare_images()
    path, total = build_html(inline_fonts())
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                    "--virtual-time-budget=40000", f"--print-to-pdf={PDF}", "file://" + path],
                   capture_output=True)
    os.remove(path)
    shutil.rmtree(DST, ignore_errors=True)
    print(f"готово: {PDF} — страниц {total}, {os.path.getsize(PDF)//1048576} МБ")

if __name__ == "__main__":
    main()
