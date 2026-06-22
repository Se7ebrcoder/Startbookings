// js/features/logistics/form.js — modais de criação/edição da logística (trechos ida/volta, hospedagem, conexões).

import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatDate, daysUntil } from '../../utils/format.js';
import { saveLogistics, getLogisticsRecord } from '../../data/logistics.repo.js';
import { LEG_MODES } from '../../core/config.js';
import { showToast, showWarningToast } from '../../ui/toast.js';
import { renderLogisticsDashboard, logisticsToday } from './view.js';
import { renderEventTable } from '../events/table.js';
import { printLogistics, logisticsViewCurrent } from './dossier.js';

let logisticsCreateState = { eventKey: null };

export function initLogisticsModule() {
  const openBtn = document.getElementById("open-new-logistics-btn");
  const createModal = document.getElementById("logistics-create-modal");
  if (!createModal) return;
  const eventSelect = document.getElementById("logistics-event-select");
  const artistsBox = document.getElementById("logistics-artists-container");
  const nextBtn = document.getElementById("logistics-create-next-btn");

  const closeCreate = () => createModal.classList.remove("show");
  document.getElementById("close-logistics-create-btn").addEventListener("click", closeCreate);
  document.getElementById("cancel-logistics-create-btn").addEventListener("click", closeCreate);

  // Checkbox "Pernoite na conexão" — mostra/esconde o bloco de hotel da conexão.
  // Delegação no document (conexões são geradas dinamicamente). Antes vivia no boot.js.
  document.addEventListener("change", (e) => {
    const cb = e.target.closest && e.target.closest(".logi-conn-pernoite");
    if (!cb) return;
    const wrap = document.getElementById(cb.id.replace("-pernoite", "-hotel-wrap"));
    if (wrap) wrap.style.display = cb.checked ? "block" : "none";
  });

  if (openBtn) openBtn.addEventListener("click", () => {
    const today = logisticsToday();
    const evs = {};
    appState.logisticsEvents.forEach(e => {
      if (daysUntil(e.eventDate, today) >= 0) {
        if (!evs[e.groupId]) evs[e.groupId] = { name: e.eventName, date: e.eventDate };
      }
    });
    const keys = Object.keys(evs).sort((a, b) => new Date(evs[a].date) - new Date(evs[b].date));
    eventSelect.innerHTML = '<option value="" disabled selected>Selecione o evento</option>' +
      keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(evs[k].name)} — ${formatDate(evs[k].date)}</option>`).join("");
    artistsBox.innerHTML = "";
    createModal.classList.add("show");
  });

  eventSelect.addEventListener("change", () => {
    const key = eventSelect.value;
    const artists = appState.logisticsEvents.filter(e => e.groupId === key && e.artist).map(e => e.artist);
    artistsBox.innerHTML = artists.length === 0
      ? `<span style="color:var(--text-muted); font-size:13px;">Nenhum artista neste evento.</span>`
      : artists.map(a => `<label style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" class="logi-artist-check" name="logi-artist-${escapeHtml(a)}" value="${escapeHtml(a)}"> ${escapeHtml(a)}</label>`).join("");
  });

  nextBtn.addEventListener("click", () => {
    const key = eventSelect.value;
    const chosen = Array.from(artistsBox.querySelectorAll(".logi-artist-check:checked")).map(c => c.value);
    if (!key) { showWarningToast("Selecione o evento."); return; }
    if (chosen.length === 0) { showWarningToast("Selecione ao menos um artista."); return; }
    closeCreate();
    openLogisticsForm({ eventKey: key, artists: chosen });
  });

  const formModal = document.getElementById("logistics-form-modal");
  document.getElementById("close-logistics-form-btn").addEventListener("click", () => formModal.classList.remove("show"));

  function persistLogistics(finalize) {
    if (!logisticsFormCtx) return;
    const data = collectLogisticsData();
    const ev = appState.logisticsEvents.find(e => e.groupId === logisticsFormCtx.eventKey);
    const eventDate = ev ? ev.eventDate : null;
    const status = finalize ? 'concluida' : 'andamento';
    let groupId = logisticsFormCtx.existing ? logisticsFormCtx.existing.groupId : ("lgrp-" + Date.now());
    logisticsFormCtx.artists.forEach(artist => {
      const prev = getLogisticsRecord(logisticsFormCtx.eventKey, artist);
      const rec = {
        id: prev ? prev.id : ("log-" + Date.now() + Math.floor(Math.random() * 1000)),
        eventKey: logisticsFormCtx.eventKey, eventDate, artist,
        groupId: prev && prev.groupId ? prev.groupId : groupId,
        status, data
      };
      saveLogistics(rec);
    });
    formModal.classList.remove("show");
    renderLogisticsDashboard();
    renderEventTable();
    showToast(finalize ? "Logística finalizada!" : "Rascunho salvo.");
  }
  document.getElementById("logistics-save-draft-btn").addEventListener("click", () => persistLogistics(false));
  document.getElementById("logistics-finalize-btn").addEventListener("click", () => persistLogistics(true));

  const viewModal = document.getElementById("logistics-view-modal");
  if (viewModal) {
    const closeView = () => viewModal.classList.remove("show");
    document.getElementById("close-logistics-view-btn").addEventListener("click", closeView);
    document.getElementById("logistics-view-close-footer-btn").addEventListener("click", closeView);
    document.getElementById("logistics-export-pdf-btn").addEventListener("click", () => {
      if (logisticsViewCurrent) printLogistics(logisticsViewCurrent.eventKey, logisticsViewCurrent.artist);
    });
    // NÃO há listener de clique fora — o modal só fecha no X/Fechar.
  }
}

export function logiInput(id, label, value) {
  return `<div class="form-group"><label for="${id}">${label}</label>
    <input type="text" id="${id}" class="form-control" value="${escapeHtml(value || "")}"></div>`;
}

export function renderLegFields(prefix, modo, data) {
  const d = data || {};
  if (modo === "carro_proprio" || modo === "uber") {
    return `<p style="color:var(--text-muted); font-size:13px; margin-top:8px;">Transporte direto, não requer preenchimento de detalhes.</p>`;
  }
  if (modo === "carro") {
    return logiInput(`${prefix}-saida`, "Saída", d.saida) + logiInput(`${prefix}-chegada`, "Chegada prevista", d.chegada) +
      logiInput(`${prefix}-pontoEncontro`, "Ponto de encontro", d.pontoEncontro) +
      logiInput(`${prefix}-motoristaNome`, "Motorista (nome)", d.motoristaNome) +
      logiInput(`${prefix}-carroModelo`, "Modelo do carro", d.carroModelo) + logiInput(`${prefix}-placa`, "Placa", d.placa);
  }
  if (modo === "taxi") {
    return logiInput(`${prefix}-saida`, "Saída", d.saida) + logiInput(`${prefix}-chegada`, "Chegada prevista", d.chegada) +
      logiInput(`${prefix}-origem`, "Origem", d.origem) + logiInput(`${prefix}-destino`, "Destino", d.destino);
  }
  if (modo === "onibus") {
    const isVolta = prefix.includes("volta");
    const labelSaida = isVolta ? "Hora de volta da passagem" : "Hora de ida da passagem";
    return logiInput(`${prefix}-saida`, labelSaida, d.saida) + logiInput(`${prefix}-chegada`, "Hora de chegada da passagem", d.chegada);
  }
  const conns = (d.conexoes || []).map((c, i) => connectionHTML(prefix, i, c)).join("");
  return logiInput(`${prefix}-companhia`, "Companhia aérea", d.companhia) + logiInput(`${prefix}-voo`, "Número do voo", d.voo) +
    logiInput(`${prefix}-localizador`, "Código localizador", d.localizador) +
    logiInput(`${prefix}-partida`, "Partida", d.partida) + logiInput(`${prefix}-chegada`, "Chegada", d.chegada) +
    logiInput(`${prefix}-recepcaoNome`, "Recepção no destino (responsável)", d.recepcaoNome) +
    logiInput(`${prefix}-veiculoApoio`, "Veículo de apoio", d.veiculoApoio) +
    `<div class="form-group"><label>Conexões</label><div id="${prefix}-conexoes">${conns}</div>
      <button type="button" class="btn-secondary logi-add-conn" data-prefix="${prefix}" style="margin-top:8px;">+ Adicionar conexão</button></div>`;
}

export function connectionHTML(prefix, i, c) {
  c = c || {};
  return `<div class="logi-conn" style="border:1px dashed var(--border-color); border-radius:8px; padding:10px; margin-bottom:8px;">
    ${logiInput(`${prefix}-conn-${i}-cidade`, "Cidade da conexão", c.cidade)}
    ${logiInput(`${prefix}-conn-${i}-espera`, "Tempo de espera", c.espera)}
    <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
      <input type="checkbox" class="logi-conn-pernoite" id="${prefix}-conn-${i}-pernoite" ${c.pernoite ? "checked" : ""}> Pernoite na conexão</label>
    <div id="${prefix}-conn-${i}-hotel-wrap" style="display: ${c.pernoite ? 'block' : 'none'};">
      ${logiInput(`${prefix}-conn-${i}-hotelNome`, "Hotel da escala", c.hotelNome)}
      ${logiInput(`${prefix}-conn-${i}-hotelEndereco`, "Endereço do hotel", c.hotelEndereco)}
      ${logiInput(`${prefix}-conn-${i}-translado`, "Translado local", c.translado)}
    </div>
  </div>`;
}

export function legSectionHTML(prefix, label, leg) {
  const modo = (leg && leg.modo) || "carro";
  const opts = LEG_MODES.map(([v, t]) => `<option value="${v}" ${modo === v ? "selected" : ""}>${t}</option>`).join("");
  return `<h4 style="margin:18px 0 10px;">${label}</h4>
    <div class="form-group"><label for="${prefix}-modo">Transporte</label>
      <select id="${prefix}-modo" class="form-control logi-mode-select" data-prefix="${prefix}">${opts}</select></div>
    <div id="${prefix}-fields">${renderLegFields(prefix, modo, leg)}</div>`;
}

let logisticsFormCtx = null;

export function openLogisticsForm(ctx) {
  const modal = document.getElementById("logistics-form-modal");
  const body = document.getElementById("logistics-form-body");
  if (!modal || !body) return;

  let eventKey, artists, existing = null, data = {};
  if (ctx.existing) {
    existing = ctx.existing; eventKey = existing.eventKey;
    artists = appState.logistics.filter(r => r.groupId && r.groupId === existing.groupId).map(r => r.artist);
    if (artists.length === 0) artists = [existing.artist];
    data = existing.data || {};
  } else {
    eventKey = ctx.eventKey; artists = ctx.artists || []; data = {};
  }
  logisticsFormCtx = { eventKey, artists, existing };

  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  document.getElementById("logistics-form-title").textContent = "Logística — " + (ev ? ev.eventName : "");
  document.getElementById("logistics-form-artists").textContent = "Artistas: " + artists.join(", ");

  const h = data.hotel || {};
  const temHospedagem = data.temHospedagem !== false;
  body.innerHTML = `
    <h4 style="margin:4px 0 10px;">Hospedagem principal</h4>
    <div class="form-group" style="margin-bottom: 14px;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
        <input type="checkbox" id="log-tem-hospedagem" ${temHospedagem ? "checked" : ""}>
        Evento possui hospedagem vinculada
      </label>
    </div>
    <div id="log-hospedagem-fields" style="${temHospedagem ? 'display:block;' : 'display:none;'}">
      ${logiInput("log-hotel-nome", "Hotel / acomodação", h.nome)}
      ${logiInput("log-hotel-endereco", "Endereço", h.endereco)}
      <div class="form-row-2">${logiInput("log-hotel-checkin", "Check-in (data + hora)", h.checkin)}${logiInput("log-hotel-checkout", "Check-out (data + hora)", h.checkout)}</div>
    </div>
    ${legSectionHTML("log-ida", "Ida", data.ida)}
    ${legSectionHTML("log-volta", "Volta", data.volta)}`;

  const chkHosp = document.getElementById("log-tem-hospedagem");
  if (chkHosp) {
    chkHosp.addEventListener("change", (e) => {
      document.getElementById("log-hospedagem-fields").style.display = e.target.checked ? "block" : "none";
    });
  }

  body.querySelectorAll(".logi-mode-select").forEach(sel => sel.addEventListener("change", () => {
    const prefix = sel.getAttribute("data-prefix");
    document.getElementById(`${prefix}-fields`).innerHTML = renderLegFields(prefix, sel.value, {});
    attachAddConn(body);
  }));
  attachAddConn(body);
  modal.classList.add("show");
}

export function attachAddConn(scope) {
  scope.querySelectorAll(".logi-add-conn").forEach(btn => {
    btn.onclick = () => {
      const prefix = btn.getAttribute("data-prefix");
      const box = document.getElementById(`${prefix}-conexoes`);
      const i = box.querySelectorAll(".logi-conn").length;
      box.insertAdjacentHTML("beforeend", connectionHTML(prefix, i, {}));
    };
  });
}

export function collectLeg(prefix) {
  const modo = document.getElementById(`${prefix}-modo`).value;
  if (modo === "carro_proprio" || modo === "uber") return { modo };
  const v = (suffix) => { const el = document.getElementById(`${prefix}-${suffix}`); return el ? el.value.trim() : ""; };
  if (modo === "carro") return { modo, saida: v("saida"), chegada: v("chegada"), pontoEncontro: v("pontoEncontro"), motoristaNome: v("motoristaNome"), carroModelo: v("carroModelo"), placa: v("placa") };
  if (modo === "taxi") return { modo, saida: v("saida"), chegada: v("chegada"), origem: v("origem"), destino: v("destino") };
  if (modo === "onibus") return { modo, saida: v("saida"), chegada: v("chegada") };
  const conexoes = [];
  document.querySelectorAll(`#${prefix}-conexoes .logi-conn`).forEach((row, i) => {
    const cv = (s) => { const el = document.getElementById(`${prefix}-conn-${i}-${s}`); return el ? el.value.trim() : ""; };
    const per = document.getElementById(`${prefix}-conn-${i}-pernoite`);
    conexoes.push({ cidade: cv("cidade"), espera: cv("espera"), pernoite: per ? per.checked : false, hotelNome: cv("hotelNome"), hotelEndereco: cv("hotelEndereco"), translado: cv("translado") });
  });
  return { modo, companhia: v("companhia"), voo: v("voo"), localizador: v("localizador"), partida: v("partida"), chegada: v("chegada"), recepcaoNome: v("recepcaoNome"), veiculoApoio: v("veiculoApoio"), conexoes };
}

export function collectLogisticsData() {
  const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const temHospedagem = document.getElementById("log-tem-hospedagem") ? document.getElementById("log-tem-hospedagem").checked : true;
  return {
    temHospedagem,
    hotel: temHospedagem ? { nome: g("log-hotel-nome"), endereco: g("log-hotel-endereco"), checkin: g("log-hotel-checkin"), checkout: g("log-hotel-checkout") } : null,
    ida: collectLeg("log-ida"),
    volta: collectLeg("log-volta")
  };
}
