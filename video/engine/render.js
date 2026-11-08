// node render.js <ep|all> [out_dir] [--preview]
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const path = require('path'), fs = require('fs');
const args = process.argv.slice(2);
const eps = args[0] === 'all' ? [0,1,2,3,4,5,6,7,8,9,10] : args[0] === 'facts' ? [...Array(15)].map((_, i) => 101 + i) : args[0] === 'brands' ? [...Array(10)].map((_, i) => 201 + i) : args[0] === 'ideas' ? [...Array(15)].map((_, i) => 301 + i) : args[0] === 'bots' ? [401, 402, 403, 404, 405] : args[0] === 'horror' ? [501, 502, 503] : args[0] === 'foto' ? [511, 512] : args[0] === 'foto3' ? [513, 514, 515] : args[0].split(',').map(Number);
const out = path.resolve(args[1] || 'out');
const preview = args.includes('--preview');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const n of eps) {
    const p = await b.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: preview ? 1 : 1.5 });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + path.join(__dirname, 'player.html') + '?ep=' + n);
    await p.evaluate(() => READY);
    if (errs.length) { console.log('EP', n, 'ERR', errs); process.exit(1); }
    const lines = await p.evaluate(() => VOICE_LINES);
    if (lines.length && !process.env.NO_TTS) {
      fs.writeFileSync(`${out}/ep${n}_lines.json`, JSON.stringify(lines));
      const voices = process.env.PIPER_VOICES || path.join(__dirname, 'voices');
      const r = spawnSync('python3', [path.join(__dirname, 'tts.py'), `${out}/ep${n}_lines.json`, path.join(out, 'vo'), voices], { encoding: 'utf8' });
      if (r.status) { console.log(r.stderr); process.exit(1); }
      const vo = JSON.parse(r.stdout.trim().split('\n').pop());
      await p.evaluate(v => init(v), vo);
    }
    const dur = await p.evaluate(() => DUR);
    if (preview) {
      const shots = await p.evaluate(() => 0);
      const ts = []; for (let t = 1; t < dur; t += dur / 18) ts.push(t);
      for (let i = 0; i < ts.length; i++) { await p.evaluate(t => draw(t), ts[i]); await p.screenshot({ path: `${out}/ep${n}_${String(i).padStart(2, '0')}.png` }); }
      if (errs.length) console.log('EP', n, 'ERR', errs);
      console.log('preview', n, dur.toFixed(1)); await p.close(); continue;
    }
    const snd = await p.evaluate(() => SOUND);
    fs.writeFileSync(`${out}/ep${n}.json`, JSON.stringify(snd));
    const r = spawnSync('python3', [path.join(__dirname, 'audio.py'), `${out}/ep${n}.json`, `${out}/ep${n}.wav`], { stdio: 'inherit' });
    if (r.status) process.exit(1);
    const FPS = 30, N = Math.round(dur * FPS);
    const file = n > 510 ? `${out}/foto-${String(n - 510).padStart(2, '0')}.mp4` : n > 500 ? `${out}/horror-${String(n - 500).padStart(2, '0')}.mp4` : n > 400 ? `${out}/bot-${String(n - 400).padStart(2, '0')}.mp4` : n > 300 ? `${out}/ideya-${String(n - 300).padStart(2, '0')}.mp4` : n > 200 ? `${out}/brend-${String(n - 200).padStart(2, '0')}.mp4` : n > 100 ? `${out}/fakt-${String(n - 100).padStart(2, '0')}.mp4` : `${out}/seriya-${String(n).padStart(2, '0')}.mp4`;
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', `${out}/ep${n}.wav`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-maxrate', '4M', '-bufsize', '8M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      await p.evaluate(t => draw(t), i / FPS);
      const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log('EP', n, 'done', dur.toFixed(1) + 's', ((Date.now() - t0) / 1000).toFixed(0) + 's', errs.length ? errs : '');
    await p.close();
  }
  await b.close();
})();
