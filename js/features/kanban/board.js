// js/features/kanban/board.js — quadro Kanban: drag & drop e render dos cards.

import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatDate } from '../../utils/format.js';
import { eventGroupKey, checklistProgress, reminderState } from '../../utils/domain.js';
import { getEventCard, saveEventCard } from '../../data/eventCards.repo.js';
import { openEventCardModal } from './card-modal.js';

// ----------------------------------------------------
// KANBAN DRAG AND DROP LOGIC
// ----------------------------------------------------
export function initKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;

  // Clique no card abre o editor do evento
  board.addEventListener("click", (ev) => {
    const card = ev.target.closest(".kanban-card");
    if (!card || card.classList.contains("dragging")) return;
    openEventCardModal(card.getAttribute("data-group"));
  });

  // Drag & drop entre colunas
  board.querySelectorAll(".kanban-cards-container").forEach(col => {
    col.addEventListener("dragover", e => {
      e.preventDefault();
      const after = getKanbanDragAfter(col, e.clientY);
      const dragging = board.querySelector(".kanban-card.dragging");
      if (!dragging) return;
      if (after == null) col.appendChild(dragging); else col.insertBefore(dragging, after);
    });
    col.addEventListener("drop", () => {
      const dragging = board.querySelector(".kanban-card.dragging");
      if (!dragging) return;
      const newCol = dragging.closest(".kanban-cards-container")?.getAttribute("data-status");
      const gid = dragging.getAttribute("data-group");
      const card = getEventCard(gid);
      if (card && newCol && card.coluna !== newCol) { card.coluna = newCol; saveEventCard(card); }
      updateKanbanCounts();
    });
  });

  board.addEventListener("dragstart", e => {
    const card = e.target.closest(".kanban-card"); if (card) card.classList.add("dragging");
  });
  board.addEventListener("dragend", e => {
    const card = e.target.closest(".kanban-card"); if (card) card.classList.remove("dragging");
  });

  renderKanban();
}

export function renderKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;
  const byGroup = {};
  (appState.events || []).forEach(e => {
    const gid = eventGroupKey(e);
    if (!byGroup[gid]) byGroup[gid] = { event: e.event, date: e.date, items: [] };
    byGroup[gid].items.push(e);
  });

  board.querySelectorAll(".kanban-cards-container").forEach(col => col.innerHTML = "");

  appState.eventCards.forEach(card => {
    const g = byGroup[card.groupId];
    const col = board.querySelector(`.kanban-cards-container[data-status="${card.coluna}"]`);
    if (!col) return;
    const name = g ? g.event : card.groupId;
    const date = g ? g.date : "";
    const artists = g ? [...new Set(g.items.map(i => i.artist).filter(Boolean))].join(", ") : "";
    const { feitos, total } = checklistProgress(card.checklist);
    const pct = total ? Math.round((feitos / total) * 100) : 0;
    const st = reminderState(card, new Date().toISOString().slice(0, 10));
    const bell = st === "atrasado" ? "🔴⏰" : (st === "chegando" ? "🟡⏰" : "");

    const el = document.createElement("div");
    el.className = "kanban-card";
    el.setAttribute("draggable", "true");
    el.setAttribute("data-group", card.groupId);
    el.innerHTML = `
      <div class="kanban-card-title">${escapeHtml(name)} ${bell}</div>
      <div class="kanban-card-desc">${date ? formatDate(date) : ""}${artists ? " · " + escapeHtml(artists) : ""}</div>
      <div class="kanban-progress"><div class="kanban-progress-bar" style="width:${pct}%"></div></div>
      <div class="kanban-progress-label">${feitos}/${total} etapas</div>
    `;
    col.appendChild(el);
  });
  updateKanbanCounts();
}

export function getKanbanDragAfter(container, y) {
  const els = [...container.querySelectorAll(".kanban-card:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export function updateKanbanCounts() {
  document.querySelectorAll(".kanban-cards-container").forEach(col => {
    const header = col.parentElement?.querySelector(".kanban-column-header");
    if (header) header.setAttribute("data-count", col.querySelectorAll(".kanban-card").length);
  });
}
