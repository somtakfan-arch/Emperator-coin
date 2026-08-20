#!/usr/bin/env python3
"""Предпушевые проверки Emperator-coin.

Проект без сборки и без тестов, поэтому единственная защита от поломки
продакшна — этот скрипт. Проверяет:

  1. манифесты PWA парсятся и ссылаются на существующие иконки;
  2. каждый URL из PRECACHE_URLS резолвится в реальный файл
     (cache.addAll отклоняет весь промис при первом же 404 — service worker
     тогда не установится вообще ни у кого);
  3. синтаксис всех .js и инлайновых <script> через node --check;
  4. CACHE_VERSION поднят, если изменились закэшированные ассеты;
  5. воркфлоу деплоя копирует все папки верхнего уровня.

Код возврата: 0 — чисто или только предупреждения, 1 — есть ошибки.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE_REF = "origin/main"

errors: list[str] = []
warnings: list[str] = []
checked = 0


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def run(*args: str) -> tuple[int, str]:
    p = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


# --------------------------------------------------------------------------
# 1. Манифесты PWA
# --------------------------------------------------------------------------
def check_manifests() -> None:
    global checked
    for rel in ("manifest.json", "stickman/manifest.json"):
        path = ROOT / rel
        if not path.exists():
            err(f"{rel}: файла нет")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{rel}: невалидный JSON — {e}")
            continue
        checked += 1

        for field in ("name", "start_url", "icons", "display"):
            if field not in data:
                err(f"{rel}: нет обязательного поля {field!r}")

        base = path.parent
        for icon in data.get("icons", []):
            src = icon.get("src", "")
            if not src:
                err(f"{rel}: иконка без src")
                continue
            if not (base / src).exists():
                err(f"{rel}: иконка {src} не существует")

        purposes = {i.get("purpose", "any") for i in data.get("icons", [])}
        if "maskable" not in purposes:
            warn(f"{rel}: нет maskable-иконки — Android обрежет знак по кругу")


# --------------------------------------------------------------------------
# 2. Service worker'ы: precache-списки
# --------------------------------------------------------------------------
SWS = ("sw.js", "stickman/sw.js")


def parse_sw(text: str) -> tuple[str | None, list[str]]:
    m = re.search(r'CACHE_VERSION\s*=\s*["\']([^"\']+)["\']', text)
    version = m.group(1) if m else None
    block = re.search(r"PRECACHE_URLS\s*=\s*\[(.*?)\]", text, re.S)
    urls = re.findall(r'["\']([^"\']+)["\']', block.group(1)) if block else []
    return version, urls


def resolve(base: Path, url: str) -> Path:
    """Превратить URL из precache-списка в путь на диске."""
    rel = url[2:] if url.startswith("./") else url
    target = base / rel if rel else base
    if url.endswith("/") or not rel:
        target = target / "index.html"
    return target


def check_service_workers() -> dict[str, tuple[str | None, list[str]]]:
    global checked
    parsed: dict[str, tuple[str | None, list[str]]] = {}
    for rel in SWS:
        path = ROOT / rel
        if not path.exists():
            err(f"{rel}: файла нет")
            continue
        version, urls = parse_sw(path.read_text(encoding="utf-8"))
        parsed[rel] = (version, urls)
        checked += 1

        if version is None:
            err(f"{rel}: не найден CACHE_VERSION")
        elif not re.fullmatch(r"[a-z0-9-]+-v\d+", version):
            warn(f"{rel}: CACHE_VERSION {version!r} не в формате <имя>-v<N>")

        if not urls:
            err(f"{rel}: PRECACHE_URLS пуст или не распознан")

        base = path.parent
        for url in urls:
            if not resolve(base, url).exists():
                err(f"{rel}: PRECACHE_URLS ссылается на несуществующий {url}")
    return parsed


# --------------------------------------------------------------------------
# 3. Синтаксис JS
# --------------------------------------------------------------------------
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)


def node_check(source: str, label: str) -> None:
    global checked
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as fh:
        fh.write(source)
        tmp = fh.name
    code, out = run("node", "--check", tmp)
    Path(tmp).unlink(missing_ok=True)
    checked += 1
    if code != 0:
        detail = [ln for ln in out.replace(tmp, label).splitlines() if ln.strip()]
        interesting = [ln for ln in detail if "SyntaxError" in ln or re.match(r"\S+:\d+", ln)]
        err(f"{label}: синтаксическая ошибка\n    " + "\n    ".join((interesting or detail)[:4]))


def check_js() -> None:
    if run("node", "--version")[0] != 0:
        warn("node не найден — проверка синтаксиса JS пропущена")
        return

    for path in sorted(ROOT.glob("**/*.js")):
        if any(part in {".git", "node_modules", ".claude"} for part in path.parts):
            continue
        rel = path.relative_to(ROOT)
        node_check(path.read_text(encoding="utf-8"), str(rel))

    for path in sorted(ROOT.glob("**/*.html")):
        if any(part in {".git", "node_modules"} for part in path.parts):
            continue
        rel = path.relative_to(ROOT)
        blocks = SCRIPT_RE.findall(path.read_text(encoding="utf-8"))
        for i, block in enumerate(blocks, 1):
            if block.strip():
                node_check(block, f"{rel} <script #{i}>")


# --------------------------------------------------------------------------
# 4. Бамп CACHE_VERSION при изменении закэшированных ассетов
# --------------------------------------------------------------------------
def changed_files() -> set[str] | None:
    if run("git", "rev-parse", "--verify", BASE_REF)[0] != 0:
        return None
    names: set[str] = set()
    for args in (
        ("git", "diff", "--name-only", BASE_REF, "--"),
        ("git", "ls-files", "--others", "--exclude-standard"),
    ):
        code, out = run(*args)
        if code == 0 and out:
            names.update(out.splitlines())
    return names


def check_bump(parsed: dict[str, tuple[str | None, list[str]]]) -> None:
    changed = changed_files()
    if changed is None:
        warn(f"{BASE_REF} недоступен — проверка бампа CACHE_VERSION пропущена")
        return

    for rel, (version, urls) in parsed.items():
        base = (ROOT / rel).parent
        precached = {
            str(resolve(base, u).resolve().relative_to(ROOT))
            for u in urls
            if resolve(base, u).exists()
        }
        touched = sorted(precached & changed)
        if not touched:
            continue

        code, old = run("git", "show", f"{BASE_REF}:{rel}")
        if code != 0:
            continue
        old_version, _ = parse_sw(old)
        if old_version == version:
            err(
                f"{rel}: CACHE_VERSION остался {version!r}, но изменены "
                f"закэшированные ассеты ({', '.join(touched[:4])}"
                f"{' и ещё ' + str(len(touched) - 4) if len(touched) > 4 else ''}). "
                f"Подними версию — иначе обновление не доедет до пользователей."
            )


# --------------------------------------------------------------------------
# 5. Полнота списка копирования в деплое
# --------------------------------------------------------------------------
def check_deploy() -> None:
    global checked
    wf = ROOT / ".github/workflows/deploy-pages.yml"
    if not wf.exists():
        warn("нет .github/workflows/deploy-pages.yml")
        return
    text = wf.read_text(encoding="utf-8")
    checked += 1

    published = {"index.html", "styles.css", "landing.js", "manifest.json", "sw.js"}
    for entry in sorted(ROOT.iterdir()):
        name = entry.name
        if name.startswith(".") or name in {"scripts", "CLAUDE.md"}:
            continue
        if entry.is_dir() or name in published:
            if not re.search(rf"\b{re.escape(name)}\b", text):
                err(f"deploy-pages.yml: {name} не копируется в _site — не попадёт на Pages")

    code, branch = run("git", "rev-parse", "--abbrev-ref", "HEAD")
    if code == 0 and branch not in ("main", "HEAD"):
        if not re.search(rf"^\s*-\s*{re.escape(branch)}\s*$", text, re.M):
            warn(
                f"deploy-pages.yml: ветки {branch!r} нет в on.push.branches — "
                f"пуш в неё не задеплоится"
            )


# --------------------------------------------------------------------------
def main() -> int:
    check_manifests()
    parsed = check_service_workers()
    check_js()
    check_bump(parsed)
    check_deploy()

    for w in warnings:
        print(f"  предупреждение: {w}")
    for e in errors:
        print(f"  ОШИБКА: {e}")

    print()
    if errors:
        print(f"FAIL — ошибок: {len(errors)}, предупреждений: {len(warnings)}")
        return 1
    print(f"OK — проверок: {checked}, предупреждений: {len(warnings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
