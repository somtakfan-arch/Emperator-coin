/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Мини-игры, привязанные к отдельным событиям.

   Никакой удачи и здесь: все параметры (скорость движения,
   расположение окна, дельта задержки) — детерминированные функции
   характеристик игрока и уже показанных сумм. Единственная
   переменная — реальная реакция/расчёт самого игрока.
   ========================================================= */

window.MiniGames = (function () {
  function clear(host) {
    host.innerHTML = '';
  }

  /* ---------- 1. "Поймай момент": движущийся маркер + окно ---------- */
  function mountTiming(host, opts, onDone) {
    clear(host);
    const period = opts.period || 1400;
    const zoneCenter = clampNum(opts.zoneCenter, 0.08, 0.92);
    const zoneWidth = clampNum(opts.zoneWidth, 0.08, 0.6);
    const timeLimit = opts.timeLimit || 6000;

    const wrap = document.createElement('div');
    wrap.className = 'mg-timing-wrap';
    wrap.innerHTML = `
      <div class="mg-timing-track">
        <div class="mg-timing-zone" style="left:${(zoneCenter - zoneWidth / 2) * 100}%; width:${zoneWidth * 100}%"></div>
        <div class="mg-timing-marker"></div>
      </div>
      <button class="btn btn-primary mg-stop-btn">Останови!</button>
      <div class="mg-timer"><span id="mg-timer-val">${(timeLimit / 1000).toFixed(1)}</span> с</div>
    `;
    host.appendChild(wrap);

    const marker = wrap.querySelector('.mg-timing-marker');
    const stopBtn = wrap.querySelector('.mg-stop-btn');
    const timerVal = wrap.querySelector('#mg-timer-val');

    const start = performance.now();
    let raf = null;
    let done = false;

    function pos(elapsed) {
      const t = (elapsed % period) / period;
      return t < 0.5 ? t * 2 : (1 - t) * 2;
    }

    function tick(now) {
      if (done) return;
      const elapsed = now - start;
      const p = pos(elapsed);
      marker.style.left = (p * 100) + '%';
      const remain = Math.max(0, timeLimit - elapsed);
      timerVal.textContent = (remain / 1000).toFixed(1);
      if (elapsed >= timeLimit) {
        finish(false, { timeout: true, position: p });
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function finish(success, meta) {
      if (done) return;
      done = true;
      if (raf) cancelAnimationFrame(raf);
      onDone(success, meta);
    }

    stopBtn.addEventListener('click', () => {
      const elapsed = performance.now() - start;
      const p = pos(elapsed);
      const success = Math.abs(p - zoneCenter) <= zoneWidth / 2;
      finish(success, { position: p });
    });

    raf = requestAnimationFrame(tick);
    return () => finish(false, { cancelled: true });
  }

  /* ---------- 2. "Быстрый счёт": арифметика по реальным цифрам события ---------- */
  function mountMath(host, opts, onDone) {
    clear(host);
    const timeLimit = opts.timeLimit || 9000;
    const answers = opts.answers; // [{label, correct}]

    const wrap = document.createElement('div');
    wrap.className = 'mg-math-wrap';
    wrap.innerHTML = `
      <div class="mg-math-question">${opts.question}</div>
      <div class="mg-math-answers"></div>
      <div class="mg-timer"><span id="mg-timer-val">${(timeLimit / 1000).toFixed(1)}</span> с</div>
    `;
    host.appendChild(wrap);

    const answersEl = wrap.querySelector('.mg-math-answers');
    const timerVal = wrap.querySelector('#mg-timer-val');
    let done = false;
    let raf = null;
    const start = performance.now();

    answers.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary mg-math-answer';
      btn.textContent = a.label;
      btn.addEventListener('click', () => finish(!!a.correct, { picked: a.label }));
      answersEl.appendChild(btn);
    });

    function finish(success, meta) {
      if (done) return;
      done = true;
      if (raf) cancelAnimationFrame(raf);
      onDone(success, meta);
    }

    function tick(now) {
      if (done) return;
      const elapsed = now - start;
      const remain = Math.max(0, timeLimit - elapsed);
      timerVal.textContent = (remain / 1000).toFixed(1);
      if (elapsed >= timeLimit) {
        finish(false, { timeout: true });
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => finish(false, { cancelled: true });
  }

  /* ---------- 3. "Реакция": среагировать точно в окно ---------- */
  function mountReaction(host, opts, onDone) {
    clear(host);
    const delay = opts.delay || 1400;
    const windowMs = opts.windowMs || 900;
    const waitLabel = opts.waitLabel || 'Жди...';
    const promptLabel = opts.promptLabel || 'ДЕЙСТВУЙ!';

    const wrap = document.createElement('div');
    wrap.className = 'mg-reaction-wrap';
    wrap.innerHTML = `<button class="btn mg-reaction-btn mg-reaction-wait">${waitLabel}</button>`;
    host.appendChild(wrap);

    const btn = wrap.querySelector('.mg-reaction-btn');
    let phase = 'wait';
    let done = false;
    let toShow = null;
    let toExpire = null;

    function finish(success, meta) {
      if (done) return;
      done = true;
      clearTimeout(toShow);
      clearTimeout(toExpire);
      onDone(success, meta);
    }

    btn.addEventListener('click', () => {
      if (phase === 'wait') {
        finish(false, { tooEarly: true });
      } else if (phase === 'active') {
        finish(true, {});
      }
    });

    toShow = setTimeout(() => {
      phase = 'active';
      btn.textContent = promptLabel;
      btn.classList.add('mg-reaction-active');
      toExpire = setTimeout(() => {
        if (phase === 'active') {
          phase = 'expired';
          finish(false, { tooLate: true });
        }
      }, windowMs);
    }, delay);

    return () => finish(false, { cancelled: true });
  }

  return {
    timing: { mount: mountTiming },
    math: { mount: mountMath },
    reaction: { mount: mountReaction },
  };
})();
