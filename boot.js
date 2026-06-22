// boot.js — carregado cedo no <head>.
// Centraliza a lógica que ANTES era inline no HTML (onclick/onsubmit/<script>),
// para podermos remover 'unsafe-inline' do script-src do CSP (endurecimento XSS).

// 1) Anti-flicker do login: se já há sessão salva, marca o documento como
//    "logado" ANTES da primeira pintura (evita piscar a tela de login).
try {
  if (sessionStorage.getItem("sb_current_role")) {
    document.documentElement.classList.add("logged-in");
  }
} catch (e) { /* sessionStorage pode estar indisponível em modo restrito */ }

document.addEventListener("DOMContentLoaded", function () {
  // 2) Troca de painéis de autenticação (Login / Cadastro / Recuperar senha).
  //    Antes eram onclick inline; agora cada link usa data-switch-panel="<id>".
  function switchAuthPanel(targetId) {
    document.querySelectorAll(".auth-panel").forEach(function (p) {
      p.style.display = "none";
      p.classList.remove("active-panel");
    });
    var el = document.getElementById(targetId);
    if (!el) return;
    el.style.display = "block";
    setTimeout(function () { el.classList.add("active-panel"); }, 10);
  }
  document.querySelectorAll("[data-switch-panel]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      switchAuthPanel(link.getAttribute("data-switch-panel"));
    });
  });

  // 3) Cadastro: antes era onsubmit="...realizarCadastro()" inline.
  var regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (typeof window.realizarCadastro === "function") window.realizarCadastro();
    });
  }
});

// 4) Delegações para HTML gerado dinamicamente (eram handlers inline no app-v2.js).
//    Registradas no document, valem para elementos criados depois.

// 4a) Remover artista do modal de evento (precisa sobrar pelo menos 1).
document.addEventListener("click", function (e) {
  var btn = e.target.closest && e.target.closest(".remove-artist-btn");
  if (!btn) return;
  if (document.querySelectorAll(".artist-block").length > 1) {
    var block = btn.closest(".artist-block");
    if (block) block.remove();
  } else if (typeof window.showWarningToast === "function") {
    window.showWarningToast("O evento precisa de pelo menos 1 artista.");
  }
});

// 4b) Checkbox "Pernoite na conexão" — mostra/esconde o bloco de hotel da conexão.
document.addEventListener("change", function (e) {
  var cb = e.target.closest && e.target.closest(".logi-conn-pernoite");
  if (!cb) return;
  var wrap = document.getElementById(cb.id.replace("-pernoite", "-hotel-wrap"));
  if (wrap) wrap.style.display = cb.checked ? "block" : "none";
});
