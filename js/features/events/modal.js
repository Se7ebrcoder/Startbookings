// js/features/events/modal.js — modal de criar/editar evento + blocos de artista.

import { appState, saveState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { checkArtistDateConflict } from '../../utils/domain.js';
import { showToast, showWarningToast } from '../../ui/toast.js';
import { saveClientToSupabase } from '../../data/clients.repo.js';
import { ensureCardsForEvents } from '../../data/eventCards.repo.js';
import { renderKanban } from '../kanban/board.js';
import { renderEventTable } from './table.js';
import { updateDashboard } from '../dashboard/view.js';
import { renderTimeline } from '../timeline/view.js';

// 5. EVENT MODAL LOGIC
let artistBlockCounter = 0;

export function addArtistBlock() {
  artistBlockCounter++;
  const container = document.getElementById("artist-list-container");

  const block = document.createElement("div");
  block.className = "artist-block";
  block.innerHTML = `
    <div class="artist-block-header">
      <span>🎤 Artista ${artistBlockCounter}</span>
      <button type="button" class="remove-artist-btn" title="Remover">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>Artista</label>
        <select class="form-control event-artist-input" name="event-artist" required>
          <option value="" disabled selected>Selecione o artista</option>
          ${appState.artists.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Vendido Por</label>
        <select class="form-control event-seller-input" name="event-seller" required>
          <option value="" disabled selected>Selecione quem vendeu</option>
          ${appState.sellers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>Status da Negociação</label>
        <select class="form-control event-status-input" name="event-status" required>
          <option value="antes">Em negociação</option>
          <option value="durante">Confirmado</option>
          <option value="apos">Concluído</option>
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$)</label>
        <input type="number" class="form-control event-amount-input" name="event-amount" min="0" placeholder="0,00" required>
      </div>
    </div>
  `;
  container.appendChild(block);
}

export function updateClientDropdown() {
  const select = document.getElementById("event-client");
  if (!select) return;
  const prev = select.value;
  const sorted = [...appState.clients].sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>' +
    sorted.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('') +
    '<option value="__new__" style="font-weight:bold; color:var(--yellow-primary);">+ Novo cliente...</option>';
  if (prev && sorted.some(c => c.id === prev)) select.value = prev;
}

export function initEventModal() {
  const modal = document.getElementById("new-event-modal");
  const openBtn = document.getElementById("open-new-event-btn");
  const closeBtn = document.getElementById("close-event-modal-btn");
  const cancelBtn = document.getElementById("cancel-event-modal-btn");
  const form = document.getElementById("new-event-form");
  const addBlockBtn = document.getElementById("add-artist-block-btn");

  if (addBlockBtn) {
    addBlockBtn.addEventListener("click", () => {
      addArtistBlock();
    });
  }

  // Remover artista do modal (precisa sobrar pelo menos 1). Delegação no document
  // porque os blocos são gerados dinamicamente. Antes vivia no boot.js.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".remove-artist-btn");
    if (!btn) return;
    if (document.querySelectorAll(".artist-block").length > 1) {
      const block = btn.closest(".artist-block");
      if (block) block.remove();
    } else {
      showWarningToast("O evento precisa de pelo menos 1 artista.");
    }
  });

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      form.reset();
      document.getElementById("artist-list-container").innerHTML = "";
      artistBlockCounter = 0;
      addArtistBlock(); // Renderiza pelo menos 1 bloco inicial
      updateClientDropdown();
      const quick = document.getElementById("event-client-quickadd");
      if (quick) quick.style.display = "none";
      document.getElementById("event-contract-status").value = "pendente";
      modal.classList.add("show");
      document.body.classList.add("modal-open");
    });
  }

  const closeModal = () => {
    modal.classList.remove("show");
    document.body.classList.remove("modal-open");
  };

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const eventName = document.getElementById("event-name").value;
    const eventDate = document.getElementById("event-date").value;
    const eventVenue = document.getElementById("event-venue").value;
    const eventEstado = document.getElementById("event-estado").value;
    const eventClientId = document.getElementById("event-client").value;
    const eventContractStatus = document.getElementById("event-contract-status").value || "pendente";
    if (!eventClientId || eventClientId === "__new__") {
      showWarningToast("Selecione (ou crie) o cliente dono do evento!");
      return;
    }

    // Validate estado
    if (!eventEstado) {
      showWarningToast("É obrigatório informar o Estado (UF) do evento!");
      return;
    }

    const artistBlocks = document.querySelectorAll(".artist-block");
    let hasWarning = false;
    let hasBlockingConflict = false;

    const groupId = "grp-" + Date.now(); // agrupará todos esses eventos

    // Pre-check for same-day + same-state conflicts BEFORE creating
    artistBlocks.forEach(block => {
      const eventArtist = block.querySelector(".event-artist-input").value;
      if (eventArtist && eventDate && eventEstado) {
        const check = checkArtistDateConflict(appState.events, eventArtist, eventDate, eventEstado, null);
        if (check.status === "blocked") {
          showWarningToast(check.message);
          hasBlockingConflict = true;
        } else if (check.status === "warned") {
          hasWarning = true;
        }
      }
    });

    if (hasBlockingConflict) return;

    artistBlocks.forEach(block => {
      const eventArtist = block.querySelector(".event-artist-input").value;
      const eventSeller = block.querySelector(".event-seller-input").value;
      const eventStatus = block.querySelector(".event-status-input").value;
      const eventAmount = parseFloat(block.querySelector(".event-amount-input").value) || 0;

      const newEvent = {
        id: "evt-" + Date.now() + Math.floor(Math.random() * 1000),
        groupId: groupId,
        event: eventName,
        date: eventDate,
        venue: eventVenue,
        estado: eventEstado,
        artist: eventArtist,
        vendedor: eventSeller,
        status: eventStatus,
        amount: eventAmount,
        clientId: eventClientId,
        contractStatus: eventContractStatus
      };

      appState.events.push(newEvent);

      // Card do Kanban é criado/garantido a partir dos eventos (ver ensureCardsForEvents).
    });

    renderKanban();

    saveState();
    ensureCardsForEvents();
    renderEventTable();
    updateDashboard();
    renderTimeline();
    closeModal();

    setTimeout(() => {
      if (!hasWarning) {
        showToast("Show(s) cadastrado(s) com sucesso!", "success");
      }
    }, 100);
  });

  const clientSelect = document.getElementById("event-client");
  const quickBox = document.getElementById("event-client-quickadd");
  if (clientSelect) {
    clientSelect.addEventListener("change", () => {
      if (clientSelect.value === "__new__") {
        if (quickBox) quickBox.style.display = "block";
        document.getElementById("event-client-new-name").focus();
      } else if (quickBox) {
        quickBox.style.display = "none";
      }
    });
  }
  const quickSave = document.getElementById("event-client-quickadd-save");
  if (quickSave) {
    quickSave.addEventListener("click", () => {
      const name = document.getElementById("event-client-new-name").value.trim();
      const contact = document.getElementById("event-client-new-contact").value.trim();
      if (!name) { showWarningToast("Informe o nome do cliente."); return; }
      const newId = "cli-" + Date.now() + Math.floor(Math.random() * 1000);
      saveClientToSupabase({ id: newId, name, contact });
      updateClientDropdown();
      clientSelect.value = newId;
      if (quickBox) quickBox.style.display = "none";
      document.getElementById("event-client-new-name").value = "";
      document.getElementById("event-client-new-contact").value = "";
      showToast(`Cliente ${name} adicionado e vinculado.`);
    });
  }
}
