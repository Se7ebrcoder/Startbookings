// js/features/terms/gate.js — porta de aceite dos Termos e da Política.
//
// Exibido DEPOIS do login e ANTES de liberar o sistema, para quem ainda não
// aceitou a versão corrente. Vale para TODOS — inclusive contas já existentes,
// já que o aceite é registrado por versão (migração 020). Ao subir
// TERMS_VERSION, todo mundo aceita de novo.
//
// É uma porta de verdade: não tem botão de fechar, não fecha por Esc nem por
// clique fora. Quem não aceita, sai (logout).

import { sbClient } from '../../core/supabase.js';
import { TERMS_VERSION } from '../../core/config.js';

// Já aceitou a versão corrente? Em caso de falha de rede, NÃO bloqueia o
// usuário — o aceite é tentado de novo no próximo login.
export async function jaAceitouTermos() {
  if (!sbClient) return true;
  try {
    const { data, error } = await sbClient
      .from('terms_acceptance')
      .select('version')
      .eq('version', TERMS_VERSION)
      .limit(1);
    if (error) { console.error('Aceite: falha ao consultar', error); return true; }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.error('Aceite: excecao ao consultar', e);
    return true;
  }
}

// Mostra a porta e resolve true (aceitou) ou false (recusou/erro).
export function abrirPortaDeTermos() {
  return new Promise((resolve) => {
    const modal   = document.getElementById('terms-gate-modal');
    const chk     = document.getElementById('terms-gate-check');
    const btnOk   = document.getElementById('terms-gate-accept');
    const btnNo   = document.getElementById('terms-gate-decline');
    const versao  = document.getElementById('terms-gate-version');
    const erro    = document.getElementById('terms-gate-error');

    if (!modal || !chk || !btnOk || !btnNo) { resolve(true); return; }

    if (versao) versao.textContent = TERMS_VERSION;
    if (erro) erro.textContent = '';
    chk.checked = false;
    btnOk.disabled = true;

    chk.addEventListener('change', () => { btnOk.disabled = !chk.checked; });

    async function aceitar() {
      btnOk.disabled = true;
      btnOk.textContent = 'Registrando...';
      try {
        const { error } = await sbClient.rpc('registrar_aceite_termos', {
          p_version: TERMS_VERSION,
          p_user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300)
        });
        if (error) throw error;
        fechar();
        resolve(true);
      } catch (e) {
        console.error('Aceite: falha ao registrar', e);
        if (erro) erro.textContent = 'Nao foi possivel registrar seu aceite. Verifique a conexao e tente de novo.';
        btnOk.disabled = false;
        btnOk.textContent = 'Li e aceito';
      }
    }

    function recusar() { fechar(); resolve(false); }

    function fechar() {
      modal.classList.remove('show');
      btnOk.removeEventListener('click', aceitar);
      btnNo.removeEventListener('click', recusar);
    }

    btnOk.addEventListener('click', aceitar);
    btnNo.addEventListener('click', recusar);

    modal.classList.add('show');
    setTimeout(() => { try { chk.focus(); } catch (e) { } }, 60);
  });
}
