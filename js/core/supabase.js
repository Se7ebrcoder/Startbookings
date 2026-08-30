// core/supabase.js — inicialização do cliente Supabase + hCaptcha + flags de debug.
// As chaves públicas (URL, publishable key, sitekey) moram em core/env.js.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, HCAPTCHA_SITEKEY as SITEKEY } from './env.js';

// Debug logs informativos só quando ?debug=1 na URL ou localStorage.sb_debug="1".
export const SB_DEBUG = (function () {
  try {
    return (typeof location !== "undefined" && /[?&]debug=1\b/.test(location.search))
      || (typeof localStorage !== "undefined" && localStorage.getItem("sb_debug") === "1");
  } catch (e) { return false; }
})();
export function dbg() { if (SB_DEBUG) console.log.apply(console, arguments); }

// Captura global de erros (mantém comportamento do monólito).
window.onerror = function (msg, url, line) {
  console.error("SB error:", msg, "at", url, "line", line);
};
window.onunhandledrejection = function (event) {
  console.error("SB unhandled rejection:", event.reason);
};

// --- SUPABASE INITIALIZATION ---
// Chave PUBLISHABLE (segura para o navegador quando o RLS está ativo) — ver core/env.js.
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_PUBLISHABLE_KEY;
export let sbClient = null;
try {
  if (window.supabase) {
    sbClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: window.sessionStorage
      }
    });
  } else {
    console.error("Supabase script not loaded!");
  }
} catch (err) {
  console.error("Supabase init error:", err);
}

// --- hCAPTCHA (proteção contra bots no login/cadastro/recuperação) ---
export const HCAPTCHA_SITEKEY = SITEKEY;
export const captchaTokens = { login: null, register: null, forgot: null };
export const captchaWidgets = {};

// O script do hCaptcha chama esta função quando termina de carregar (render=explicit).
export function onHcaptchaLoad() {
  if (!window.hcaptcha) return;
  ["login", "register", "forgot"].forEach((key) => {
    const el = document.getElementById("captcha-" + key);
    if (!el || captchaWidgets[key] !== undefined) return;
    try {
      captchaWidgets[key] = window.hcaptcha.render(el, {
        sitekey: HCAPTCHA_SITEKEY,
        callback: (token) => { captchaTokens[key] = token; },
        "expired-callback": () => { captchaTokens[key] = null; },
        "error-callback": () => { captchaTokens[key] = null; }
      });
    } catch (e) {
      // Argumentos separados (sem concatenar no 1º parâmetro): evita que um valor
      // dinâmico seja interpretado como format string pelo console.
      console.error("Falha ao renderizar hCaptcha:", key, e);
    }
  });
}

// Expõe no window para o callback do script hCaptcha (?onload=onHcaptchaLoad).
window.onHcaptchaLoad = onHcaptchaLoad;

// Limpa o widget após uma tentativa (o token do hCaptcha é de uso único).
export function resetCaptcha(key) {
  captchaTokens[key] = null;
  if (window.hcaptcha && captchaWidgets[key] !== undefined) {
    try { window.hcaptcha.reset(captchaWidgets[key]); } catch (e) { }
  }
}

// Se o hCaptcha já tiver carregado antes deste módulo (corrida de carregamento),
// o onload pode ter disparado sem a função existir — então renderiza agora.
if (window.hcaptcha && window.hcaptcha.render) {
  onHcaptchaLoad();
}
