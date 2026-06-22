// js/features/logistics/dossier.js — dossiê/roteiro de logística (visualização + impressão PDF).

import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatDate } from '../../utils/format.js';
import { legToFields } from '../../utils/domain.js';
import { getLogisticsRecord } from '../../data/logistics.repo.js';
import { showWarningToast } from '../../ui/toast.js';

let logisticsViewCurrent = null; // { eventKey, artist }
export { logisticsViewCurrent };

export function fieldsTableHTML(pairs) {
  const rows = pairs.filter(([, v]) => v !== undefined)
    .map(([label, value]) => `<tr><td style="padding:4px 10px; color:var(--text-muted); white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:4px 10px;">${escapeHtml(value || "—")}</td></tr>`).join("");
  return `<table style="width:100%; border-collapse:collapse; font-size:13px;">${rows}</table>`;
}

export function logisticsDossierHTML(record, ev) {
  const d = (record && record.data) || {};
  let hotelHTML = "";
  if (d.temHospedagem !== false) {
    const h = d.hotel || {};
    const hotelPairs = [["Hotel / acomodação", h.nome || ""], ["Endereço", h.endereco || ""],
    ["Check-in", h.checkin || ""], ["Check-out", h.checkout || ""]];
    hotelHTML = `<h4 style="margin:10px 0 6px;">Hospedagem principal</h4>${fieldsTableHTML(hotelPairs)}`;
  } else {
    hotelHTML = `<h4 style="margin:10px 0 6px;">Hospedagem</h4><p style="color:var(--text-muted); font-size:13px; margin:0 0 10px;">Sem hospedagem vinculada.</p>`;
  }
  const evName = ev ? ev.eventName : "";
  const evDate = ev ? formatDate(ev.eventDate) : "";
  return `
    <div class="logi-dossier">
      <p style="margin:0 0 14px; color:var(--text-muted); font-size:13px;">
        <strong style="color:var(--text-main);">${escapeHtml(record.artist || "")}</strong> — ${escapeHtml(evName)} ${evDate ? "(" + evDate + ")" : ""}
      </p>
      ${hotelHTML}
      <h4 style="margin:16px 0 6px;">Ida</h4>${fieldsTableHTML(legToFields(d.ida))}
      <h4 style="margin:16px 0 6px;">Volta</h4>${fieldsTableHTML(legToFields(d.volta))}
    </div>`;
}

export function openLogisticsViewModal(eventKey, artist) {
  const modal = document.getElementById("logistics-view-modal");
  const body = document.getElementById("logistics-view-body");
  if (!modal || !body) return;
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) { showWarningToast("Logística não encontrada."); return; }
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  logisticsViewCurrent = { eventKey, artist };
  document.getElementById("logistics-view-title").textContent = "Roteiro — " + artist;
  body.innerHTML = logisticsDossierHTML(record, ev);
  modal.classList.add("show"); // NÃO adicionar listener de clique-fora: só X/Fechar fecham
}

export function printLogistics(eventKey, artist) {
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) return;
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  const area = document.getElementById("logistics-print-area");
  if (!area) return;
  area.innerHTML = `<div class="logi-print-doc">
    <h2 style="margin:0 0 4px;">Roteiro de Viagem</h2>
    ${logisticsDossierHTML(record, ev)}
  </div>`;
  window.print();
}
