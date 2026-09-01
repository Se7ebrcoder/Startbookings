// utils/auth-errors.js — traduz erros técnicos (Supabase/rede) para texto amigável.
// O detalhe cru deve ir para o console pelo chamador; aqui só traduz.
export function friendlyAuthError(raw) {
  const m = (raw || "").toString().toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (m.includes("already registered") || m.includes("already exists")) return "Este e-mail já está cadastrado.";
  if (m.includes("password") && (m.includes("at least") || m.includes("short") || m.includes("characters"))) return "A senha precisa ter ao menos 8 caracteres.";
  if (m.includes("captcha")) return "Confirme o CAPTCHA e tente novamente.";
  // Cadastro por allowlist (migracao 019): o trigger em auth.users aborta o
  // signup de e-mail nao vinculado. O Supabase devolve um erro generico de
  // banco, entao traduzimos aqui para algo acionavel.
  if (m.includes("nao autorizado para cadastro") || m.includes("não autorizado para cadastro")
      || m.includes("database error saving new user")) {
    return "Este e-mail ainda nao esta liberado para cadastro. Peca ao administrador para vincular seu e-mail e tente de novo.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) return "Sem conexão com o servidor. Verifique sua internet.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um momento e tente de novo.";
  return "Algo deu errado. Tente novamente.";
}
