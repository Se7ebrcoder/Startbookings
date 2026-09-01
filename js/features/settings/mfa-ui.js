// js/features/settings/mfa-ui.js — tela de cadastro do segundo fator (TOTP).
//
// A lógica de Auth vive em js/auth/mfa.js; aqui é só a interface das
// Configurações: mostrar o QR Code, confirmar o código e permitir desativar.

import {
  listarFatoresVerificados, iniciarCadastroMfa, confirmarCadastroMfa, removerMfa
} from '../../auth/mfa.js';
import { showToast, showWarningToast } from '../../ui/toast.js';
import { showConfirmModal } from '../../ui/modal.js';

export function initMfaUI() {
  const status    = document.getElementById('mfa-status');
  const area      = document.getElementById('mfa-enroll-area');
  const btnStart  = document.getElementById('mfa-enroll-start');
  const btnOk     = document.getElementById('mfa-enroll-confirm');
  const btnCancel = document.getElementById('mfa-enroll-cancel');
  const btnRemove = document.getElementById('mfa-remove');
  const qrBox     = document.getElementById('mfa-qr');
  const secretEl  = document.getElementById('mfa-secret');
  const codeEl    = document.getElementById('mfa-enroll-code');
  const erroEl    = document.getElementById('mfa-enroll-error');

  if (!status || !btnStart) return;

  async function pintarStatus() {
    const fatores = await listarFatoresVerificados();
    const ativo = fatores.length > 0;

    status.innerHTML = ativo
      ? '<span style="color: var(--success, #30d158);">&#10003; Ativada</span> — seu login pede um código do aplicativo.'
      : '<span style="color: var(--text-muted);">Não ativada</span> — sua conta está protegida apenas pela senha.';

    btnStart.style.display  = ativo ? 'none' : '';
    if (btnRemove) btnRemove.style.display = ativo ? '' : 'none';
    if (area) area.style.display = 'none';
  }

  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStart.textContent = 'Gerando...';
    try {
      const { qr, secret } = await iniciarCadastroMfa();

      // O Supabase devolve o QR como SVG em data: URI — o CSP permite
      // (img-src 'self' data:). Usamos <img> para não injetar SVG bruto no DOM.
      if (qrBox) {
        qrBox.innerHTML = '';
        const img = document.createElement('img');
        img.src = qr;
        img.alt = 'QR Code para configurar a verificação em duas etapas';
        img.width = 180;
        img.height = 180;
        qrBox.appendChild(img);
      }
      if (secretEl) secretEl.textContent = secret;
      if (erroEl) erroEl.textContent = '';
      if (codeEl) codeEl.value = '';
      if (area) area.style.display = 'block';
      btnStart.style.display = 'none';
      // Cada clique gera um segredo NOVO e invalida o anterior. Sem este aviso,
      // quem clicasse duas vezes ficaria com o app dessincronizado sem entender.
      if (erroEl) {
        erroEl.style.color = 'var(--text-muted)';
        erroEl.textContent = 'Se você já tinha escaneado um QR antes, apague aquela entrada no aplicativo: este QR gerou um código novo.';
      }
      setTimeout(() => { try { codeEl.focus(); } catch (e) { } }, 60);
    } catch (e) {
      console.error('MFA: falha ao iniciar cadastro', e);
      showToast('Não foi possível iniciar a ativação. Tente novamente.', 'error');
    }
    btnStart.disabled = false;
    btnStart.textContent = 'Ativar verificação em duas etapas';
  });

  if (btnOk) btnOk.addEventListener('click', async () => {
    const code = (codeEl && codeEl.value || '').replace(/\D/g, '');
    if (code.length !== 6) {
      if (erroEl) { erroEl.style.color = 'var(--danger, #ff453a)'; erroEl.textContent = 'Digite os 6 dígitos do aplicativo.'; }
      return;
    }
    btnOk.disabled = true;
    btnOk.textContent = 'Ativando...';
    try {
      await confirmarCadastroMfa(code);
      showToast('Verificação em duas etapas ativada!');
      await pintarStatus();
    } catch (e) {
      console.error('MFA: falha ao confirmar', e);
      // Mostra a causa REAL. Antes qualquer erro virava "codigo invalido",
      // o que escondia problemas como QR regerado ou relogio dessincronizado.
      const bruto = (e && (e.message || e.error_description || e.msg)) || '';
      let msg;
      if (/invalid.*(totp|code)|code.*invalid/i.test(bruto)) {
        msg = 'Código não conferiu. Duas causas comuns: (1) o QR foi gerado de novo '
            + 'depois de você escanear — apague a entrada antiga no aplicativo e escaneie o QR atual; '
            + '(2) o relógio do celular está fora de sincronia — no Google Authenticator, '
            + 'menu → Configurações → Correção de horário para códigos → Sincronizar.';
      } else if (bruto) {
        msg = bruto;
      } else {
        msg = 'Não foi possível ativar. Veja o console (F12) para o detalhe.';
      }
      if (erroEl) { erroEl.style.color = 'var(--danger, #ff453a)'; erroEl.textContent = msg; }
      if (codeEl) { codeEl.value = ''; codeEl.focus(); }
    }
    btnOk.disabled = false;
    btnOk.textContent = 'Ativar 2FA';
  });

  if (btnCancel) btnCancel.addEventListener('click', () => {
    if (area) area.style.display = 'none';
    btnStart.style.display = '';
  });

  if (btnRemove) btnRemove.addEventListener('click', () => {
    showConfirmModal(
      'Desativar 2FA',
      'Desativar a verificação em duas etapas? Sua conta voltará a ser protegida apenas pela senha.',
      async () => {
        try {
          const fatores = await listarFatoresVerificados();
          for (const f of fatores) await removerMfa(f.id);
          showWarningToast('Verificação em duas etapas desativada.');
          await pintarStatus();
        } catch (e) {
          console.error('MFA: falha ao remover', e);
          showToast('Não foi possível desativar. Tente novamente.', 'error');
        }
      }
    );
  });

  pintarStatus();
}
