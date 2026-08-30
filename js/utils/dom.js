// utils/dom.js — helpers de HTML/DOM e cores.
import { VIBRANT_PALETTE } from '../core/config.js';
import { randomPick } from './id.js';

export function escapeHtml(text) {
  // Coerção defensiva: nunca quebra com null/undefined/número (era causa de
  // telas em branco quando um campo vinha vazio/numérico do banco).
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function parseSimpleMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// HTML de estado vazio padronizado.
export function emptyStateHtml(msg) {
  return `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

export function hexToRgba(hex, alpha) {
  let r = 255, g = 255, b = 255;
  if (hex && hex.startsWith('#')) {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getRandomColor() {
  return randomPick(VIBRANT_PALETTE);
}
