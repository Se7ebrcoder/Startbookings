// js/features/events/table.js — tabela de eventos (render agrupado + edição inline),
// filtros, ordenação, exclusão e duplicação de linha.

import { appState, saveState, currentSortColumn, currentSortOrder, setSortColumn, setSortOrder, setActiveEventGroup } from '../../core/state.js';
import { escapeHtml, emptyStateHtml, hexToRgba, getRandomColor } from '../../utils/dom.js';
import { formatCurrency, formatDate, normalizeDate } from '../../utils/format.js';
import { getLogisticsCost, checkArtistDateConflict } from '../../utils/domain.js';
import { STATUS_LABELS, CONTRACT_LABELS, LOGI_STATUS_LABELS } from '../../core/config.js';
import { sbClient } from '../../core/supabase.js';
import { getFilteredEvents } from '../../ui/nav.js';
import { openCustomDropdown } from '../../ui/dropdown.js';
import { showConfirmModal, showPromptModal } from '../../ui/modal.js';
import { showToast, showWarningToast } from '../../ui/toast.js';
import { getClientName } from '../../data/clients.repo.js';
import { getLogisticsRecord, getArtistLogisticsStatus } from '../../data/logistics.repo.js';
import { deleteEventCard } from '../../data/eventCards.repo.js';
import { updateDashboard } from '../dashboard/view.js';
import { renderTimeline } from '../timeline/view.js';
import { openLogisticsViewModal } from '../logistics/dossier.js';
import { updateConfigLists } from '../settings/view.js';

export function initTableFilters() {
  const searchInput = document.getElementById("table-search");
  const artistSelect = document.getElementById("filter-artist");
  const sellerSelect = document.getElementById("filter-seller");
  const statusSelect = document.getElementById("filter-status");
  // Search filter
  searchInput.addEventListener("input", renderEventTable);

  // Status filter
  statusSelect.addEventListener("change", renderEventTable);

  // Artist filter
  artistSelect.addEventListener("change", (e) => {
    if (e.target.value === "create_new") {
      showPromptModal("Novo Artista", "Digite o nome do novo Artista:", "", (name) => {
        if (name && name.trim()) {
          const newName = name.trim();
          if (!appState.artists.includes(newName)) {
            appState.artists.push(newName);
            appState.tagColors[newName] = getRandomColor();
            saveState();
            updateDropdownOptions();
            updateConfigLists();
            artistSelect.value = newName;
            showToast(`Artista ${newName} criado!`);
          } else {
            showToast("Artista já cadastrado.", "error");
            artistSelect.value = "all";
          }
        } else {
          artistSelect.value = "all";
        }
        renderEventTable();
      });
    } else {
      renderEventTable();
    }
  });

  if (sellerSelect) {
    sellerSelect.addEventListener("change", (e) => {
      if (e.target.value === "create_new") {
        showPromptModal("Novo Vendedor", "Digite o nome do novo Vendedor:", "", (name) => {
          if (name && name.trim()) {
            const newName = name.trim();
            if (!appState.sellers.includes(newName)) {
              appState.sellers.push(newName);
              appState.tagColors[newName] = getRandomColor();
              saveState();
              updateDropdownOptions();
              updateConfigLists();
              sellerSelect.value = newName;
              showToast(`Vendedor ${newName} criado!`);
            } else {
              showToast("Vendedor já cadastrado.", "error");
              sellerSelect.value = "all";
            }
          } else {
            sellerSelect.value = "all";
          }
          renderEventTable();
        });
      } else {
        renderEventTable();
      }
    });
  }

  // Initialize artist dropdowns in filters and modals
  updateDropdownOptions();
}

export function updateDropdownOptions() {
  const filterArtist = document.getElementById("filter-artist");
  const timelineArtist = document.getElementById("timeline-artist-select");

  // Clear and populate filters
  const artistFilterSelect = document.getElementById("filter-artist");
  if (artistFilterSelect) {
    const prevVal = artistFilterSelect.value;
    artistFilterSelect.innerHTML = `<option value="all">Todos os Artistas</option>` +
      appState.artists.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('') +
      `<option value="create_new" style="font-weight:bold; color:var(--yellow-primary);">+ Criar Novo Artista...</option>`;
    if (Array.from(artistFilterSelect.options).some(o => o.value === prevVal)) artistFilterSelect.value = prevVal;
  }

  const sellerFilterSelect = document.getElementById("filter-seller");
  if (sellerFilterSelect) {
    const prevVal = sellerFilterSelect.value;
    sellerFilterSelect.innerHTML = `<option value="all">Toda a Equipe</option>` +
      appState.sellers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') +
      `<option value="create_new" style="font-weight:bold; color:var(--yellow-primary);">+ Criar Novo Vendedor...</option>`;
    if (Array.from(sellerFilterSelect.options).some(o => o.value === prevVal)) sellerFilterSelect.value = prevVal;
  }

  if (timelineArtist) {
    timelineArtist.innerHTML = '<option value="all">Todos os Artistas</option>';
    appState.artists.forEach(artist => {
      const optTimeline = document.createElement("option");
      optTimeline.value = artist;
      optTimeline.textContent = artist;
      timelineArtist.appendChild(optTimeline);
    });
  }

  // Atualiza selects dinâmicos do modal
  document.querySelectorAll(".event-artist-input").forEach(select => {
    const prevVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione o artista</option>' +
      appState.artists.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    if (prevVal && appState.artists.includes(prevVal)) select.value = prevVal;
  });

  document.querySelectorAll(".event-seller-input").forEach(select => {
    const prevVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione quem vendeu</option>' +
      appState.sellers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if (prevVal && appState.sellers.includes(prevVal)) select.value = prevVal;
  });
}

export function initTableSorting() {
  // The table headers are re-created on every renderEventTable(), so we use
  // event delegation on the persistent container instead of binding to the
  // (not-yet-existing) headers once at startup.
  const container = document.getElementById("events-list-container");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const header = e.target.closest("th.sortable");
    if (!header || !container.contains(header)) return;

    const column = header.getAttribute("data-sort");
    if (!column) return;

    if (currentSortColumn === column) {
      setSortOrder(currentSortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }

    renderEventTable();
  });
}

export function updateGroupField(items, field, value) {
  items.forEach(item => {
    const obj = appState.events.find(ev => ev.id === item.id);
    if (obj) obj[field] = value;
  });
  saveState();

  if (items.length > 0) {
    const first = items[0];
    setActiveEventGroup(`${first.event}|${first.date}|${first.venue}|${first.estado || ''}`);
  }

  renderEventTable();
  updateDashboard();
  renderTimeline();
}

export function renderEventTable() {
  const container = document.getElementById("events-list-container");
  if (!container) return;

  container.innerHTML = "";

  // Apply Search
  const term = (document.getElementById("table-search")?.value || "").toLowerCase().trim();
  const artist = document.getElementById("filter-artist")?.value || "all";
  const seller = document.getElementById("filter-seller")?.value || "all";
  const status = document.getElementById("filter-status")?.value || "all";

  let events = getFilteredEvents();

  events = events.filter(e => {
    const matchTerm = (e.event || "").toLowerCase().includes(term) || (e.venue || "").toLowerCase().includes(term);
    const matchArtist = artist === "all" || e.artist === artist;
    const matchSeller = seller === "all" || e.vendedor === seller;
    const matchStatus = status === "all" || e.status === status;
    return matchTerm && matchArtist && matchSeller && matchStatus;
  });

  // Sort Events
  events.sort((a, b) => {
    let valA = a[currentSortColumn];
    let valB = b[currentSortColumn];

    if (currentSortColumn === "amount") {
      valA = parseFloat(valA);
      valB = parseFloat(valB);
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return currentSortOrder === "asc" ? -1 : 1;
    if (valA > valB) return currentSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const isArtist = appState.currentRole ? appState.currentRole.includes("(Artista)") : false;

  if (events.length === 0) {
    const filtering = term || artist !== "all" || seller !== "all" || status !== "all";
    container.innerHTML = emptyStateHtml(filtering
      ? "Nenhum resultado para os filtros aplicados."
      : "Nenhum evento ainda — clique em + Novo Evento para começar.");
    return;
  }

  // GROUP EVENTS
  const groups = {};
  events.forEach(e => {
    const key = `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
    if (!groups[key]) {
      groups[key] = {
        event: e.event,
        date: e.date,
        venue: e.venue,
        estado: e.estado || '',
        items: [],
        key: key
      };
    }
    groups[key].items.push(e);
  });

  let groupKeys = Object.keys(groups);

  // Sort groups chronologically by date
  groupKeys.sort((a, b) => {
    const dateA = new Date(groups[a].date);
    const dateB = new Date(groups[b].date);
    return dateA - dateB;
  });

  window.collapsedGroups = window.collapsedGroups || new Set();

  // Helper to render the sortable arrow indicator inside a header
  const sortArrow = (col) => currentSortColumn === col
    ? (currentSortOrder === "asc" ? " &#9652;" : " &#9662;")
    : "";

  groupKeys.forEach(key => {
    const g = groups[key];
    const isCollapsed = window.collapsedGroups.has(key);
    const containerClass = isCollapsed ? "event-table-container collapsed" : "event-table-container";

    const formattedDate = formatDate(g.date);

    // Escaped versions for safe HTML insertion (anti-XSS)
    const safeKey = escapeHtml(key);
    const safeEvent = escapeHtml(g.event || "");
    const safeVenue = escapeHtml(g.venue || "");
    const safeEstado = escapeHtml(g.estado || "");
    const groupClientId = g.items[0] ? (g.items[0].clientId || "cli-a-definir") : "cli-a-definir";
    const groupContract = g.items[0] ? (g.items[0].contractStatus || "pendente") : "pendente";
    const safeClientName = escapeHtml(getClientName(groupClientId));

    const groupDiv = document.createElement("div");
    groupDiv.className = "event-group";

    const artistCount = g.items.length;
    const collapsedHeaderClass = isCollapsed ? " collapsed-header" : "";
    const toggleClass = isCollapsed ? "accordion-toggle is-collapsed" : "accordion-toggle";

    // Create the HTML structure for the group
    groupDiv.innerHTML = `
      <div class="event-group-header${collapsedHeaderClass}" data-key="${safeKey}">
        <div class="${toggleClass}">
          <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="event-group-title">
          <div class="event-group-field">
            <span class="event-group-field-label">Evento</span>
            <input type="text" class="hidden-inline-input group-title-input" data-key="${safeKey}" data-field="event" value="${safeEvent}" size="${Math.max((g.event || '').length, 5)}">
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Data</span>
            <input type="text" class="hidden-inline-input group-date-input" data-key="${safeKey}" data-field="date" value="${formattedDate}" style="width: 160px;">
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Local</span>
            <input type="text" class="hidden-inline-input group-venue-input" data-key="${safeKey}" data-field="venue" value="${safeVenue}" size="${Math.max((g.venue || '').length, 5)}">
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Estado</span>
            <button class="custom-dropdown-btn group-estado-btn" data-id="${escapeHtml(g.items[0] ? String(g.items[0].id) : '')}" data-field="estado" title="Alterar estado" style="background: transparent; border: none; padding: 0; min-width: auto; height: auto; text-transform: uppercase; color: var(--yellow-primary); font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: none; text-shadow: none;">${safeEstado || '--'}
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.6;"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Cliente</span>
            <span class="group-client-label">${safeClientName}</span>
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Contrato</span>
            ${isArtist
        ? `<span class="badge badge-contract badge-contract-${groupContract}">${CONTRACT_LABELS[groupContract] || groupContract}</span>`
        : `<button class="custom-dropdown-btn badge badge-contract badge-contract-${groupContract}" data-id="${escapeHtml(g.items[0] ? String(g.items[0].id) : '')}" data-field="contract" title="Alterar status do contrato">${CONTRACT_LABELS[groupContract] || groupContract}</button>`}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 15px; margin-right: 15px;">
          <span class="event-group-artist-count">${artistCount} artista${artistCount !== 1 ? 's' : ''}</span>
          ${isArtist || appState.currentRole?.includes("(Booker)") ? '' : `<button class="action-icon-btn delete-group-btn" data-key="${safeKey}" title="Excluir Evento Inteiro" aria-label="Excluir evento inteiro">
            <svg viewBox="0 0 24 24">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
            </svg>
          </button>`}
        </div>
      </div>
      <div class="${containerClass}" data-key="${safeKey}">
        <div class="table-responsive" style="border:none; border-radius:0;">
          <table class="clickup-table">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;"></th>
                <th style="width: 145px;" class="sortable" data-sort="artist">ARTISTA${sortArrow("artist")}</th>
                <th style="width: 145px;" class="sortable" data-sort="vendedor">VENDIDO POR${sortArrow("vendedor")}</th>
                <th style="width: 180px;" class="sortable" data-sort="status">STATUS${sortArrow("status")}</th>
                <th class="sortable text-left" data-sort="amount">CACHÊ${sortArrow("amount")}</th>
                <th class="text-left">LOG. (R$)</th>
                <th class="text-left">TOTAL</th>
                <th class="text-left">RECEBIDO</th>
                <th class="text-left">A RECEBER</th>
                <th>OBS.</th>
                ${isArtist ? '' : '<th style="width: 150px;">LOGÍSTICA</th>'}
                ${isArtist ? '' : '<th class="actions-header-column" style="width: 80px; text-align: center;">AÇÕES</th>'}
              </tr>
            </thead>
            <tbody class="group-tbody">
            </tbody>
          </table>
        </div>
      </div>
    `;

    const tbody = groupDiv.querySelector(".group-tbody");

    g.items.forEach(e => {
      const row = document.createElement("tr");

      const isChecked = e.status === "apos";
      const checkClass = isChecked ? "checked" : "";
      const checkIcon = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

      const amountReceived = parseFloat(e.amountReceived) || 0;
      const logiCost = getLogisticsCost(getLogisticsRecord(e.groupId || "", e.artist));
      const cachet = parseFloat(e.amount) || 0;
      const totalValue = cachet + logiCost;
      const amountToReceive = totalValue - amountReceived;
      const financeNotes = e.financeNotes || "";

      // Escaped versions for safe HTML insertion (anti-XSS)
      const safeArtist = escapeHtml(e.artist || "");
      const safeSeller = escapeHtml(e.vendedor || "");
      const safeNotes = escapeHtml(financeNotes);
      const safeId = escapeHtml(String(e.id));

      if (isArtist) {
        row.innerHTML = `
          <td style="text-align: center;">
            <div class="event-checkbox ${checkClass}" style="cursor: default;">
              ${checkIcon}
            </div>
          </td>
          <td>${safeArtist}</td>
          <td>${safeSeller}</td>
          <td><span class="status-tag status-${e.status}">${STATUS_LABELS[e.status]}</span></td>
          <td class="price-text text-left">${formatCurrency(cachet)}</td>
          <td class="price-text text-left" style="color: var(--text-muted);">${logiCost > 0 ? '+' + formatCurrency(logiCost) : '—'}</td>
          <td class="price-text text-left" style="font-weight: 700;">${formatCurrency(totalValue)}</td>
          <td class="price-text text-left" style="color: #30d158;">${formatCurrency(amountReceived)}</td>
          <td class="price-text text-left" style="color: #ff453a;">${formatCurrency(amountToReceive)}</td>
          <td style="font-size: 11px; color: var(--text-muted);">${safeNotes}</td>
        `;
      } else {
        const aColor = appState.tagColors[e.artist] || "#4a4a52";
        const sColor = appState.tagColors[e.vendedor] || "#4a4a52";

        const artistStyle = `background-color: ${aColor}; border-color: ${aColor}; color: #ffffff;`;
        const sellerStyle = `background-color: ${sColor}; border-color: ${sColor}; color: #ffffff;`;

        row.innerHTML = `
          <td style="text-align: center;">
            <div class="event-checkbox ${checkClass}" data-id="${safeId}">
              ${checkIcon}
            </div>
          </td>
          <td><button class="inline-edit-select custom-dropdown-btn" style="${artistStyle} text-align: left;" data-id="${safeId}" data-field="artist">${safeArtist || '<span style="color:var(--text-muted);font-weight:normal;">Selecione</span>'}</button></td>
          <td><button class="inline-edit-select custom-dropdown-btn" style="${sellerStyle} text-align: left;" data-id="${safeId}" data-field="vendedor">${safeSeller || '<span style="color:var(--text-muted);font-weight:normal;">Selecione</span>'}</button></td>
          <td>
            <button class="inline-edit-select custom-dropdown-btn status-tag status-${e.status}" style="text-align: left;" data-id="${safeId}" data-field="status">${STATUS_LABELS[e.status] || escapeHtml(e.status)}</button>
          </td>
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: var(--text-main);" data-id="${safeId}" data-field="amount" value="${e.amount}">
          </td>
          <td class="price-text text-left" style="color: var(--text-muted);">${logiCost > 0 ? '+' + formatCurrency(logiCost) : '—'}</td>
          <td class="price-text text-left" style="font-weight: 700;">${formatCurrency(totalValue)}</td>
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: #30d158;" data-id="${safeId}" data-field="amountReceived" value="${amountReceived}">
          </td>
          <td class="price-text text-left" style="color: #ff453a; font-weight: 700;">${formatCurrency(amountToReceive)}</td>
          <td>
            <input type="text" class="inline-edit-input" style="width: 120px; font-size: 11px;" placeholder="Obs..." data-id="${safeId}" data-field="financeNotes" value="${safeNotes}">
          </td>
          <td style="font-size:11px; white-space:nowrap;">
            ${(() => {
            const st = getArtistLogisticsStatus(e.groupId || "", e.artist);
            if (st === 'concluida') return `<button class="btn-secondary logi-view-btn" data-key="${escapeHtml(e.groupId || '')}" data-artist="${escapeHtml(e.artist || '')}" style="padding:4px 10px; font-size:11px;">Ver Logística</button>`;
            const color = st === 'andamento' ? '#ff9f0a' : 'var(--text-muted)';
            return `<span style="color:${color};">${LOGI_STATUS_LABELS[st]}</span>`;
          })()}
          </td>
          ${isArtist ? '' : `<td style="text-align: center;">
            ${(!appState.currentRole || !appState.currentRole.includes("(Admin)")) ? '' : `<button class="action-icon-btn delete-btn" style="margin: 0 auto;" data-id="${safeId}" title="Excluir Show" aria-label="Excluir show">
              <svg viewBox="0 0 24 24">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
              </svg>
            </button>`}
          </td>`}
        `;
      }
      tbody.appendChild(row);
    });

    if (!isArtist) {
      const addRow = document.createElement("div");
      addRow.style.padding = "10px 15px";
      addRow.style.borderTop = "1px solid var(--border-color)";
      addRow.style.textAlign = "center";
      addRow.innerHTML = `
        <button class="btn-secondary add-artist-to-group-btn" data-key="${safeKey}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; padding: 8px;">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Adicionar Artista a este Evento
        </button>
      `;
      const containerClassDiv = groupDiv.querySelector(`.${containerClass.split(' ').join('.')}`);
      if (containerClassDiv) {
        containerClassDiv.appendChild(addRow);
      }
    }

    container.appendChild(groupDiv);
  });

  // Attach Add Artist to Group events
  document.querySelectorAll(".add-artist-to-group-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const key = btn.getAttribute("data-key");
      const groupInfo = groups[key];
      const newEvent = {
        id: "evt-" + Date.now() + Math.floor(Math.random() * 1000),
        groupId: groupInfo.items[0] ? groupInfo.items[0].groupId : ("grp-" + Date.now()),
        event: groupInfo.event,
        date: groupInfo.date,
        venue: groupInfo.venue,
        estado: groupInfo.estado,
        artist: "",
        vendedor: "",
        status: "antes",
        amount: 0
      };
      appState.events.push(newEvent);
      saveState();
      renderEventTable();
      updateDashboard();
      renderTimeline();
    });
  });

  // Attach Delete Group events
  document.querySelectorAll(".delete-group-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent toggling the header

      showConfirmModal("Atenção", "Tem certeza que deseja excluir TODOS os artistas deste evento? Isso não pode ser desfeito.", () => {
        const key = btn.getAttribute("data-key");
        const groupInfo = groups[key];
        const eventIdsToDelete = groupInfo.items.map(ev => String(ev.id));

        appState.events = appState.events.filter(ev => !eventIdsToDelete.includes(String(ev.id)));

        // Delete from Supabase as well
        if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
          sbClient.from('events').delete().in('id', eventIdsToDelete).then(({ error }) => {
            if (error) console.error("Error deleting group from Supabase", error);
          });
        }

        saveState();
        deleteEventCard(key);
        renderEventTable();
        updateDashboard();
        renderTimeline();
        showToast("Evento excluído com sucesso!");
      });
    });
  });

  // Attach group header toggle events
  document.querySelectorAll(".event-group-header").forEach(header => {
    header.addEventListener("click", (e) => {
      if (['INPUT', 'SELECT'].includes(e.target.tagName) || e.target.closest('.custom-dropdown-btn') || e.target.closest('.group-estado-btn')) return;
      const key = header.getAttribute("data-key");
      if (window.collapsedGroups.has(key)) {
        window.collapsedGroups.delete(key);
      } else {
        window.collapsedGroups.add(key);
      }
      renderEventTable();
    });
  });

  // Attach group hidden input edits
  document.querySelectorAll(".group-title-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-key");
      const items = groups[key].items;
      updateGroupField(items, 'event', e.target.value);
    });
    // Adjust size dynamically to look like text
    input.addEventListener("input", (e) => {
      e.target.setAttribute("size", Math.max(e.target.value.length, 5));
    });
  });

  document.querySelectorAll(".group-date-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-key");
      const items = groups[key].items;

      let val = normalizeDate(e.target.value);
      // Check for same-day + same-state conflicts before updating
      const estado = (items[0] && items[0].estado || '').toUpperCase();
      let blocked = false;
      let warned = false;
      items.forEach(item => {
        if (item.artist && val && estado) {
          const check = checkArtistDateConflict(appState.events, item.artist, val, estado, item.id);
          if (check.status === "blocked") {
            showWarningToast(check.message);
            blocked = true;
          } else if (check.status === "warned") {
            showWarningToast(check.message);
            warned = true;
          }
        }
      });
      if (blocked) {
        e.target.value = formatDate(items[0].date); // revert
        return;
      }
      updateGroupField(items, 'date', val);
    });
  });

  // Venue inline edit
  document.querySelectorAll(".group-venue-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-key");
      const items = groups[key].items;
      updateGroupField(items, 'venue', e.target.value);
    });
    input.addEventListener("input", (e) => {
      e.target.setAttribute("size", Math.max(e.target.value.length, 5));
    });
  });

  // Estado inline edit
  // Removed old group-estado-input listener as estado now uses custom-dropdown-btn

  if (!isArtist) {
    // Attach delete events
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        deleteEvent(id);
      });
    });

    document.querySelectorAll(".logi-view-btn").forEach(btn => {
      btn.addEventListener("click", () => openLogisticsViewModal(btn.getAttribute("data-key"), btn.getAttribute("data-artist")));
    });

    // Attach checkbox toggle events
    document.querySelectorAll(".event-checkbox[data-id]").forEach(cb => {
      cb.addEventListener("click", (e) => {
        const id = cb.getAttribute("data-id");
        const eventObj = appState.events.find(ev => String(ev.id) === String(id));
        if (eventObj) {
          eventObj.status = eventObj.status === "apos" ? "durante" : "apos";
          saveState();
          renderEventTable();
          updateDashboard();
          renderTimeline();
          showToast(eventObj.status === "apos" ? "Evento marcado como Concluído!" : "Evento marcado como Pendente/Durante!");
        }
      });
    });

    // Attach custom dropdown events for Artist and Seller
    document.querySelectorAll(".custom-dropdown-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = btn.getAttribute("data-id");
        const field = btn.getAttribute("data-field");
        openCustomDropdown(btn, id, field);
      });
    });

    // Attach inline edit events
    document.querySelectorAll(".inline-edit-input, .inline-edit-select").forEach(el => {
      el.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-id");
        const field = e.target.getAttribute("data-field");
        let val = e.target.value;
        if (field === "amount" || field === "amountReceived") val = parseFloat(val) || 0;

        if (field === "date") {
          val = normalizeDate(val);
        }

        const eventObj = appState.events.find(ev => String(ev.id) === String(id));
        if (eventObj) {
          let hasConflict = false;

          // Validate BEFORE persisting, so a blocked change is truly reverted.
          if (field === "artist") {
            const check = checkArtistDateConflict(appState.events, val, eventObj.date, eventObj.estado, id);
            if (check.status === "blocked") {
              showWarningToast(check.message);
              renderEventTable(); // restore the original value in the UI
              return;
            } else if (check.status === "warned") {
              showWarningToast(check.message);
              hasConflict = true; // just to skip the success toast
            }
          }

          eventObj[field] = val;
          saveState();

          if (field === "status") {
            e.target.className = `inline-edit-select inline-status-${val}`;
          }
          if (field === "artist" || field === "vendedor") {
            const newColor = appState.tagColors[val] || "#ffffff";
            e.target.style.background = hexToRgba(newColor, 0.1);
            e.target.style.borderColor = hexToRgba(newColor, 0.3);
            e.target.style.color = newColor;
          }

          updateDashboard();
          renderTimeline();
          renderEventTable();

          if (!hasConflict) {
            showToast("Alteração salva com sucesso!", "success");
          }
        }
      });
    });
  }
}

export function deleteEvent(id) {
  const ev = appState.events.find(e => String(e.id) === String(id));
  if (!ev) return;

  const groupId = ev.groupId;
  let isOnlyArtist = true;
  if (groupId) {
    const siblings = appState.events.filter(e => e.groupId === groupId);
    if (siblings.length > 1) {
      isOnlyArtist = false;
    }
  } else {
    const key = `${ev.event}|${ev.date}|${ev.venue}|${ev.estado || ''}`;
    const siblings = appState.events.filter(e => `${e.event}|${e.date}|${e.venue}|${e.estado || ''}` === key);
    if (siblings.length > 1) {
      isOnlyArtist = false;
    }
  }

  const msg = isOnlyArtist
    ? "Tem certeza que deseja excluir este evento inteiro?"
    : `Deseja remover o artista ${ev.artist || 'selecionado'} deste evento?`;

  showConfirmModal("Confirmação de Exclusão", msg, () => {
    appState.events = appState.events.filter(e => String(e.id) !== String(id));
    // Delete from Supabase as well
    if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
      sbClient.from('events').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Error deleting from Supabase", error);
      });
    }
    saveState();
    renderEventTable();
    updateDashboard();
    renderTimeline();
    showToast(isOnlyArtist ? "Show excluído com sucesso!" : "Artista removido do evento.");
  });
}

export function duplicateEventForNewArtist(eventId) {
  const eventObj = appState.events.find(ev => ev.id === eventId);
  if (eventObj) {
    const groupId = eventObj.groupId || ("grp-" + Date.now());
    eventObj.groupId = groupId; // Garante que o original tem o grupo

    const newEvent = {
      id: "evt-" + Date.now() + Math.floor(Math.random() * 1000),
      groupId: groupId,
      event: eventObj.event,
      date: eventObj.date,
      venue: eventObj.venue,
      estado: eventObj.estado,
      artist: "",
      vendedor: "",
      status: "antes",
      amount: 0
    };

    appState.events.push(newEvent);
    saveState();

    renderEventTable();
    updateDashboard();
    renderTimeline();

    showToast("Nova linha criada. Selecione o artista!", "success");
  }
}
