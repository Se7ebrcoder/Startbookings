// js/features/clients/modal.js — modal de cliente (criar/editar) e exclusão com validação.

import { appState } from '../../core/state.js';
import { saveClientToSupabase, deleteClientFromSupabase } from '../../data/clients.repo.js';
import { showToast, showWarningToast } from '../../ui/toast.js';
import { newId } from '../../utils/id.js';
import { showConfirmModal } from '../../ui/modal.js';
import { renderClientsView } from './view.js';
import { updateClientDropdown } from '../events/modal.js';

export function openClientModal(clientId) {
  const modal = document.getElementById("client-modal");
  if (!modal) return;
  const title = document.getElementById("client-modal-title");
  const idInput = document.getElementById("client-id-input");
  const nameInput = document.getElementById("client-name-input");
  const contactInput = document.getElementById("client-contact-input");

  if (clientId) {
    const c = appState.clients.find(cl => cl.id === clientId);
    title.textContent = "Editar Cliente";
    idInput.value = c ? c.id : "";
    nameInput.value = c ? c.name : "";
    contactInput.value = c ? (c.contact || "") : "";
  } else {
    title.textContent = "Novo Cliente";
    idInput.value = "";
    nameInput.value = "";
    contactInput.value = "";
  }
  modal.classList.add("show");
  nameInput.focus();
}

// Remove um cliente — bloqueia se houver eventos vinculados ou se for o padrão.
export function deleteClient(clientId) {
  if (clientId === 'cli-a-definir') {
    showWarningToast("O cliente 'A definir' não pode ser excluído.");
    return;
  }
  const linked = appState.events.filter(e => e.clientId === clientId).length;
  if (linked > 0) {
    showWarningToast(`Este cliente tem ${linked} evento(s) vinculado(s). Reatribua-os antes de excluir.`);
    return;
  }
  showConfirmModal("Excluir Cliente", "Tem certeza que deseja excluir este cliente?", () => {
    deleteClientFromSupabase(clientId);
    renderClientsView();
    showToast("Cliente excluído.");
  });
}

export function initClientModule() {
  const modal = document.getElementById("client-modal");
  const openBtn = document.getElementById("open-new-client-btn");
  const closeBtn = document.getElementById("close-client-modal-btn");
  const cancelBtn = document.getElementById("cancel-client-modal-btn");
  const saveBtn = document.getElementById("save-client-btn");
  const search = document.getElementById("client-search");
  if (!modal) return;

  const close = () => modal.classList.remove("show");
  if (openBtn) openBtn.addEventListener("click", () => openClientModal(null));
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  if (search) search.addEventListener("input", renderClientsView);

  if (saveBtn) saveBtn.addEventListener("click", () => {
    const id = document.getElementById("client-id-input").value;
    const name = document.getElementById("client-name-input").value.trim();
    const contact = document.getElementById("client-contact-input").value.trim();
    if (!name) { showWarningToast("Informe o nome do cliente."); return; }
    const clientId = id || newId("cli");
    saveClientToSupabase({ id: clientId, name, contact });
    close();
    renderClientsView();
    updateClientDropdown();
    showToast(id ? "Cliente atualizado." : "Cliente cadastrado.");
  });
}
