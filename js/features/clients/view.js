// js/features/clients/view.js — acordeão de clientes com histórico de produções.

import { appState } from '../../core/state.js';
import { escapeHtml, emptyStateHtml } from '../../utils/dom.js';
import { formatDate } from '../../utils/format.js';
import { getPaymentStatus } from '../../utils/domain.js';
import { CONTRACT_LABELS } from '../../core/config.js';
import { openClientModal, deleteClient } from './modal.js';

export function renderClientsView() {
  const container = document.getElementById("clients-list-container");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.clients || appState.clients.length === 0) {
    container.innerHTML = emptyStateHtml("Nenhum cliente ainda — cadastre um cliente ao criar um evento.");
    return;
  }

  const term = (document.getElementById("client-search")?.value || "").toLowerCase().trim();
  const clients = appState.clients
    .filter(c => c.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (clients.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px; border:1px solid var(--border-color); border-radius:8px;">Nenhum cliente cadastrado.</div>`;
    return;
  }

  window.collapsedClients = window.collapsedClients || new Set();

  clients.forEach(client => {
    const safeName = escapeHtml(client.name);
    const safeContact = escapeHtml(client.contact || "");
    const safeId = escapeHtml(client.id);

    const clientEvents = appState.events.filter(e => e.clientId === client.id);
    const groups = {};
    clientEvents.forEach(e => {
      const key = `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
      if (!groups[key]) groups[key] = { event: e.event, date: e.date, items: [], contract: e.contractStatus || 'pendente' };
      groups[key].items.push(e);
    });
    const groupKeys = Object.keys(groups).sort((a, b) => new Date(groups[a].date) - new Date(groups[b].date));
    const eventCount = groupKeys.length;
    const isCollapsed = window.collapsedClients.has(client.id);

    let historyHtml = "";
    if (groupKeys.length === 0) {
      historyHtml = `<div style="padding:14px 20px; color:var(--text-muted); font-size:13px;">Nenhuma produção registrada para este cliente.</div>`;
    } else {
      historyHtml = groupKeys.map(k => {
        const g = groups[k];
        const lineup = g.items.map(i => escapeHtml(i.artist || "—")).filter(Boolean).join(", ");
        const lineupLabel = g.items.length > 1 ? "Artistas:" : "Artista:";
        const paidCount = g.items.filter(i => getPaymentStatus(i.amount, i.amountReceived) === 'pago_total').length;
        const contract = g.contract;
        return `
          <div class="client-history-item">
            <div class="client-history-main">
              <strong>${escapeHtml(g.event || "—")}</strong>
              <span class="client-history-date">${formatDate(g.date)}</span>
            </div>
            <div class="client-history-lineup"><span>${lineupLabel}</span> ${lineup || "—"}</div>
            <div class="client-history-badges">
              <span class="badge badge-contract badge-contract-${contract}">Contrato: ${CONTRACT_LABELS[contract] || contract}</span>
              <span class="badge badge-payment">Pagamento: ${paidCount}/${g.items.length} pagos</span>
            </div>
          </div>`;
      }).join("");
    }

    const card = document.createElement("div");
    card.className = "event-group";
    card.innerHTML = `
      <div class="event-group-header${isCollapsed ? ' collapsed-header' : ''}" data-client="${safeId}">
        <div class="accordion-toggle${isCollapsed ? ' is-collapsed' : ''}">
          <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="event-group-title">
          <div class="event-group-field"><span class="event-group-field-label">Cliente</span><strong>${safeName}</strong></div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field"><span class="event-group-field-label">Contato</span><span>${safeContact || "—"}</span></div>
        </div>
        <div style="display:flex; align-items:center; gap:15px; margin-right:15px;">
          <span class="event-group-artist-count">${eventCount} evento${eventCount !== 1 ? 's' : ''}</span>
          <div style="display:flex; gap:10px;">
            <button class="action-icon-btn edit-client-btn" data-id="${safeId}" title="Editar Cliente" aria-label="Editar cliente ${safeName}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${(!appState.currentRole || !appState.currentRole.includes("(Admin)")) ? '' : `<button class="action-icon-btn delete-client-btn" data-id="${safeId}" title="Excluir Cliente" aria-label="Excluir cliente ${safeName}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>`}
          </div>
        </div>
      </div>
      <div class="event-table-container${isCollapsed ? ' collapsed' : ''}" data-client="${safeId}">
        ${historyHtml}
      </div>`;
    container.appendChild(card);
  });

  container.querySelectorAll(".event-group-header").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.closest(".action-icon-btn")) return;
      const id = header.getAttribute("data-client");
      if (window.collapsedClients.has(id)) window.collapsedClients.delete(id);
      else window.collapsedClients.add(id);
      renderClientsView();
    });
  });
  container.querySelectorAll(".edit-client-btn").forEach(btn => {
    btn.addEventListener("click", () => openClientModal(btn.getAttribute("data-id")));
  });
  container.querySelectorAll(".delete-client-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteClient(btn.getAttribute("data-id")));
  });
}
