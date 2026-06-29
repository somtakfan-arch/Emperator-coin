#!/bin/bash
# Script to create 3 styled edits from Twitch VOD segments

FONTS_PATH=$(fc-list | grep -i "dejavu" | head -1 | cut -d: -f1 | head -1)
if [ -z "$FONTS_PATH" ]; then
    FONTS_PATH=$(fc-list | grep -i ".ttf" | head -1 | cut -d: -f1)
fi

RAW="edits/raw"
OUT="edits/output"
mkdir -p "$OUT"

echo "Using font: $FONTS_PATH"

# === EDIT 1: Dark Cinematic ===
# Moody dark look with vignette and letterbox
echo "[1/3] Creating Edit 1 - Dark Cinematic..."
ffmpeg -y -i "$RAW/segment1.mp4" \
  -ss 00:00:05 -t 00:00:45 \
  -vf "
    scale=1280:720,
    eq=brightness=-0.08:contrast=1.3:saturation=0.75:gamma=0.9,
    curves=r='0/0 0.5/0.4 1/0.85':g='0/0 0.5/0.45 1/0.9':b='0/0.05 0.5/0.5 1/1.0',
    vignette=PI/4,
    drawbox=x=0:y=0:w=iw:h=ih*0.1:color=black@1.0:t=fill,
    drawbox=x=0:y=ih*0.9:w=iw:h=ih*0.1:color=black@1.0:t=fill,
    drawtext=text='emperatorrr':fontfile=$FONTS_PATH:fontsize=38:fontcolor=white@0.9:x=(w-text_w)/2:y=h*0.82:shadowcolor=black@0.8:shadowx=2:shadowy=2,
    drawtext=text='edit #1':fontfile=$FONTS_PATH:fontsize=22:fontcolor=white@0.6:x=(w-text_w)/2:y=h*0.88:shadowcolor=black@0.6:shadowx=1:shadowy=1
  " \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k \
  "$OUT/edit1_dark_cinematic.mp4"
echo "Edit 1 done."

# === EDIT 2: Warm Energetic ===
# Bright warm colors, high saturation, punchy feel
echo "[2/3] Creating Edit 2 - Warm Energy..."
ffmpeg -y -i "$RAW/segment2.mp4" \
  -ss 00:00:05 -t 00:00:45 \
  -vf "
    scale=1280:720,
    eq=brightness=0.05:contrast=1.25:saturation=1.6:gamma_r=1.15:gamma_g=1.0:gamma_b=0.85,
    curves=r='0/0 0.5/0.55 1/1.0':g='0/0 0.5/0.5 1/0.95':b='0/0 0.5/0.45 1/0.85',
    unsharp=lx=5:ly=5:la=0.8,
    drawbox=x=0:y=0:w=iw:h=ih*0.08:color=black@1.0:t=fill,
    drawbox=x=0:y=ih*0.92:w=iw:h=ih*0.08:color=black@1.0:t=fill,
    drawtext=text='emperatorrr':fontfile=$FONTS_PATH:fontsize=38:fontcolor=white@0.95:x=(w-text_w)/2:y=h*0.84:shadowcolor=black@0.9:shadowx=2:shadowy=2,
    drawtext=text='edit #2':fontfile=$FONTS_PATH:fontsize=22:fontcolor=white@0.7:x=(w-text_w)/2:y=h*0.89:shadowcolor=black@0.7:shadowx=1:shadowy=1
  " \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k \
  "$OUT/edit2_warm_energy.mp4"
echo "Edit 2 done."

# === EDIT 3: High Contrast Monochrome Tinted ===
# Almost black & white with slight teal tint, very punchy
echo "[3/3] Creating Edit 3 - Monochrome Teal..."
ffmpeg -y -i "$RAW/segment3.mp4" \
  -ss 00:00:05 -t 00:00:45 \
  -vf "
    scale=1280:720,
    hue=s=0.15,
    eq=brightness=-0.05:contrast=1.6:saturation=0.2,
    curves=all='0/0 0.3/0.25 0.7/0.78 1/1.0',
    colorbalance=rs=-0.1:gs=-0.05:bs=0.15:rm=-0.05:gm=0.0:bm=0.1,
    vignette=PI/3.5,
    drawbox=x=0:y=0:w=iw:h=ih*0.1:color=black@1.0:t=fill,
    drawbox=x=0:y=ih*0.9:w=iw:h=ih*0.1:color=black@1.0:t=fill,
    drawtext=text='emperatorrr':fontfile=$FONTS_PATH:fontsize=38:fontcolor=white@0.95:x=(w-text_w)/2:y=h*0.82:shadowcolor=black@0.9:shadowx=2:shadowy=2,
    drawtext=text='edit #3':fontfile=$FONTS_PATH:fontsize=22:fontcolor=white@0.65:x=(w-text_w)/2:y=h*0.88:shadowcolor=black@0.7:shadowx=1:shadowy=1
  " \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k \
  "$OUT/edit3_monochrome_teal.mp4"
echo "Edit 3 done."

echo ""
echo "=== All edits complete ==="
ls -lh "$OUT/"
