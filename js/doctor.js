/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Вкладка "Доктор".
   ========================================================= */

window.DoctorUI = (function () {
  function render(keepMessage) {
    const state = window.Game.getState();
    const cost = scaleByWealth(state, 4000);
    const host = document.getElementById('doctor-stats');
    host.innerHTML = `
      <div class="reveal-item"><span>Стоимость приёма</span><b>${formatMoney(cost)}</b></div>
      <div class="reveal-item"><span>Запас "циклов жизни"</span><b>${state.doctorCharges || 0}</b></div>
      <div class="reveal-item"><span>Всего визитов</span><b>${state.doctorVisits || 0}</b></div>
      <div class="reveal-item"><span>Возраст</span><b>${state.age}</b></div>
    `;
    const btn = document.getElementById('doctor-visit-btn');
    btn.disabled = state.money < cost;
    if (!keepMessage) document.getElementById('doctor-message').textContent = '';

    const therapyCost = scaleByWealth(state, THERAPY_BASE_COST);
    const therapistHost = document.getElementById('therapist-stats');
    therapistHost.innerHTML = `
      <div class="reveal-item"><span>Стоимость сеанса</span><b>${formatMoney(therapyCost)}</b></div>
      <div class="reveal-item"><span>Уровень стресса</span><b>${state.stress || 0}/100</b></div>
    `;
    const therapistBtn = document.getElementById('therapist-visit-btn');
    therapistBtn.disabled = state.money < therapyCost;
    if (!keepMessage) document.getElementById('therapist-message').textContent = '';
  }

  function visit() {
    const state = window.Game.getState();
    const r = visitDoctor(state);
    window.Game.afterSideAction(r.ok ? r.barrier : null, '');
    render(true);
    document.getElementById('doctor-message').textContent = r.message;
  }

  function visitTherapy() {
    const state = window.Game.getState();
    const r = visitTherapist(state);
    window.Game.afterSideAction(r.ok ? r.barrier : null, '');
    render(true);
    document.getElementById('therapist-message').textContent = r.message;
  }

  document.getElementById('doctor-visit-btn').addEventListener('click', visit);
  document.getElementById('therapist-visit-btn').addEventListener('click', visitTherapy);

  return { render };
})();
