// js/auth/mfa.js — segundo fator (TOTP) via Supabase Auth.
//
// Contexto: a conta Admin tem acesso a tudo — agenda, financeiro e roteiros de
// viagem dos artistas. Protegê-la só com senha era o elo mais fraco (achado
// P-09 do parecer LGPD). Aqui ficam as duas metades do TOTP:
//
//   1. CADASTRO  (enroll)    — Configurações: mostra o QR Code, o usuário
//                              escaneia no app autenticador e confirma o código.
//   2. DESAFIO   (challenge) — no login, se a conta tem fator verificado, pede
//                              o código de 6 dígitos antes de liberar o sistema.
//
// O Supabase expressa isso por "AAL" (nível de garantia de autenticação):
//   currentLevel 'aal1' = só senha | 'aal2' = senha + segundo fator
//   Se nextLevel = 'aal2' e currentLevel = 'aal1', falta o desafio desta sessão.

import { sbClient } from '../core/supabase.js';

// --- Consulta -------------------------------------------------------------

// Esta sessão precisa passar pelo desafio do segundo fator?
export async function precisaDesafioMfa() {
  if (!sbClient) return false;
  try {
    const { data, error } = await sbClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === 'aal2' && data.currentLevel === 'aal1';
  } catch (e) { return false; }
}

// Fatores TOTP já verificados na conta.
export async function listarFatoresVerificados() {
  if (!sbClient) return [];
  try {
    const { data, error } = await sbClient.auth.mfa.listFactors();
    if (error || !data) return [];
    return (data.totp || []).filter(f => f.status === 'verified');
  } catch (e) { return []; }
}

// --- Desafio no login -----------------------------------------------------

// Abre o modal e resolve true (passou) ou false (cancelou/falhou).
export function abrirDesafioMfa() {
  return new Promise((resolve) => {
    const modal = document.getElementById('mfa-challenge-modal');
    const input = document.getElementById('mfa-challenge-code');
    const btn   = document.getElementById('mfa-challenge-verify');
    const btnX  = document.getElementById('mfa-challenge-cancel');
    const erro  = document.getElementById('mfa-challenge-error');

    if (!modal || !input || !btn) { resolve(true); return; }

    input.value = '';
    if (erro) erro.textContent = '';

    async function verificar() {
      const code = (input.value || '').replace(/\D/g, '');
      if (code.length !== 6) {
        if (erro) erro.textContent = 'Digite os 6 digitos do aplicativo.';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Verificando...';
      try {
        const fatores = await listarFatoresVerificados();
        if (fatores.length === 0) { fechar(); resolve(true); return; }
        const factorId = fatores[0].id;

        const { data: ch, error: chErr } = await sbClient.auth.mfa.challenge({ factorId });
        if (chErr) throw chErr;

        const { error: vErr } = await sbClient.auth.mfa.verify({
          factorId, challengeId: ch.id, code
        });
        if (vErr) throw vErr;

        fechar();
        resolve(true);
      } catch (e) {
        console.error('MFA: falha no desafio', e);
        if (erro) erro.textContent = 'Codigo invalido ou expirado. Tente o codigo atual do aplicativo.';
        input.value = '';
        input.focus();
      }
      btn.disabled = false;
      btn.textContent = 'Verificar';
    }

    function cancelar() { fechar(); resolve(false); }

    function fechar() {
      modal.classList.remove('show');
      btn.removeEventListener('click', verificar);
      if (btnX) btnX.removeEventListener('click', cancelar);
      input.removeEventListener('keydown', onKey);
    }

    function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); verificar(); } }

    btn.addEventListener('click', verificar);
    if (btnX) btnX.addEventListener('click', cancelar);
    input.addEventListener('keydown', onKey);

    modal.classList.add('show');
    setTimeout(() => { try { input.focus(); } catch (e) { } }, 60);
  });
}

// --- Cadastro (Configurações) ---------------------------------------------

let fatorEmCadastro = null;

// Inicia o cadastro e devolve { qr, secret } para a tela desenhar.
export async function iniciarCadastroMfa() {
  if (!sbClient) throw new Error('Sem conexao');

  // Remove fatores nao verificados presos de tentativas anteriores
  try {
    const { data } = await sbClient.auth.mfa.listFactors();
    const pendentes = ((data && data.totp) || []).filter(f => f.status !== 'verified');
    for (const f of pendentes) {
      try { await sbClient.auth.mfa.unenroll({ factorId: f.id }); } catch (e) { }
    }
  } catch (e) { }

  const { data, error } = await sbClient.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'StartBookings ' + Date.now()
  });
  if (error) throw error;

  fatorEmCadastro = data.id;
  return { qr: data.totp?.qr_code || '', secret: data.totp?.secret || '' };
}

// Confirma o cadastro com o código do aplicativo.
export async function confirmarCadastroMfa(code) {
  if (!sbClient || !fatorEmCadastro) throw new Error('Cadastro nao iniciado');
  const limpo = (code || '').replace(/\D/g, '');
  if (limpo.length !== 6) throw new Error('Codigo deve ter 6 digitos');

  const { data: ch, error: chErr } = await sbClient.auth.mfa.challenge({ factorId: fatorEmCadastro });
  if (chErr) throw chErr;

  const { error: vErr } = await sbClient.auth.mfa.verify({
    factorId: fatorEmCadastro, challengeId: ch.id, code: limpo
  });
  if (vErr) throw vErr;

  fatorEmCadastro = null;
  return true;
}

// Remove o segundo fator da conta.
export async function removerMfa(factorId) {
  if (!sbClient) throw new Error('Sem conexao');
  const { error } = await sbClient.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  return true;
}
