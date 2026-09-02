// js/features/kanban/board.js — quadro Kanban: drag & drop e render dos cards.

import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatDate } from '../../utils/format.js';
import { eventGroupKey, checklistProgress, reminderState } from '../../utils/domain.js';
import { getEventCard, saveEventCard } from '../../data/eventCards.repo.js';
import { openEventCardModal } from './card-modal.js';

// Ordem das colunas. Serve ao arrastar (desktop) e aos botões de mover
// (celular): o drag-and-drop do HTML5 não dispara em tela de toque, então sem
// esses botões o Kanban era só leitura no telefone.
const COLUNAS = ["todo", "progress", "done"];
const COLUNA_LABEL = { todo: "A Fazer", progress: "Em Andamento", done: "Concluído" };

// ----------------------------------------------------
// KANBAN DRAG AND DROP LOGIC
// ----------------------------------------------------
export function initKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;

  // Clique no card abre o editor do evento — a não ser que tenha sido num
  // dos botões de mover (que trocam a coluna sem abrir o modal).
  board.addEventListener("click", (ev) => {
    const mover = ev.target.closest(".kanban-move-btn");
    if (mover) {
      ev.stopPropagation();
      moverCard(mover.getAttribute("data-group"), Number(mover.getAttribute("data-dir")));
      return;
    }
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

// Move o card uma coluna para trás (-1) ou para frente (+1).
function moverCard(groupId, direcao) {
  const card = getEventCard(groupId);
  if (!card) return;
  const i = COLUNAS.indexOf(card.coluna);
  const destino = COLUNAS[Math.min(COLUNAS.length - 1, Math.max(0, (i < 0 ? 0 : i) + direcao))];
  if (!destino || destino === card.coluna) return;
  card.coluna = destino;
  saveEventCard(card);
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
    const iCol = COLUNAS.indexOf(card.coluna);
    const anterior = COLUNAS[iCol - 1];
    const proxima = COLUNAS[iCol + 1];
    el.innerHTML = `
      <div class="kanban-card-title">${escapeHtml(name)} ${bell}</div>
      <div class="kanban-card-desc">${date ? formatDate(date) : ""}${artists ? " · " + escapeHtml(artists) : ""}</div>
      <div class="kanban-progress"><div class="kanban-progress-bar" style="width:${pct}%"></div></div>
      <div class="kanban-progress-label">${feitos}/${total} etapas</div>
      <div class="kanban-card-move">
        ${anterior ? `<button type="button" class="kanban-move-btn" data-group="${escapeHtml(card.groupId)}" data-dir="-1"
            title="Mover para ${COLUNA_LABEL[anterior]}" aria-label="Mover para ${COLUNA_LABEL[anterior]}">&larr; ${COLUNA_LABEL[anterior]}</button>` : '<span></span>'}
        ${proxima ? `<button type="button" class="kanban-move-btn" data-group="${escapeHtml(card.groupId)}" data-dir="1"
            title="Mover para ${COLUNA_LABEL[proxima]}" aria-label="Mover para ${COLUNA_LABEL[proxima]}">${COLUNA_LABEL[proxima]} &rarr;</button>` : '<span></span>'}
      </div>
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
