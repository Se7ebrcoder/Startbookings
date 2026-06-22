// js/features/finance/view.js — aba Financeiro: lançamento de valores de logística por artista.

import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { getLogisticsCost } from '../../utils/domain.js';
import { getLogisticsRecord, saveLogistics } from '../../data/logistics.repo.js';
import { MODE_ICONS, COST_LABELS } from '../../core/config.js';
import { showToast } from '../../ui/toast.js';
import { renderEventTable } from '../events/table.js';

export function initFinanceiro() {
  const host = document.getElementById("financeiro-list");
  if (!host) return;
  host.addEventListener("change", (ev) => {
    const input = ev.target.closest(".fin-value-input");
    if (!input) return;
    const recId = input.getAttribute("data-rec");
    const legKey = input.getAttribute("data-leg");
    const rec = appState.logistics.find(r => r.id === recId);
    if (!rec) return;
    const val = parseFloat(input.value) || 0;
    rec.data = rec.data || {};
    if (legKey === "hotel") {
      rec.data.hotel = rec.data.hotel || {};
      rec.data.hotel.valor = val;
    } else {
      rec.data[legKey] = rec.data[legKey] || {};
      rec.data[legKey].valor = val;
    }
    saveLogistics(rec);
    renderFinanceiroView();
    renderEventTable();
    showToast("Valor de logística salvo.");
  });
}

export function renderFinanceiroView() {
  const host = document.getElementById("financeiro-list");
  if (!host) return;

  const groups = {};
  appState.events.forEach(e => {
    const key = e.groupId || `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
    if (!groups[key]) groups[key] = { event: e.event, date: e.date, items: [] };
    groups[key].items.push(e);
  });

  const keys = Object.keys(groups);
  if (keys.length === 0) {
    host.innerHTML = `<div class="fin-empty">
      <div class="fin-empty-icon">💸</div>
      <p class="fin-empty-title">Nenhum evento cadastrado</p>
      <p class="fin-empty-sub">Crie um evento para começar a lançar os valores de logística.</p>
    </div>`;
    return;
  }

  let grandTotal = 0;

  const cardsHtml = keys.map(key => {
    const g = groups[key];
    let eventTotal = 0;

    const artistsHtml = g.items.map(e => {
      const rec = getLogisticsRecord(e.groupId || "", e.artist);
      const cost = getLogisticsCost(rec);
      eventTotal += cost;
      const safeArtist = escapeHtml(e.artist || "");
      const color = (appState.tagColors && appState.tagColors[e.artist]) || "#ffcc00";
      const initial = escapeHtml((e.artist || "?").trim().charAt(0).toUpperCase() || "?");

      if (!rec || !rec.data) {
        return `<div class="fin-artist fin-artist--empty">
          <div class="fin-artist-head">
            <span class="fin-chip" style="--chip:${escapeHtml(color)}">${initial}</span>
            <span class="fin-artist-name">${safeArtist}</span>
          </div>
          <span class="fin-pending">Defina a logística na aba Logística primeiro</span>
        </div>`;
      }

      const d = rec.data;
      const legRow = (legKey, leg) => {
        if (!leg || !leg.modo) return "";
        const label = COST_LABELS[leg.modo] || "Transporte";
        const icon = MODE_ICONS[leg.modo] || "•";
        const tag = legKey === "ida" ? "IDA" : "VOLTA";
        return `<label class="fin-leg">
          <span class="fin-leg-icon">${icon}</span>
          <span class="fin-leg-label"><span class="fin-leg-tag">${tag}</span>${escapeHtml(label)}</span>
          <span class="fin-input-wrap"><span class="fin-currency">R$</span>
            <input type="number" inputmode="decimal" class="fin-value-input" data-rec="${escapeHtml(rec.id)}" data-leg="${legKey}" value="${parseFloat(leg.valor) || ''}" placeholder="0,00">
          </span></label>`;
      };

      const hotelRow = (d.temHospedagem !== false && d.hotel)
        ? `<label class="fin-leg">
            <span class="fin-leg-icon">🏨</span>
            <span class="fin-leg-label"><span class="fin-leg-tag fin-leg-tag--alt">EST.</span>Hospedagem</span>
            <span class="fin-input-wrap"><span class="fin-currency">R$</span>
              <input type="number" inputmode="decimal" class="fin-value-input" data-rec="${escapeHtml(rec.id)}" data-leg="hotel" value="${parseFloat(d.hotel.valor) || ''}" placeholder="0,00">
            </span></label>`
        : "";

      return `<div class="fin-artist">
        <div class="fin-artist-head">
          <span class="fin-chip" style="--chip:${escapeHtml(color)}">${initial}</span>
          <span class="fin-artist-name">${safeArtist}</span>
          <span class="fin-artist-total ${cost > 0 ? 'has-value' : ''}">${formatCurrency(cost)}</span>
        </div>
        <div class="fin-legs">
          ${legRow("ida", d.ida)}
          ${legRow("volta", d.volta)}
          ${hotelRow}
        </div>
      </div>`;
    }).join("");

    grandTotal += eventTotal;

    return `<article class="fin-event">
      <header class="fin-event-head">
        <div class="fin-event-meta">
          <span class="fin-event-date">${g.date ? formatDate(g.date) : "—"}</span>
          <h3 class="fin-event-name">${escapeHtml(g.event || "Evento")}</h3>
          <span class="fin-event-count">${g.items.length} artista${g.items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="fin-event-total-wrap">
          <span class="fin-event-total-label">Logística do evento</span>
          <span class="fin-event-total">${formatCurrency(eventTotal)}</span>
        </div>
      </header>
      <div class="fin-event-body">${artistsHtml}</div>
    </article>`;
  }).join("");

  const summary = `<div class="fin-summary">
    <div class="fin-summary-item">
      <span class="fin-summary-label">Eventos</span>
      <span class="fin-summary-value">${keys.length}</span>
    </div>
    <div class="fin-summary-item fin-summary-item--gold">
      <span class="fin-summary-label">Total em logística</span>
      <span class="fin-summary-value">${formatCurrency(grandTotal)}</span>
    </div>
  </div>`;

  host.innerHTML = summary + `<div class="fin-grid">${cardsHtml}</div>`;
}
