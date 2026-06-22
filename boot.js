// boot.js — carregado cedo no <head> (script clássico, antes da primeira pintura).
// Mantém SÓ o anti-flicker do login: se já há sessão salva, marca o documento como
// "logado" antes de pintar (evita piscar a tela de login).
// Toda a "cola" que vivia aqui (troca de painéis, submit do cadastro, delegações de
// remover-artista e pernoite) foi migrada para os módulos ES (auth.js, events/modal.js,
// logistics/form.js) — ver Task 18 da modularização.
try {
  if (sessionStorage.getItem("sb_current_role")) {
    document.documentElement.classList.add("logged-in");
  }
} catch (e) { /* sessionStorage pode estar indisponível em modo restrito */ }
