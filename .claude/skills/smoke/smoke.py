#!/usr/bin/env python3
"""Дымовой прогон всех точек входа проекта в реальном Chromium.

Поднимает статический сервер, открывает каждое приложение, ждёт networkidle
и падает, если страница отдала не 200, выбросила исключение или написала
что-нибудь в console.error.

    python3 .claude/skills/smoke/smoke.py
    python3 .claude/skills/smoke/smoke.py --shots   # + скриншоты

Требует playwright: pip install playwright (браузер уже стоит в образе).
"""
from __future__ import annotations

import argparse
import http.server
import socket
import subprocess
import sys
import threading
import functools
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

# Хром в этом образе живёт по фиксированному пути и НЕ совпадает с версией,
# которую ждёт свежеустановленный пакет playwright, — поэтому executable_path
# задаётся явно. --no-sandbox обязателен: сессия работает под root, и без него
# рендерер падает, а страница отдаёт ERR_EMPTY_RESPONSE.
CHROMIUM = "/opt/pw-browsers/chromium"
CHROME_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"]

PAGES = [
    ("лендинг", "/"),
    ("Remindly", "/app/"),
    ("StickAnim", "/stickman/"),
    ("Игры", "/games/2-4-player-games/"),
]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Тот же статический сервер, но без построчного лога в stdout."""

    def log_message(self, *args, **kwargs) -> None:  # noqa: D102
        pass


def serve(port: int) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--shots", action="store_true", help="сохранить скриншоты в /tmp/smoke/")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ModuleNotFoundError:
        print("playwright не установлен: pip install playwright", file=sys.stderr)
        return 2

    if not Path(CHROMIUM).exists():
        print(f"нет браузера по пути {CHROMIUM}", file=sys.stderr)
        return 2

    port = free_port()
    httpd = serve(port)
    base = f"http://127.0.0.1:{port}"
    shots = Path("/tmp/smoke")
    if args.shots:
        shots.mkdir(parents=True, exist_ok=True)

    failed = False
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True, executable_path=CHROMIUM, args=CHROME_ARGS
            )
            for label, path in PAGES:
                page = browser.new_page(viewport={"width": 430, "height": 860})
                problems: list[str] = []
                page.on(
                    "console",
                    lambda m: problems.append(f"console.error: {m.text}")
                    if m.type == "error"
                    else None,
                )
                page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
                page.on(
                    "response",
                    lambda r: problems.append(f"{r.status} {r.url}")
                    if r.status >= 400
                    else None,
                )

                resp = page.goto(base + path)
                page.wait_for_load_state("networkidle")
                status = resp.status if resp else 0
                title = page.title()

                if args.shots:
                    name = label.replace(" ", "_")
                    page.screenshot(path=str(shots / f"{name}.png"), full_page=False)

                ok = status == 200 and not problems
                failed = failed or not ok
                print(f"{'OK  ' if ok else 'FAIL'} {label:10} HTTP {status}  «{title[:44]}»")
                for pr in dict.fromkeys(problems):
                    print(f"       {pr[:130]}")
                page.close()
            browser.close()
    finally:
        httpd.shutdown()

    if args.shots:
        print(f"\nскриншоты: {shots}")
    print("\nИТОГ:", "есть ошибки" if failed else "все страницы чистые")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
