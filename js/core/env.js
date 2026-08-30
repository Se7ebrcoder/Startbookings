// core/env.js — configuração PÚBLICA do front-end. Nada aqui é segredo.
//
// Estes três valores precisam obrigatoriamente chegar ao navegador: o supabase-js
// só monta o cliente com URL + chave "publishable" (prefixo sb_publishable_, feita
// para ficar exposta) e o hCaptcha exige a sitekey no HTML do widget. Numa SPA
// estática não existe onde "esconder" isso — quem protege os dados é o RLS do banco
// (migrations/supabase_rls.sql). O que é segredo de verdade — a service_role key e
// o hCaptcha SECRET — nunca entrou e nunca deve entrar neste repositório.
//
// Para apontar o site para outro projeto/ambiente sem editar código, o deploy pode
// publicar um arquivo próprio (ex.: env.local.js, já coberto por *.local no
// .gitignore) carregado ANTES de js/main.js no index.html:
//
//   window.__SB_PUBLIC_ENV__ = {
//     supabaseUrl: "https://<projeto>.supabase.co",
//     supabaseKey: "sb_publishable_...",
//     hcaptchaSitekey: "..."
//   };
//
// Nesse caso os valores abaixo passam a ser apenas o padrão de fallback.

const injected = (typeof window !== "undefined" && window.__SB_PUBLIC_ENV__) || {};

export const SUPABASE_URL =
  injected.supabaseUrl || "https://jijjacpgbnubamawbscw.supabase.co";

// gitleaks:allow — chave publishable (anon), pública por design; não é credencial.
export const SUPABASE_PUBLISHABLE_KEY =
  injected.supabaseKey || "sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_";

// gitleaks:allow — sitekey do hCaptcha, pública por design (vai no HTML do widget).
export const HCAPTCHA_SITEKEY =
  injected.hcaptchaSitekey || "b13a8788-f1ca-45a0-bfac-9cf82c429118";
