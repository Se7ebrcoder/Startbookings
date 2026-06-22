// js/features/timeline/view.js — linha do tempo cronológica dos eventos.

import { getFilteredEvents } from '../../ui/nav.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { STATUS_LABELS } from '../../core/config.js';

export function renderTimeline() {
  const container = document.getElementById("timeline-container");
  container.innerHTML = "";

  let events = getFilteredEvents();

  // Filter timeline by selected artist if applicable
  const timelineArtistSelect = document.getElementById("timeline-artist-select");
  if (timelineArtistSelect) {
    const selectedArtist = timelineArtistSelect.value;
    if (selectedArtist !== "all") {
      events = events.filter(e => e.artist === selectedArtist);
    }
  }

  // Sort events chronologically
  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (events.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px;">
        Nenhum evento registrado na carreira desse artista para exibir na linha do tempo.
      </div>
    `;
    return;
  }

  events.forEach((e, idx) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    item.style.animationDelay = `${idx * 0.1}s`;

    const dateFormatted = formatDate(e.date);

    item.innerHTML = `
      <div class="timeline-content">
        <div class="timeline-date">${dateFormatted}</div>
        <h4 class="timeline-title">${escapeHtml(e.event || "")}</h4>
        <div class="timeline-desc">
          <strong>Local:</strong> ${escapeHtml(e.venue || "")}<br>
          <strong>Faturamento:</strong> ${formatCurrency(e.amount)}<br>
          <strong>Vendedor:</strong> ${escapeHtml(e.vendedor || "")}
        </div>
        <div class="timeline-badge">${STATUS_LABELS[e.status]}</div>
      </div>
    `;

    container.appendChild(item);
  });
}

// Add event listener to timeline artist selector
const timelineArtistSelect = document.getElementById("timeline-artist-select");
if (timelineArtistSelect) {
  timelineArtistSelect.addEventListener("change", renderTimeline);
}
