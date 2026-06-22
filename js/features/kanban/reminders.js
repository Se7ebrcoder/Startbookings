// js/features/kanban/reminders.js — avisos de lembretes vencidos/chegando (só admin).

import { appState } from '../../core/state.js';
import { collectDueReminders } from '../../utils/domain.js';
import { showWarningToast } from '../../ui/toast.js';

export function showDueReminders() {
  if (!appState.currentRole || !appState.currentRole.includes("(Admin)")) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const due = collectDueReminders(appState.eventCards, appState.events, hoje);
  if (due.length === 0) return;
  const linhas = due.map(d => {
    const tag = d.estado_alerta === "atrasado" ? "⚠️ ATRASADO" : "⏰ chegando ao fim";
    return `${tag}: ${d.eventName}${d.estado ? " (" + d.estado + ")" : ""}`;
  }).join("\n");
  const titulo = due.length === 1 ? "Você tem 1 a fazer:" : `Você tem ${due.length} a fazer:`;
  showWarningToast(`${titulo}\n${linhas}`);
}
