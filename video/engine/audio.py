"""Звук для серии: фоновая музыка по настроению сцен + эффекты из списка событий.
python3 audio.py ep.json out.wav
"""
import json, sys, wave
import numpy as np

SR = 44100
spec = json.load(open(sys.argv[1]))
D = spec['dur'] + 0.3
N = int(SR * D)
out = np.zeros(N)
rng = np.random.default_rng(7)


def T(n):
    return np.arange(n) / SR


def add(buf, t0, sig, g=1.0):
    i = int(t0 * SR)
    if i < 0:
        sig = sig[-i:]; i = 0
    j = min(N, i + len(sig))
    if i < N:
        buf[i:j] += sig[:j - i] * g


def env(n, a=.005, r=.1):
    t = T(n)
    return np.minimum(1, t / a) * np.exp(-t / r)


def tone(f, d, a=.005, r=.15, kind='sin'):
    n = int(d * SR); t = T(n)
    if kind == 'tri':
        w = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t))
    elif kind == 'sq':
        w = np.sign(np.sin(2 * np.pi * f * t)) * .5
    else:
        w = np.sin(2 * np.pi * f * t)
    return w * env(n, a, r)


def noise(d, r=.05, hp=False):
    n = int(d * SR); w = rng.standard_normal(n)
    if hp:
        w = np.diff(np.concatenate([[0], w]))
    return w * env(n, .001, r)


def sweep(f0, f1, d, r=.1):
    n = int(d * SR); t = T(n)
    f = f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .002, r)


m2f = lambda m: 440 * 2 ** ((m - 69) / 12)

# ---------- музыка ----------
MOODS = {
    'chill': dict(bpm=88, chords=[[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], drums=1, hats=2, bright=1.0),
    'tense': dict(bpm=104, chords=[[57, 60, 64], [57, 60, 64], [58, 62, 65], [56, 60, 63]], drums=1, hats=4, bright=.8),
    'sad':   dict(bpm=72, chords=[[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], drums=0, hats=0, bright=.7),
    'horror': dict(bpm=60, chords=[[45, 48, 51], [44, 47, 51], [45, 48, 52], [41, 44, 48]], drums=0, hats=0, bright=.3, horror=True),
    'win':   dict(bpm=96, chords=[[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], drums=1, hats=2, bright=1.2),
}
moods = spec['moods']


def mood_at(t):
    m = moods[0][1]
    for st, mm in moods:
        if t >= st:
            m = mm
    return m


mus = np.zeros(N)
t = 0.0
bar_i = 0
while t < D:
    M = MOODS.get(mood_at(t + .01), MOODS['chill'])
    beat = 60 / M['bpm']; bar = beat * 4
    ch = M['chords'][bar_i % 4]
    for mn in ch:
        n = int(bar * SR); tt = T(n)
        w = (np.sin(2 * np.pi * m2f(mn) * tt) + .3 * M['bright'] * np.sin(2 * np.pi * m2f(mn) * 2 * tt)) * np.minimum(1, tt / .25) * np.exp(-tt / 2.2)
        add(mus, t, w, .045)
    add(mus, t, tone(m2f(ch[0] - 12), bar * .9, .01, 1.2, 'tri'), .22)
    if M['drums']:
        for q in range(4):
            tb = t + q * beat
            if q in (0, 2):
                n = int(.3 * SR); tt = T(n); f = 110 * np.exp(-tt * 18) + 45
                add(mus, tb, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / .12), .5)
            else:
                add(mus, tb, noise(.2, .06), .12)
            for h in range(M['hats']):
                add(mus, tb + h * beat / M['hats'], noise(.05, .012, True), .05)
    elif M.get('horror'):
        n = int(bar * SR); x = T(n)
        dr = sum(np.sin(2 * np.pi * m2f(ch[0] - 24) * (1 + d) * x) for d in (0, .004, -.006)) / 3
        add(mus, t, dr * np.minimum(1, x / 1.0) * np.minimum(1, (bar - x) / 1.0), .16)
        if bar_i % 2 == 0:
            add(mus, t + beat * 1.5, tone(m2f(ch[1] + 24), 2.5, .003, 1.2, 'tri'), .035)
            add(mus, t + beat * 1.53, tone(m2f(ch[1] + 25), 2.5, .003, 1.2, 'tri'), .02)
    else:
        # без барабанов — тихие колокольчики
        for q in range(4):
            add(mus, t + q * beat, tone(m2f(ch[q % len(ch)] + 12), .9, .005, .5), .05)
    t += bar
    bar_i += 1

tt = T(N)
g = np.clip(tt / 1.0, 0, 1) * np.clip((D - tt) / 1.2, 0, 1) * .75

# ---------- эффекты ----------
VOICE = {'kid': 520, 'mom': 400, 'den': 360, 'gleb': 470, 'rustam': 210, 'baker': 430, 'teacher': 340}
duck = np.ones(N)
for at, kind, o in spec['events']:
    if kind == 'whoosh':
        n = int(.3 * SR); w = noise(.3, .3, True) * np.sin(np.pi * T(n) / .3); add(out, at, w, .05)
    elif kind == 'hit':
        n = int(1.2 * SR); x = T(n)
        add(out, at, np.sin(2 * np.pi * np.cumsum(60 * np.exp(-x * 3) + 35) / SR) * np.exp(-x / .5), .5)
        add(out, at, noise(.6, .25), .08)
    elif kind == 'tick':
        add(out, at, tone(1760, .3, .001, .08), .12); add(out, at + .12, tone(2349, .3, .001, .1), .1)
    elif kind == 'buzz':
        k = 0
        while k * .52 < o.get('d', 2):
            n = int(.35 * SR); x = T(n)
            w = np.sign(np.sin(2 * np.pi * 150 * x)) * np.minimum(1, x / .01) * np.minimum(1, (.35 - x) / .02)
            add(out, at + k * .52, w, .16); k += 1
    elif kind == 'ping':
        add(out, at, tone(1320, .5, .002, .18), .22); add(out, at + .07, tone(1980, .5, .002, .2), .18)
    elif kind == 'pop':
        add(out, at, sweep(900, 300, .12, .04), .3)
    elif kind == 'send':
        add(out, at, sweep(400, 2800, .25, .08), .22)
    elif kind == 'key':
        add(out, at, noise(.03, .006, True), rng.uniform(.12, .26))
    elif kind == 'can':
        add(out, at, noise(.15, .03, True), .3); add(out, at, tone(2200, .2, .001, .05), .1)
    elif kind == 'error':
        add(out, at, tone(180, .25, .005, .1, 'sq'), .2); add(out, at + .18, tone(150, .25, .005, .1, 'sq'), .18)
    elif kind == 'crash':
        add(out, at, tone(140, .5, .005, .2, 'sq'), .28); add(out, at, noise(.5, .12), .25)
        i = int(at * SR); duck[i:i + int(1.5 * SR)] = .3
    elif kind == 'creak':
        n = int(.9 * SR); x = T(n); f = 300 + 200 * np.sin(x * 7)
        add(out, at, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sign(np.sin(2 * np.pi * 35 * x)) * np.minimum(1, x / .1) * np.exp(-x / .6), .06)
    elif kind in ('slam', 'thud'):
        n = int(.5 * SR); x = T(n)
        add(out, at, (np.sin(2 * np.pi * np.cumsum(90 * np.exp(-x * 6) + 40) / SR) * .8 + noise(.5, .05) * .5) * np.exp(-x / .15), .6 if kind == 'slam' else .35)
        if kind == 'slam':
            i = int(at * SR); duck[i:i + int(.9 * SR)] = .25
    elif kind == 'bell':
        add(out, at, tone(1046, 1.2, .002, .5), .12); add(out, at, tone(1568, 1.2, .002, .4), .08)
    elif kind == 'snore':
        for k in range(2):
            n = int(.8 * SR); add(out, at + k, noise(.8, 10) * np.sin(np.pi * T(n) / .8), .05)
    elif kind == 'blips':
        for k in range(10):
            add(out, at + k * .13, tone(600 + k * 60, .08, .001, .03), .12)
    elif kind == 'success':
        for k, f in enumerate([523, 659, 784, 1046]):
            add(out, at + k * .08, tone(f, .6, .002, .25, 'tri'), .2)
    elif kind == 'rise':
        add(out, at, sweep(200, 900, 2.2, 1.2), .06)
    elif kind == 'coins':
        for k in range(8):
            add(out, at + k * .06, tone(2000 + rng.uniform(0, 1500), .25, .001, .06), .14)
        for k, f in enumerate([784, 988, 1175, 1568]):
            add(out, at + .05 + k * .09, tone(f, .8, .002, .35, 'tri'), .2)
    elif kind == 'loss':
        for k, f in enumerate([392, 330, 262]):
            add(out, at + k * .14, tone(f, .6, .005, .3, 'tri'), .18)
    elif kind == 'stamp':
        add(out, at, noise(.12, .03), .25); add(out, at, sweep(220, 90, .15, .06), .3)
    elif kind == 'swish':
        add(out, at, noise(.25, .08, True) * np.sin(np.pi * T(int(.25 * SR)) / .25), .08)
    elif kind == 'flip':
        add(out, at, noise(.18, .04, True), .18)
    elif kind == 'vo':
        with wave.open(o['file']) as wf:
            x = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        add(out, at, x, .95)
        i = int(at * SR); j = min(N, i + len(x) + int(.2 * SR))
        duck[max(0, i - int(.1 * SR)):j] = np.minimum(duck[max(0, i - int(.1 * SR)):j], .35)
    elif kind == 'rain':
        n = int(o.get('d', 5) * SR); w = rng.standard_normal(n)
        w = np.convolve(w, np.ones(8) / 8, mode='same') * np.minimum(1, T(n) / .5) * np.minimum(1, (n / SR - T(n)) / .5)
        add(out, at, w, .07)
    elif kind == 'stinger':
        n = int(1.6 * SR); x = T(n)
        w = sum(np.sin(2 * np.pi * f * x) for f in (55, 58.3, 110, 233, 466)) / 5 * np.exp(-x / .6)
        add(out, at, w + noise(1.6, .25, True) * .4, .5)
        i = int(at * SR); duck[i:i + int(1.2 * SR)] = np.minimum(duck[i:i + int(1.2 * SR)], .3)
    elif kind == 'ding':
        add(out, at, tone(1318, 1.4, .002, .6), .12); add(out, at + .02, tone(1760, 1.2, .002, .5), .06)
    elif kind in ('hum', 'drone'):
        d = o.get('d', 5); n = int(d * SR); x = T(n)
        f = 50 if kind == 'hum' else 41
        w = (np.sin(2 * np.pi * f * x) + .4 * np.sin(2 * np.pi * f * 2.01 * x)) * np.minimum(1, x / .8) * np.minimum(1, (d - x) / .8)
        add(out, at, w, .07 if kind == 'hum' else .12)
    elif kind == 'fbuzz':
        d = max(.3, o.get('d', 1)); n = int(d * SR); x = T(n)
        gate = (np.sin(2 * np.pi * 9 * x) > .2).astype(float)
        add(out, at, np.sign(np.sin(2 * np.pi * 120 * x)) * gate * .5, .05)
    elif kind == 'heart':
        d = o.get('d', 4); k = 0.0
        while k < d:
            for off, g in ((0, .5), (.18, .35)):
                n2 = int(.2 * SR); x = T(n2); add(out, at + k + off, np.sin(2 * np.pi * np.cumsum(60 * np.exp(-x * 8) + 35) / SR) * np.exp(-x / .07), g)
            k += .8
    elif kind == 'clunk':
        add(out, at, noise(.3, .06), .3); add(out, at, sweep(140, 60, .3, .1), .45)
    elif kind == 'slide':
        n = int(1.2 * SR); add(out, at, noise(1.2, 1.0) * np.sin(np.pi * T(n) / 1.2) * .5, .06)
    elif kind == 'whisper':
        n = int(1.5 * SR); x = T(n); w = noise(1.5, 3, True) * (np.sin(2 * np.pi * 3 * x) * .5 + .5) * np.sin(np.pi * x / 1.5)
        add(out, at, w, .06)
    elif kind == 'click':
        add(out, at, noise(.04, .006, True), .35); add(out, at, tone(2400, .05, .001, .01), .1)
    elif kind == 'switch':
        add(out, at, noise(.05, .008, True), .4)
    elif kind == 'knock':
        n = int(.25 * SR); x = T(n); add(out, at, (np.sin(2 * np.pi * np.cumsum(180 * np.exp(-x * 15) + 70) / SR) + noise(.25, .02) * .6) * np.exp(-x / .05), .55)
    elif kind == 'chain':
        for k in range(5): add(out, at + k * .05, tone(3000 + k * 300, .1, .001, .03), .08)
    elif kind == 'steps':
        nn = o.get('n', 4); sp = .28 if o.get('fast') else .55
        for k in range(nn): add(out, at + k * sp, noise(.12, .025) , .25 if o.get('fast') else .15)
    elif kind == 'drop':
        d = o.get('d', 5); n = int(d * SR); x = T(n); add(out, at, np.sin(2 * np.pi * np.cumsum(90 - 40 * x / d) / SR) * np.minimum(1, x / .5) * np.minimum(1, (d - x) / .5), .12)
    elif kind == 'talk':
        base = VOICE.get(o.get('who', 'kid'), 450)
        syl = int(min(14, max(3, o.get('n', 10) / 3)))
        for k in range(syl):
            f = base * rng.uniform(.85, 1.25)
            add(out, at + k * .085, tone(f, .07, .004, .03, 'tri'), .09)

mix = mus * g * duck + out
mix = np.tanh(mix * 1.1) * .9
pcm = (mix * 32767).astype(np.int16)
st = np.repeat(pcm[:, None], 2, axis=1)
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
