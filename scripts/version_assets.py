"""Cache busting for the exchange on GitHub Pages.

Pages serves every file with `cache-control: max-age=600`, so after a deploy
browsers keep running stale ES modules. This appends `?v=<version>` to every
relative JS/CSS reference so each deploy gets fresh URLs, and stamps the
version into APP_VERSION.

Usage: python3 scripts/version_assets.py <site_exchange_dir> <version>
"""
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
version = sys.argv[2]

# from "./x.js" / import("../x.js") / src="js/app.js" / href="css/style.css"
JS_REF = re.compile(r'''((?:from|import)\s*\(?\s*["'])(\.{1,2}/[^"'?]+\.js)(["'])''')
HTML_REF = re.compile(r'''((?:src|href)=")((?!https?:|//)[^"?]+\.(?:js|css))(")''')

for path in root.rglob("*.js"):
    text = path.read_text(encoding="utf-8")
    text = JS_REF.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(3)}", text)
    text = text.replace('export const APP_VERSION = "dev";', f'export const APP_VERSION = "{version}";')
    path.write_text(text, encoding="utf-8")

for path in root.rglob("*.html"):
    text = path.read_text(encoding="utf-8")
    text = HTML_REF.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(3)}", text)
    path.write_text(text, encoding="utf-8")

print(f"versioned exchange assets with v={version}")
