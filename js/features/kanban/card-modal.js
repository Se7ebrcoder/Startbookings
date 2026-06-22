// js/features/kanban/card-modal.js — editor do card de evento (dados, line-up,
// logística inline, checklist, lembrete).

import { appState, saveState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatCurrency } from '../../utils/format.js';
import { eventGroupKey, checklistProgress, getLogisticsCost } from '../../utils/domain.js';
import { LEG_MODES, MODE_ICONS } from '../../core/config.js';
import { getOrCreateLogistics, getLogisticsRecord, saveLogistics } from '../../data/logistics.repo.js';
import { getEventCard, saveEventCard, deleteEventCard } from '../../data/eventCards.repo.js';
import { openCardSelect } from '../../ui/dropdown.js';
import { showToast } from '../../ui/toast.js';
import { renderEventTable } from '../events/table.js';
import { renderFinanceiroView } from '../finance/view.js';
import { renderKanban } from './board.js';

let currentCardGroup = null;

export function openEventCardModal(groupId) {
  const card = getEventCard(groupId);
  if (!card) return;
  currentCardGroup = groupId;
  const shows = appState.events.filter(e => eventGroupKey(e) === groupId);
  const ev0 = shows[0] || {};
  const body = document.getElementById("event-card-body");
  if (!body) return;
  document.getElementById("event-card-title").textContent = ev0.event || "Evento";

  const clientOpts = (appState.clients || []).map(c =>
    `<option value="${escapeHtml(c.id)}" ${ev0.clientId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const contractValues = [["pendente","Pendente"],["enviado","Enviado"],["assinado","Assinado"]];
  const contractOpts = contractValues.map(([v,t]) =>
    `<option value="${v}" ${ (ev0.contractStatus||"pendente")===v ? "selected":""}>${t}</option>`).join("");
  const statusValues = [["pre","Pré"],["apos","Pós"]];

  const chevSvg = `<svg class="card-dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  const modeBtn = (artist, leg, cur) => {
    const m = LEG_MODES.find(x => x[0] === cur);
    const label = cur ? `${MODE_ICONS[cur] || ""} ${m ? m[1] : cur}` : "— modo —";
    return `<button type="button" class="card-dropdown card-logi-mode" data-artist="${escapeHtml(artist)}" data-leg="${leg}" data-value="${escapeHtml(cur || "")}">
      <span class="card-dd-text">${escapeHtml(label)}</span>${chevSvg}
    </button>`;
  };
  const valInput = (artist, leg, val) => `<span class="card-cachet-wrap"><span class="card-cachet-cur">R$</span><input type="number" inputmode="decimal" class="card-logi-input" data-artist="${escapeHtml(artist)}" data-leg="${leg}" value="${parseFloat(val) || ''}" placeholder="0,00"></span>`;

  const lineup = shows.map(s => {
    const col = (appState.tagColors && appState.tagColors[s.artist]) || "#ffcc00";
    const ini = escapeHtml((s.artist || "?").trim().charAt(0).toUpperCase() || "?");
    const cachet = parseFloat(s.amount) || 0;
    const rec = getLogisticsRecord(s.groupId || groupId || "", s.artist);
    const d = (rec && rec.data) || {};
    const logiCost = getLogisticsCost(rec);
    const totalVal = cachet + logiCost;
    const temHosp = d.temHospedagem === true;
    return `
    <div class="card-lineup-row" data-id="${escapeHtml(String(s.id))}">
      <div class="card-lineup-top">
        <span class="card-chip" style="--chip:${escapeHtml(col)}">${ini}</span>
        <span class="card-lineup-artist">${escapeHtml(s.artist || "—")}</span>
        <button type="button" class="card-dropdown card-status-btn" data-id="${escapeHtml(String(s.id))}" data-value="${(s.status || "pre")}">
          <span class="card-dd-text">${(s.status || "pre") === "apos" ? "Pós" : "Pré"}</span>${chevSvg}
        </button>
        <button class="card-remove-show" data-id="${escapeHtml(String(s.id))}" title="Remover artista" aria-label="Remover artista">✕</button>
      </div>
      <div class="card-lineup-vals">
        <label class="card-val">
          <span class="card-val-label">Cachê</span>
          <span class="card-cachet-wrap"><span class="card-cachet-cur">R$</span><input type="number" inputmode="decimal" class="card-cachet" data-id="${escapeHtml(String(s.id))}" value="${cachet}"></span>
        </label>
        <span class="card-val-op">+</span>
        <div class="card-val">
          <span class="card-val-label">Logística</span>
          <span class="card-logi-val">${formatCurrency(logiCost)}</span>
        </div>
        <span class="card-val-op">=</span>
        <div class="card-val card-val--total">
          <span class="card-val-label">Total</span>
          <span class="card-total-val">${formatCurrency(totalVal)}</span>
        </div>
      </div>
      <div class="card-logi-edit">
        <div class="card-logi-leg">
          <span class="card-logi-tag">IDA</span>
          ${modeBtn(s.artist, "ida", (d.ida && d.ida.modo) || "")}
          ${valInput(s.artist, "ida", d.ida && d.ida.valor)}
        </div>
        <div class="card-logi-leg">
          <span class="card-logi-tag">VOLTA</span>
          ${modeBtn(s.artist, "volta", (d.volta && d.volta.modo) || "")}
          ${valInput(s.artist, "volta", d.volta && d.volta.valor)}
        </div>
        <div class="card-logi-leg card-logi-leg--hosp">
          <label class="card-logi-hosp">
            <input type="checkbox" class="card-logi-hosp-toggle" data-artist="${escapeHtml(s.artist || "")}" ${temHosp ? "checked" : ""}>
            <span>🏨 Hospedagem</span>
          </label>
          ${temHosp ? valInput(s.artist, "hotel", d.hotel && d.hotel.valor) : '<span class="card-logi-hosp-off">desligada</span>'}
        </div>
      </div>
    </div>`;
  }).join("");

  const checklist = (card.checklist || []).map((it, idx) => `
    <label class="card-check-item">
      <input type="checkbox" class="card-check" data-idx="${idx}" ${it.feito ? "checked" : ""}>
      <span class="card-check-box"></span>
      <span class="card-check-text ${it.feito ? 'done' : ''}">${escapeHtml(it.texto)}</span>
      <button class="card-check-remove" data-idx="${idx}" title="Remover etapa" aria-label="Remover etapa">✕</button>
    </label>`).join("");
  const { feitos, total } = checklistProgress(card.checklist);
  const pct = total ? Math.round((feitos / total) * 100) : 0;

  const l = card.lembrete || { data: "", ativo: false };

  body.innerHTML = `
    <div class="card-section">
      <div class="card-section-label">Dados do evento</div>
      <div class="form-row">
        <label class="card-field">Data <input type="text" id="card-date" value="${escapeHtml(ev0.date || "")}" placeholder="AAAA-MM-DD"></label>
        <label class="card-field">Local <input type="text" id="card-venue" value="${escapeHtml(ev0.venue || "")}" placeholder="Local"></label>
        <label class="card-field card-field--sm">Estado <input type="text" id="card-estado" value="${escapeHtml(ev0.estado || "")}" placeholder="UF"></label>
      </div>
      <div class="form-row">
        <label class="card-field">Cliente <select id="card-client">${clientOpts}</select></label>
        <label class="card-field">Contrato <select id="card-contract">${contractOpts}</select></label>
      </div>
    </div>

    <div class="card-section">
      <div class="card-section-label">Line-up <span class="card-section-count">${shows.length}</span></div>
      <div id="card-lineup" class="card-lineup">${lineup}</div>
    </div>

    <div class="card-section">
      <div class="card-section-label">Checklist <span class="card-section-count">${feitos}/${total}</span></div>
      <div class="card-check-progress"><div class="card-check-progress-bar" style="width:${pct}%"></div></div>
      <div id="card-checklist" class="card-checklist">${checklist}</div>
      <div class="card-add-step">
        <input type="text" id="card-new-step" placeholder="Adicionar etapa...">
        <button class="btn-secondary" id="card-add-step-btn">+ Etapa</button>
      </div>
    </div>

    <div class="card-section card-reminder">
      <div class="card-section-label">Lembrete (estilo alarme)</div>
      <div class="card-reminder-row">
        <label class="card-switch">
          <input type="checkbox" id="card-reminder-active" ${l.ativo ? "checked" : ""}>
          <span class="card-switch-slider"></span>
        </label>
        <input type="date" id="card-reminder-date" value="${escapeHtml(l.data || "")}">
        <span class="card-reminder-hint">Avisa no login se a data chegar ou passar</span>
      </div>
    </div>

    <div class="card-footer">
      <button class="btn-danger" id="card-delete-btn">Excluir card</button>
      <button class="btn-primary" id="card-save-btn">Salvar alterações</button>
    </div>
  `;

  wireEventCardModal(card, shows);
  document.getElementById("event-card-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

export function closeEventCardModal() {
  document.getElementById("event-card-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
  currentCardGroup = null;
}

function wireEventCardModal(card, shows) {
  const eventDate = (shows[0] || {}).date || null;
  // Refletir alterações de logística em todo lugar (card, eventos, financeiro).
  const afterLogiChange = () => {
    openEventCardModal(card.groupId);
    renderEventTable();
    renderFinanceiroView();
  };
  // Editar o MODO de um trecho (ida/volta) — dropdown customizado (padrão do site)
  document.querySelectorAll(".card-logi-mode").forEach(btn => btn.addEventListener("click", () => {
    const artist = btn.getAttribute("data-artist");
    const leg = btn.getAttribute("data-leg");
    const opts = [{ value: "", label: "— modo —" }].concat(
      LEG_MODES.map(([v, t]) => ({ value: v, label: `${MODE_ICONS[v] || ""} ${t}` }))
    );
    openCardSelect(btn, opts, (v) => {
      const rec = getOrCreateLogistics(card.groupId, artist, eventDate);
      rec.data[leg] = rec.data[leg] || {};
      if (v) rec.data[leg].modo = v; else delete rec.data[leg].modo;
      saveLogistics(rec);
      afterLogiChange();
    });
  }));
  // Status Pré/Pós — dropdown customizado
  document.querySelectorAll(".card-status-btn").forEach(btn => btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-id");
    openCardSelect(btn, [{ value: "pre", label: "Pré" }, { value: "apos", label: "Pós" }], (v) => {
      const s = appState.events.find(e => String(e.id) === id);
      if (s) { s.status = v; saveState(); renderEventTable(); }
      openEventCardModal(card.groupId);
    });
  }));
  // Editar o VALOR de um trecho (ida/volta/hotel)
  document.querySelectorAll(".card-logi-input").forEach(inp => inp.addEventListener("change", () => {
    const artist = inp.getAttribute("data-artist");
    const leg = inp.getAttribute("data-leg");
    const rec = getOrCreateLogistics(card.groupId, artist, eventDate);
    const val = parseFloat(inp.value) || 0;
    if (leg === "hotel") { rec.data.hotel = rec.data.hotel || {}; rec.data.hotel.valor = val; }
    else { rec.data[leg] = rec.data[leg] || {}; rec.data[leg].valor = val; }
    saveLogistics(rec);
    afterLogiChange();
  }));
  // Ligar/desligar hospedagem
  document.querySelectorAll(".card-logi-hosp-toggle").forEach(chk => chk.addEventListener("change", () => {
    const artist = chk.getAttribute("data-artist");
    const rec = getOrCreateLogistics(card.groupId, artist, eventDate);
    rec.data.temHospedagem = chk.checked;
    if (chk.checked) { rec.data.hotel = rec.data.hotel || { valor: 0 }; }
    saveLogistics(rec);
    afterLogiChange();
  }));
  document.querySelectorAll(".card-check").forEach(chk => chk.addEventListener("change", () => {
    const idx = parseInt(chk.getAttribute("data-idx"));
    card.checklist[idx].feito = chk.checked;
    saveEventCard(card);
    openEventCardModal(card.groupId);
  }));
  document.querySelectorAll(".card-check-remove").forEach(b => b.addEventListener("click", () => {
    const idx = parseInt(b.getAttribute("data-idx"));
    card.checklist.splice(idx, 1);
    saveEventCard(card);
    openEventCardModal(card.groupId);
  }));
  const addStep = document.getElementById("card-add-step-btn");
  if (addStep) addStep.addEventListener("click", () => {
    const inp = document.getElementById("card-new-step");
    const txt = (inp.value || "").trim();
    if (!txt) return;
    card.checklist.push({ texto: txt, feito: false });
    saveEventCard(card);
    openEventCardModal(card.groupId);
  });
  document.querySelectorAll(".card-cachet").forEach(i => i.addEventListener("change", () => {
    const s = appState.events.find(e => String(e.id) === i.getAttribute("data-id"));
    if (s) { s.amount = parseFloat(i.value) || 0; saveState(); renderEventTable(); }
  }));
  document.querySelectorAll(".card-remove-show").forEach(b => b.addEventListener("click", () => {
    const id = b.getAttribute("data-id");
    appState.events = appState.events.filter(e => String(e.id) !== id);
    saveState(); renderEventTable();
    if (appState.events.some(e => eventGroupKey(e) === card.groupId)) openEventCardModal(card.groupId);
    else { deleteEventCard(card.groupId); closeEventCardModal(); renderKanban(); }
  }));
  document.getElementById("card-save-btn").addEventListener("click", () => {
    const date = document.getElementById("card-date").value.trim();
    const venue = document.getElementById("card-venue").value.trim();
    const estado = document.getElementById("card-estado").value.trim();
    const clientId = document.getElementById("card-client").value;
    const contract = document.getElementById("card-contract").value;
    appState.events.forEach(e => {
      if (eventGroupKey(e) === card.groupId) {
        e.date = date; e.venue = venue; e.estado = estado; e.clientId = clientId; e.contractStatus = contract;
      }
    });
    const ativo = document.getElementById("card-reminder-active").checked;
    const rdata = document.getElementById("card-reminder-date").value;
    card.lembrete = (rdata || ativo) ? { data: rdata, ativo } : null;
    saveEventCard(card);
    saveState(); renderEventTable(); renderKanban();
    showToast("Card atualizado.");
    closeEventCardModal();
  });
  document.getElementById("card-delete-btn").addEventListener("click", () => {
    deleteEventCard(card.groupId);
    closeEventCardModal(); renderKanban();
    showToast("Card removido.");
  });
}

// Wiring do botão fechar / clique no overlay do modal do card.
// (Antes vivia no DOMContentLoaded de app-v2.js; agora chamado pelo main.js.)
export function initEventCardModal() {
  const closeCardBtn = document.getElementById("close-event-card-modal");
  if (closeCardBtn) closeCardBtn.addEventListener("click", closeEventCardModal);
  const cardOverlay = document.getElementById("event-card-modal");
  if (cardOverlay) cardOverlay.addEventListener("click", (e) => { if (e.target === cardOverlay) closeEventCardModal(); });
}
