"""Helpers for the media commands (.stik, .gif, .krom, .save).

Uses Pillow for image work and ffmpeg / yt-dlp (via subprocess) for video.
Everything is wrapped so a missing binary or a bad input surfaces as a normal
exception the caller can turn into a friendly message.
"""
import asyncio
import io
import logging
import os

logger = logging.getLogger(__name__)


async def _run(*args, timeout: int = 180) -> bytes:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        raise RuntimeError("процесс превысил лимит времени")
    if proc.returncode != 0:
        raise RuntimeError((err or b"").decode("utf-8", "ignore")[-400:])
    return out or b""


def photo_to_sticker_bytes(image_bytes: bytes) -> bytes:
    """Convert an image to a 512px WEBP suitable for send_sticker."""
    from PIL import Image

    im = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w, h = im.size
    scale = 512 / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))))
    buf = io.BytesIO()
    im.save(buf, format="WEBP")
    return buf.getvalue()


async def video_to_note(src_path: str) -> str:
    """Square, ≤60s, 384px round-video-note-ready mp4."""
    out = src_path + ".note.mp4"
    await _run(
        "ffmpeg", "-y", "-i", src_path, "-t", "60",
        "-vf", "crop='min(iw,ih)':'min(iw,ih)',scale=384:384",
        "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-b:a", "64k",
        "-movflags", "+faststart", out,
    )
    return out


async def video_to_gif(src_path: str) -> str:
    """Silent, ≤15s mp4 that Telegram treats as a GIF/animation."""
    out = src_path + ".gif.mp4"
    await _run(
        "ffmpeg", "-y", "-i", src_path, "-t", "15", "-an",
        "-vf", "scale='min(480,iw)':-2",
        "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", out,
    )
    return out


async def download_url(url: str, dest_dir: str) -> str:
    """Download a video with yt-dlp (≤49MB so the Bot API can send it)."""
    out_tmpl = os.path.join(dest_dir, "dl.%(ext)s")
    await _run(
        "yt-dlp", "--no-playlist", "--max-filesize", "49M",
        "-f", "mp4/bestvideo*+bestaudio/best", "--merge-output-format", "mp4",
        "-o", out_tmpl, url, timeout=240,
    )
    for name in os.listdir(dest_dir):
        if name.startswith("dl."):
            return os.path.join(dest_dir, name)
    raise RuntimeError("файл не скачался (возможно, больше 49 МБ)")
