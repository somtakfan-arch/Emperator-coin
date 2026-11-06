"""Озвучка реплик через Piper (офлайн, русские голоса).
python3 tts.py lines.json out_dir voices_dir  →  печатает JSON с длительностями
lines.json: [{"id": "...", "who": "n|kid|den|baker|...", "text": "..."}]
Голоса: rhasspy/piper-voices (ru_RU-*-medium), лежат в voices_dir.
"""
import hashlib, json, os, subprocess, sys, wave

from piper import PiperVoice
from piper.config import SynthesisConfig

lines = json.load(open(sys.argv[1]))
out_dir, vdir = sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)

# кто → (модель, высота тона, скорость: >1 медленнее)
CAST = {
    'n':       ('dmitri', 1.00, 0.88),
    'nb':      ('dmitri', 1.00, 0.95),
    'kid':     ('ruslan', 1.16, 0.85),
    'den':     ('denis', 1.10, 0.86),
    'gleb':    ('denis', 1.14, 1.0),
    'mom':     ('irina', 1.00, 1.0),
    'baker':   ('irina', 0.96, 0.9),
    'teacher': ('irina', 0.92, 1.05),
    'man':     ('dmitri', 0.88, 0.9),
    'rustam':  ('dmitri', 0.85, 1.05),
}
# как читать числа (Piper путает падежи)
SAY = {
    '22 500': 'двадцать две тысячи пятьсот', '18 750': 'восемнадцать тысяч семьсот пятьдесят',
    '25 000': 'двадцать пять тысяч', '150 000': 'сто пятьдесят тысяч', '75 000': 'семьдесят пять тысяч',
    '16:00': 'шестнадцать ноль-ноль',
    'Blue Ribbon Sports': 'Блю Риббон Спортс', 'Onitsuka Tiger': 'Оницука Тайгер', 'Automobili Lamborghini': 'Аутомобили Ламборгини',
    'Stone Island': 'Стоун Айленд', 'C.P. Company': 'Си Пи Компани', 'Chester Perry': 'Честер Перри', 'Mille Miglia': 'Милле Милья',
    'Louis Vuitton': 'Луи Виттон', 'Lamborghini': 'Ламборгини', 'Samsonite': 'Самсонайт', 'Moncler': 'Монклер', 'Ferrari': 'Феррари',
    'Missoni': 'Миссони', 'Adidas': 'Адидас', 'Puma': 'Пума', 'Ruda': 'Руда', 'Nike': 'Найк', 'Chanel': 'Шанель', 'Gucci': 'Гуччи',
    'Miura': 'Миура', '@BedDialog_bot': 'Бед Диалог бот', 'Bed Dialog': 'Бед Диалог', 'Minecraft': 'Майнкрафт', 'Audi': 'Ауди', 'LEGO': 'Лего', 'C.P.': 'Си Пи', '19:00': 'девятнадцать ноль-ноль', '№': 'номер ',
}
models = {}
res = {}
for ln in lines:
    model, pitch, slow = CAST.get(ln['who'], CAST['n'])
    text = ln['text'].replace('*', '')
    for k, v in SAY.items():
        text = text.replace(k, v)
    key = hashlib.md5(f"{model}|{pitch}|{slow}|{text}".encode()).hexdigest()[:12]
    path = os.path.join(out_dir, key + '.wav')
    if not os.path.exists(path):
        if model not in models:
            models[model] = PiperVoice.load(os.path.join(vdir, f'ru_RU-{model}-medium.onnx'))
        raw = path + '.raw.wav'
        with wave.open(raw, 'wb') as wf:
            models[model].synthesize_wav(text, wf, SynthesisConfig(length_scale=slow))
        if pitch != 1.0:
            af = f"asetrate=22050*{pitch},aresample=22050,atempo={1 / pitch:.4f}"
        else:
            af = "anull"
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', af + ",silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", '-ar', '44100', '-ac', '1', path], check=True)
        os.remove(raw)
    with wave.open(path) as w:
        dur = w.getnframes() / w.getframerate()
    res[ln['id']] = {'file': os.path.abspath(path), 'dur': round(dur, 3)}
print(json.dumps(res))
