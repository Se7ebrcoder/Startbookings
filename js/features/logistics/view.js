// js/features/logistics/view.js — dashboard de Logística: KPIs, prazos críticos e lista.

import { appState } from '../../core/state.js';
import { escapeHtml, emptyStateHtml } from '../../utils/dom.js';
import { formatDate, daysUntil } from '../../utils/format.js';
import { deriveLogisticsStatus } from '../../utils/domain.js';
import { getArtistLogisticsStatus, getLogisticsRecord, saveLogistics } from '../../data/logistics.repo.js';
import { LOGI_STATUS_LABELS } from '../../core/config.js';
import { showToast } from '../../ui/toast.js';
import { openLogisticsForm } from './form.js';
import { openLogisticsViewModal } from './dossier.js';

export function logisticsToday() { return new Date().toISOString().slice(0, 10); }

// Lista de (evento, artista) escalados a partir dos eventos da logística.
export function logisticsScheduledRows() {
  return appState.logisticsEvents
    .filter(e => e.artist)
    .map(e => ({ eventKey: e.groupId, eventName: e.eventName, eventDate: e.eventDate, artist: e.artist }));
}

export function renderLogisticsDashboard() {
  const kpis = document.getElementById("logistics-kpis");
  const alertBox = document.getElementById("logistics-deadline-alert");
  const list = document.getElementById("logistics-list");
  if (!kpis || !list) return;

  const rows = logisticsScheduledRows();
  let pend = 0, and = 0, conc = 0;
  rows.forEach(r => {
    const st = getArtistLogisticsStatus(r.eventKey, r.artist);
    if (st === 'pendente') pend++; else if (st === 'andamento') and++; else conc++;
  });

  kpis.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Pendentes</span><span class="kpi-value">${pend}</span><div class="kpi-meta"><span>Sem logística</span></div></div>
    <div class="kpi-card"><span class="kpi-label">Em Andamento</span><span class="kpi-value">${and}</span><div class="kpi-meta"><span>Rascunhos</span></div></div>
    <div class="kpi-card"><span class="kpi-label">Concluídas</span><span class="kpi-value">${conc}</span><div class="kpi-meta"><span>Finalizadas</span></div></div>`;

  const today = logisticsToday();
  const critical = rows.filter(r => {
    const st = getArtistLogisticsStatus(r.eventKey, r.artist);
    const dd = daysUntil(r.eventDate, today);
    return (st === 'pendente' || st === 'andamento') && dd >= 0 && dd <= 7;
  });
  if (alertBox) {
    alertBox.innerHTML = critical.length === 0 ? "" : `
      <div class="deadline-alert">
        ⚠️ <strong>${critical.length}</strong> logística(s) com prazo crítico (≤ 7 dias):
        ${escapeHtml(critical.map(c => `${c.artist} — ${c.eventName} (${formatDate(c.eventDate)})`).join("  •  "))}
      </div>`;
  }

  const groups = {};
  rows.forEach(r => {
    if (!groups[r.eventKey]) groups[r.eventKey] = { eventName: r.eventName, eventDate: r.eventDate, items: [] };
    groups[r.eventKey].items.push(r);
  });
  const keys = Object.keys(groups).sort((a, b) => new Date(groups[a].eventDate) - new Date(groups[b].eventDate));
  list.innerHTML = keys.length === 0
    ? emptyStateHtml("Nenhuma logística ainda.")
    : keys.map(k => {
      const g = groups[k];
      const itemsHtml = g.items.map(it => {
        const rec = getLogisticsRecord(it.eventKey, it.artist);
        const st = deriveLogisticsStatus(rec);
        const actions = st === 'pendente'
          ? `<button class="btn-secondary logi-fill-btn" data-key="${escapeHtml(it.eventKey)}" data-artist="${escapeHtml(it.artist)}">Preencher</button>`
          : `${st === 'concluida' ? `<button class="btn-secondary logi-view-dash-btn" data-key="${escapeHtml(it.eventKey)}" data-artist="${escapeHtml(it.artist)}">Ver / PDF</button>` : ''}
               <button class="btn-secondary logi-edit-btn" data-id="${escapeHtml(rec.id)}">Editar</button>
               <button class="action-icon-btn logi-split-btn" data-id="${escapeHtml(rec.id)}" title="Desmembrar" aria-label="Desmembrar artista">⤴</button>`;
        return `<div class="logi-row">
            <span>${escapeHtml(it.artist)}</span>
            <span class="badge badge-contract badge-contract-${st === 'concluida' ? 'assinado' : (st === 'andamento' ? 'enviado' : 'pendente')}">${LOGI_STATUS_LABELS[st]}</span>
            <span class="logi-row-actions">${actions}</span>
          </div>`;
      }).join("");
      return `<div class="event-group"><div class="event-group-header"><div class="event-group-title">
          <div class="event-group-field"><span class="event-group-field-label">Evento</span><strong>${escapeHtml(g.eventName)}</strong></div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field"><span class="event-group-field-label">Data</span><span>${formatDate(g.eventDate)}</span></div>
        </div></div><div class="event-table-container">${itemsHtml}</div></div>`;
    }).join("");

  list.querySelectorAll(".logi-fill-btn").forEach(b => b.addEventListener("click", () => {
    openLogisticsForm({ eventKey: b.getAttribute("data-key"), artists: [b.getAttribute("data-artist")] });
  }));
  list.querySelectorAll(".logi-edit-btn").forEach(b => b.addEventListener("click", () => {
    const rec = appState.logistics.find(r => r.id === b.getAttribute("data-id"));
    if (rec) openLogisticsForm({ existing: rec });
  }));
  list.querySelectorAll(".logi-split-btn").forEach(b => b.addEventListener("click", () => splitLogistics(b.getAttribute("data-id"))));
  list.querySelectorAll(".logi-view-dash-btn").forEach(b => b.addEventListener("click", () => openLogisticsViewModal(b.getAttribute("data-key"), b.getAttribute("data-artist"))));
}

// Desmembra: dá um group_id novo só àquele registro (passa a ser editado isolado).
export function splitLogistics(id) {
  const rec = appState.logistics.find(r => r.id === id);
  if (!rec) return;
  rec.groupId = "lgrp-" + Date.now() + Math.floor(Math.random() * 1000);
  saveLogistics(rec);
  renderLogisticsDashboard();
  showToast("Artista desmembrado do grupo.");
}
