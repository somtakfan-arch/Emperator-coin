// Экран входа / регистрации.
import { $, toast } from "../ui.js";
import { login, register, loginGoogle, resetPassword, authError } from "../auth.js";

const HTML = (noConfig) => `
<section class="auth-wrap">
  <div class="glass auth-card">
    <div class="auth-title">
      <h1>EMPERATOR</h1>
      <p>Криптобиржа-симулятор. Живые цены — виртуальные деньги.</p>
    </div>
    ${noConfig ? `<div class="notice">Firebase ещё не подключён. Вставь свои ключи в <code>firebase-config.js</code> и обнови страницу.</div>` : ""}
    <div class="seg" role="tablist">
      <button type="button" class="active" data-mode="login" role="tab">Вход</button>
      <button type="button" data-mode="register" role="tab">Регистрация</button>
    </div>
    <form id="authForm" novalidate>
      <div class="gift" data-only="register" hidden>
        <span>🎁</span><span>На старте — <b>10 000 USDT</b> виртуальных денег</span>
      </div>
      <label class="field" data-only="register" hidden>
        <span>Ник</span>
        <input class="input" name="nick" maxlength="20" autocomplete="nickname" placeholder="Как тебя видно в рейтинге" />
      </label>
      <label class="field">
        <span>Email</span>
        <input class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@mail.com" required />
      </label>
      <label class="field">
        <span>Пароль</span>
        <input class="input" name="password" type="password" autocomplete="current-password" placeholder="Минимум 6 символов" required minlength="6" />
      </label>
      <div class="form-error" id="authError"></div>
      <button class="btn btn-primary btn-block" id="submitBtn" type="submit">Войти</button>
    </form>
    <div class="divider">или</div>
    <button class="btn btn-block" id="googleBtn" type="button">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#c9ced6" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
      Продолжить с Google
    </button>
    <div class="form-foot" data-only="login">
      <button class="link-btn" id="resetBtn" type="button">Забыл пароль?</button>
    </div>
  </div>
</section>`;

export default {
  render(el, params) {
    const noConfig = params[0] === "no-config";
    el.innerHTML = HTML(noConfig);
    const form = $("#authForm", el);
    const err = $("#authError", el);
    const submit = $("#submitBtn", el);
    let mode = "login";

    const setMode = (m) => {
      mode = m;
      el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
      el.querySelectorAll("[data-only]").forEach((n) => (n.hidden = n.dataset.only !== m));
      submit.textContent = m === "login" ? "Войти" : "Создать аккаунт";
      form.password.autocomplete = m === "login" ? "current-password" : "new-password";
      err.textContent = "";
    };
    el.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

    if (noConfig) {
      el.querySelectorAll("button, input").forEach((n) => { if (!n.closest(".seg")) n.disabled = true; });
      return;
    }

    const busy = (on) => {
      submit.disabled = on;
      $("#googleBtn", el).disabled = on;
      submit.textContent = on ? "Подождите…" : mode === "login" ? "Войти" : "Создать аккаунт";
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = "";
      const email = form.email.value.trim();
      const password = form.password.value;
      const nick = form.nick.value.trim();
      if (mode === "register" && nick.length < 2) return (err.textContent = "Ник — от 2 до 20 символов");
      if (!email) return (err.textContent = "Введи email");
      if (password.length < 6) return (err.textContent = "Пароль — минимум 6 символов");
      busy(true);
      try {
        if (mode === "login") await login(email, password);
        else await register(nick, email, password);
        toast(mode === "login" ? "С возвращением 👑" : "Аккаунт создан. На счету 10 000 USDT", "ok");
      } catch (e2) {
        err.textContent = authError(e2);
        busy(false);
      }
    };

    $("#googleBtn", el).onclick = async () => {
      err.textContent = "";
      busy(true);
      try {
        await loginGoogle();
      } catch (e2) {
        err.textContent = authError(e2);
        busy(false);
      }
    };

    $("#resetBtn", el).onclick = async () => {
      const email = form.email.value.trim();
      if (!email) return (err.textContent = "Впиши email — пришлём ссылку для сброса");
      try {
        await resetPassword(email);
        toast("Письмо для сброса пароля отправлено", "ok");
      } catch (e2) {
        err.textContent = authError(e2);
      }
    };
  },
};
