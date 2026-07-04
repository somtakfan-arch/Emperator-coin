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
  }

  function visit() {
    const state = window.Game.getState();
    const r = visitDoctor(state);
    window.Game.afterSideAction(r.ok ? r.barrier : null, '');
    render(true);
    document.getElementById('doctor-message').textContent = r.message;
  }

  document.getElementById('doctor-visit-btn').addEventListener('click', visit);

  return { render };
})();
