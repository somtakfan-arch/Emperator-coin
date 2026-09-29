#!/usr/bin/env python3
"""Сборка PDF для быстрой печати.

Карточки: каждая страница рендерится в одну JPEG-картинку 300 dpi и
кладётся в PDF как есть — принтер не считает градиенты и прозрачность.
Договор: векторный PDF без прозрачности.

  python3 build.py            -> out/ (с people.js) или образцы (без него)
"""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
A4_PT = (595.28, 841.89)


def chrome(*args):
    subprocess.run([CHROME, '--no-sandbox', '--disable-gpu', '--hide-scrollbars', *args],
                   check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def shot(url, path):
    chrome('--force-device-scale-factor=3.125', '--window-size=794,1123', f'--screenshot={path}', url)


def jpegs_to_pdf(jpegs, out):
    """Минимальный PDF: по одной JPEG-картинке на страницу A4."""
    objs = []
    kids = []
    for j in jpegs:
        data = open(j, 'rb').read()
        w, h = jpeg_size(data)
        n = len(objs)
        img, content, page = n + 3, n + 4, n + 5
        objs.append(b'<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB '
                    b'/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n' % (w, h, len(data)) + data + b'\nendstream')
        cs = b'q %.2f 0 0 %.2f 0 0 cm /Im Do Q' % A4_PT
        objs.append(b'<< /Length %d >>\nstream\n' % len(cs) + cs + b'\nendstream')
        objs.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] '
                    b'/Resources << /XObject << /Im %d 0 R >> >> /Contents %d 0 R >>' % (*A4_PT, img, content))
        kids.append(page)
    allobjs = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [%s] /Count %d >>' % (b' '.join(b'%d 0 R' % k for k in kids), len(kids))] + objs
    buf = bytearray(b'%PDF-1.4\n')
    offs = []
    for i, o in enumerate(allobjs, 1):
        offs.append(len(buf))
        buf += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    x = len(buf)
    buf += b'xref\n0 %d\n0000000000 65535 f \n' % (len(allobjs) + 1)
    buf += b''.join(b'%010d 00000 n \n' % o for o in offs)
    buf += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(allobjs) + 1, x)
    open(out, 'wb').write(buf)


def jpeg_size(d):
    i = 2
    while i < len(d):
        marker, ln = d[i + 1], int.from_bytes(d[i + 2:i + 4], 'big')
        if marker in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(d[i + 7:i + 9], 'big'), int.from_bytes(d[i + 5:i + 7], 'big')
        i += 2 + ln
    raise ValueError('bad jpeg')


def main():
    has_people = os.path.exists(os.path.join(HERE, 'people.js'))
    outdir = os.path.join(HERE, 'out' if has_people else '.')
    os.makedirs(outdir, exist_ok=True)
    count = 4
    if has_people:
        js = open(os.path.join(HERE, 'people.js'), encoding='utf-8').read()
        count = len(re.findall(r'\bsn\s*:', js))
    url = 'file://' + os.path.join(HERE, 'a4.html')
    with tempfile.TemporaryDirectory() as tmp:
        for g in range((count + 3) // 4):
            name = f'fsin-list-{g + 1}' if has_people else 'fsin-a4'
            ins, cov = os.path.join(tmp, 'i.jpeg'), os.path.join(tmp, 'c.jpeg')
            shot(f'{url}?part=inside&g={g}', ins)
            rot = os.path.join(tmp, 'r.jpeg')
            shot(f'{url}?part=cover&g={g}', cov)
            shot(f'{url}?part=cover&g={g}&rot=1', rot)
            jpegs_to_pdf([ins], os.path.join(outdir, f'{name}-1-vnutri.pdf'))
            # ручная вставка: лист переворачивается по короткому краю -> обложка развёрнута на 180°
            jpegs_to_pdf([rot], os.path.join(outdir, f'{name}-2-oblozhka.pdf'))
            # автодуплекс «по длинному краю»
            jpegs_to_pdf([ins, cov], os.path.join(outdir, f'{name}-dvustoronniy.pdf'))
    # документы (вектор, без прозрачности) — пересобираются, только если менялся шаблон
    subprocess.run([sys.executable, os.path.join(HERE, 'gen_docs.py')], check=True, stdout=subprocess.DEVNULL)
    css = os.path.join(HERE, 'doc.css')
    for n in ('dogovor', 'ustav', 'kodeks', 'protsess', 'slovar', 'order'):
        html, pdf = os.path.join(HERE, f'{n}.html'), os.path.join(HERE, f'fsin-{n}.pdf')
        src_time = max(os.path.getmtime(html), os.path.getmtime(css) if n != 'dogovor' else 0)
        if not os.path.exists(pdf) or src_time > os.path.getmtime(pdf):
            chrome('--no-pdf-header-footer', '--print-to-pdf=' + pdf, 'file://' + html)
    for f in sorted(os.listdir(outdir)):
        if f.endswith('.pdf'):
            print(f'{os.path.getsize(os.path.join(outdir, f)) // 1024:>6} KB  {f}')


if __name__ == '__main__':
    main()
