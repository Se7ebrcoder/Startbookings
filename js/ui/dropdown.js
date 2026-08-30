// js/ui/dropdown.js — popovers customizados: edição inline da tabela e seletor de card.

import { appState } from '../core/state.js';
import { saveState } from '../core/state.js';
import { escapeHtml, getRandomColor } from '../utils/dom.js';
import { checkArtistDateConflict } from '../utils/domain.js';
import { showWarningToast } from './toast.js';
import { updateDropdownOptions, renderEventTable } from '../features/events/table.js';
import { updateConfigLists } from '../features/settings/view.js';
import { updateDashboard } from '../features/dashboard/view.js';
import { renderTimeline } from '../features/timeline/view.js';
import { upsertRosterEntry } from '../data/roster.repo.js';

export function openCustomDropdown(targetBtn, eventId, field) {
  // Check if targetBtn already has a popover open
  if (targetBtn.classList.contains("popover-open")) {
    const existing = document.querySelector(".custom-popover");
    if (existing) existing.remove();
    targetBtn.classList.remove("popover-open");
    return; // Close it and do not reopen
  }

  // Remove any existing popover from another button
  const existing = document.querySelector(".custom-popover");
  if (existing) {
    existing.remove();
    document.querySelectorAll(".popover-open").forEach(btn => btn.classList.remove("popover-open"));
  }

  // Mark this button as open
  targetBtn.classList.add("popover-open");

  const popover = document.createElement("div");
  popover.className = "custom-popover";
  if (field === "estado") {
    popover.style.width = "80px";
    popover.style.minWidth = "80px";
  }

  const placeholderText = field === "estado" ? "UF..." : "Pesquise ou adicione...";
  const maxLength = field === "estado" ? 'maxlength="2"' : '';

  popover.innerHTML = `
    <div class="custom-popover-search-container">
      <input type="text" class="custom-popover-search" name="popover-search" placeholder="${placeholderText}" autocomplete="off" ${maxLength}>
    </div>
    <div class="custom-popover-options"></div>
  `;

  document.body.appendChild(popover);

  const searchInput = popover.querySelector(".custom-popover-search");
  const optionsContainer = popover.querySelector(".custom-popover-options");

  let optionsList = [];
  if (field === "artist") optionsList = appState.artists;
  else if (field === "vendedor") optionsList = appState.sellers;
  else if (field === "status") {
    const customStatuses = [...new Set(appState.events.map(e => e.status))].filter(s => s && s !== "antes" && s !== "durante" && s !== "apos");
    optionsList = ["Em negociação", "Confirmado", "Concluído", ...customStatuses];
  }
  else if (field === "contract") optionsList = ["Pendente", "Enviado", "Assinado"];
  else if (field === "estado") optionsList = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

  const statusMap = {
    "Em negociação": "antes",
    "Confirmado": "durante",
    "Concluído": "apos"
  };
  const contractMap = { "Pendente": "pendente", "Enviado": "enviado", "Assinado": "assinado" };

  function renderOptions(filterText = "") {
    optionsContainer.innerHTML = "";
    const lowerFilter = filterText.toLowerCase();
    const filtered = optionsList.filter(o => {
      if (field === "estado") return o.toLowerCase().startsWith(lowerFilter);
      return o.toLowerCase().includes(lowerFilter);
    });
    let exactMatch = false;



    filtered.forEach(opt => {
      if (opt.toLowerCase() === lowerFilter) exactMatch = true;
      const optDiv = document.createElement("div");
      optDiv.className = "custom-option-item";

      if (field === "status") {
        const val = statusMap[opt] || opt;
        let color = "#4a4a52";
        if (val === "antes") color = "#ff453a"; // Red
        else if (val === "durante") color = "#ff9f0a"; // Orange
        else if (val === "apos") color = "#30d158"; // Green
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: ${color}; border-color: ${color}; pointer-events: none;">${escapeHtml(opt)}</span>`;
      } else if (field === "contract") {
        const val = contractMap[opt] || opt;
        let color = "#4a4a52";
        if (val === "pendente") color = "#ff453a"; // Red
        else if (val === "enviado") color = "#ff9f0a"; // Orange
        else if (val === "assinado") color = "#30d158"; // Green
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: ${color}; border-color: ${color}; pointer-events: none;">${escapeHtml(opt)}</span>`;
      } else if (field === "estado") {
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: transparent; border: 1px solid var(--yellow-primary); color: var(--yellow-primary); pointer-events: none;">${escapeHtml(opt)}</span>`;
      } else {
        const optColor = appState.tagColors[opt] || "#4a4a52";
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: ${optColor}; border-color: ${optColor};">${escapeHtml(opt)}</span>`;
      }

      optDiv.addEventListener("click", () => {
        let finalOpt = opt;
        if (field === "status") finalOpt = statusMap[opt] || opt;
        else if (field === "contract") finalOpt = contractMap[opt] || opt;
        applyDropdownSelection(eventId, field, finalOpt);
        popover.remove();
        targetBtn.classList.remove("popover-open");
      });
      optionsContainer.appendChild(optDiv);
    });

    if (field !== "contract" && field !== "estado" && filterText.trim() !== "" && !exactMatch) {
      const createDiv = document.createElement("div");
      createDiv.className = "custom-option-item custom-option-create";
      createDiv.textContent = `Criar "${filterText.trim()}"`;
      createDiv.addEventListener("click", () => {
        const newOpt = filterText.trim();
        if (field === "artist") appState.artists.push(newOpt);
        else if (field === "vendedor") appState.sellers.push(newOpt);

        if (field !== "status") {
          appState.tagColors[newOpt] = getRandomColor();
          // persiste elenco/equipe no banco (antes só localStorage)
          if (field === "artist") upsertRosterEntry(newOpt, 'artist', appState.tagColors[newOpt]);
          else if (field === "vendedor") upsertRosterEntry(newOpt, 'seller', appState.tagColors[newOpt]);
          saveState();
        }

        // Atualiza todas as listas e seletores nativos globalmente
        updateDropdownOptions();
        updateConfigLists();

        let finalOpt = newOpt;
        if (field === "status") finalOpt = statusMap[newOpt] || newOpt;

        applyDropdownSelection(eventId, field, finalOpt);
        popover.remove();
        targetBtn.classList.remove("popover-open");
      });
      optionsContainer.appendChild(createDiv);
    }
  }

  renderOptions();

  // Position logic
  const rect = targetBtn.getBoundingClientRect();
  popover.style.top = (rect.bottom + window.scrollY + 4) + "px";
  popover.style.left = (rect.left + window.scrollX) + "px";

  // Prevent input from closing popover on click
  popover.addEventListener("click", e => e.stopPropagation());

  searchInput.focus();
  searchInput.addEventListener("input", (e) => {
    let val = e.target.value;
    if (field === "estado") {
      val = val.toUpperCase();
      e.target.value = val;
      renderOptions(val);
      if (val.length === 2 && optionsList.includes(val)) {
        applyDropdownSelection(eventId, field, val);
        popover.remove();
        targetBtn.classList.remove("popover-open");
      }
    } else {
      renderOptions(val);
    }
  });

  // Close on outside click
  setTimeout(() => {
    const outsideClickListener = (e) => {
      if (!popover.contains(e.target) && e.target !== targetBtn) {
        popover.remove();
        targetBtn.classList.remove("popover-open");
        document.removeEventListener("click", outsideClickListener);
      }
    };
    document.addEventListener("click", outsideClickListener);
  }, 10);
}

export function applyDropdownSelection(eventId, field, newValue) {
  const eventObj = appState.events.find(ev => ev.id === eventId);
  if (eventObj) {
    if (field === "contract" || field === "estado") {
      // Aplica a todos os artistas do mesmo grupo.
      const key = `${eventObj.event}|${eventObj.date}|${eventObj.venue}|${eventObj.estado || ''}`;

      if (field === "estado") {
        let blocked = false;
        const groupItems = appState.events.filter(ev => `${ev.event}|${ev.date}|${ev.venue}|${ev.estado || ''}` === key);
        groupItems.forEach(item => {
          if (item.artist && eventObj.date && newValue) {
            const check = checkArtistDateConflict(appState.events, item.artist, eventObj.date, newValue, item.id);
            if (check.status === "blocked") {
              showWarningToast(check.message);
              blocked = true;
            } else if (check.status === "warned") {
              showWarningToast(check.message);
            }
          }
        });
        if (blocked) return;
      }

      appState.events.forEach(ev => {
        if (`${ev.event}|${ev.date}|${ev.venue}|${ev.estado || ''}` === key) ev[field] = newValue;
      });
    } else {
      eventObj[field] = newValue;
    }
    saveState();

    if (field === "artist") {
      checkArtistDateConflict(appState.events, newValue, eventObj.date, eventId);
    }
    updateDashboard();
    renderTimeline();
    renderEventTable();
  }
}

// Dropdown customizado do card (mesmo visual .custom-popover do resto do site).
// options: [{value, label}]. onPick(value) é chamado ao escolher.
export function openCardSelect(btn, options, onPick) {
  const existing = document.querySelector(".card-select-pop");
  const wasOpen = btn.classList.contains("cs-open");
  if (existing) existing.remove();
  document.querySelectorAll(".card-dropdown.cs-open").forEach(b => b.classList.remove("cs-open"));
  if (wasOpen) return;
  btn.classList.add("cs-open");

  const pop = document.createElement("div");
  pop.className = "custom-popover card-select-pop";
  pop.innerHTML = `<div class="custom-popover-options">` +
    options.map(o => `<div class="custom-option-item" data-val="${escapeHtml(o.value)}">${o.label}</div>`).join("") +
    `</div>`;
  document.body.appendChild(pop);

  const rect = btn.getBoundingClientRect();
  pop.style.width = "auto";
  pop.style.minWidth = rect.width + "px";
  pop.style.top = (rect.bottom + window.scrollY + 4) + "px";
  pop.style.left = (rect.left + window.scrollX) + "px";

  pop.addEventListener("click", e => e.stopPropagation());
  pop.querySelectorAll(".custom-option-item").forEach(it => it.addEventListener("click", () => {
    const v = it.getAttribute("data-val");
    pop.remove();
    btn.classList.remove("cs-open");
    onPick(v);
  }));

  setTimeout(() => {
    const close = (e) => {
      if (!pop.contains(e.target) && !btn.contains(e.target) && e.target !== btn) {
        pop.remove();
        btn.classList.remove("cs-open");
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close);
  }, 10);
}
