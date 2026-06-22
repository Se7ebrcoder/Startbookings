// js/features/settings/view.js — configurações: meta, gestão de artistas/vendedores, cores.

import { appState, saveState } from '../../core/state.js';
import { escapeHtml, getRandomColor } from '../../utils/dom.js';
import { sbClient } from '../../core/supabase.js';
import { showToast, showWarningToast } from '../../ui/toast.js';
import { showEditEntityModal } from '../../ui/modal.js';
import { updateDropdownOptions, renderEventTable } from '../events/table.js';
import { updateDashboard } from '../dashboard/view.js';
import { renderTimeline } from '../timeline/view.js';

export function initSettings() {
  const goalInput = document.getElementById("settings-goal-input");
  const saveGoalBtn = document.getElementById("save-goal-btn");
  const addArtistForm = document.getElementById("add-artist-form");
  const addSellerForm = document.getElementById("add-seller-form");

  // Set default goal value in input
  const currentName = appState.currentRole ? appState.currentRole.split(" (")[0] : "Admin";
  goalInput.value = appState.goals[currentName] || 500000;

  // Goal change
  saveGoalBtn.addEventListener("click", () => {
    const val = parseFloat(goalInput.value);
    const currentName = appState.currentRole ? appState.currentRole.split(" (")[0] : "Admin";
    if (!isNaN(val) && val > 0) {
      appState.goals[currentName] = val;
      saveState();
      updateDashboard();
      showToast("Meta anual atualizada com sucesso!");
    } else {
      showToast("Digite um valor válido para a meta.", "error");
    }
  });

  // Add Artist
  if (addArtistForm) {
    addArtistForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("new-artist-name");
      const emailInput = document.getElementById("new-artist-email");
      const colorInput = document.getElementById("new-artist-color");
      const name = nameInput.value.trim();
      const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const color = colorInput ? colorInput.value : getRandomColor();

      if (name && !appState.artists.includes(name)) {
        appState.artists.push(name);
        appState.tagColors[name] = color;
        let finalEmail = email;
        if (!finalEmail) {
          const defaultEmails = {
            "raianlameira@hotmail.com": "Se7e",
            "contato.anotherreality@gmail.com": "Another Reality",
            "parallelusmusic@gmail.com": "Parallelus",
            "atomuz_@outlook.com": "Atomuz",
            "contatoartisticope@gmail.com": "Bug System",
            "giuseppebandini36@gmail.com": "Bandini"
          };
          const foundKey = Object.keys(defaultEmails).find(k => defaultEmails[k] === name);
          if (foundKey) finalEmail = foundKey;
        }

        if (finalEmail) {
          if (!appState.artistEmails) appState.artistEmails = {};
          appState.artistEmails[finalEmail] = name;
          if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
            sbClient.from('artist_emails').upsert({ email: finalEmail, artist_name: name }).then(({ error }) => {
              if (error) console.error("Error upserting artist_email", error);
            });
          }
        }
        saveState();
        nameInput.value = "";
        if (emailInput) emailInput.value = "";

        updateConfigLists();
        updateDropdownOptions();
        renderEventTable();
        showToast(`Artista ${name} adicionado com sucesso!`);
      } else {
        showWarningToast("Artista já cadastrado ou nome inválido.");
      }
    });
  }

  // Add Seller
  if (addSellerForm) {
    addSellerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("new-seller-name");
      const emailInput = document.getElementById("new-seller-email");
      const colorInput = document.getElementById("new-seller-color");
      const name = nameInput.value.trim();
      const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const color = colorInput ? colorInput.value : getRandomColor();

      if (name && !appState.sellers.includes(name)) {
        appState.sellers.push(name);
        appState.tagColors[name] = color;
        if (email) {
          if (!appState.adminEmails) appState.adminEmails = {};
          appState.adminEmails[email] = name;
        }
        saveState();
        nameInput.value = "";
        if (emailInput) emailInput.value = "";

        updateConfigLists();
        updateDropdownOptions();
        renderEventTable();
        showToast(`Gerente ${name} adicionado à equipe com sucesso!`);
      } else {
        showWarningToast("Gerente já cadastrado ou nome inválido.");
      }
    });
  }
}

export function updateConfigLists() {
  const statusSelect = document.getElementById("filter-status");
  if (statusSelect) {
    const currentVal = statusSelect.value;
    const customStatuses = [...new Set(appState.events.map(e => e.status))].filter(s => s && s !== "antes" && s !== "durante" && s !== "apos");
    statusSelect.innerHTML = `
      <option value="all">Todos os Status</option>
      <option value="antes">Em negociação</option>
      <option value="durante">Confirmado</option>
      <option value="apos">Concluído</option>
      ${customStatuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
    `;
    statusSelect.value = currentVal || "all";
  }

  const artistList = document.getElementById("config-artists-list");
  const sellerList = document.getElementById("config-sellers-list");

  if (artistList) {
    artistList.innerHTML = "";
    appState.artists.forEach(artist => {
      const color = appState.tagColors[artist] || "#ffcc00";
      let mappedEmail = "";
      let currentEmail = "";
      if (appState.artistEmails) {
        const found = Object.keys(appState.artistEmails).find(key => appState.artistEmails[key] === artist);
        if (found) {
          mappedEmail = ` <span style="color:var(--text-muted); font-size:11px; margin-left:8px;">(${found})</span>`;
          currentEmail = found;
        }
      }
      const item = document.createElement("div");
      item.className = "list-manager-item";
      const safeArtist = escapeHtml(artist);
      const safeEmail = escapeHtml(currentEmail);
      item.innerHTML = `
        <span class="list-manager-name" style="display:flex; align-items:center; gap:8px;">
          <input type="color" class="color-dot-input" data-name="${safeArtist}" value="${color}" title="Alterar cor de ${safeArtist}" aria-label="Cor de ${safeArtist}">
          ${safeArtist}${mappedEmail}
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="action-icon-btn edit-artist-btn" data-name="${safeArtist}" data-email="${safeEmail}" title="Editar Artista" aria-label="Editar artista ${safeArtist}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          ${(!appState.currentRole || !appState.currentRole.includes("(Admin)")) ? '' : `<button class="action-icon-btn delete-artist-btn" data-name="${safeArtist}" title="Excluir Artista" aria-label="Excluir artista ${safeArtist}">
            <svg viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>`}
        </div>
      `;
      artistList.appendChild(item);
    });

    // Attach edit handlers for artists
    document.querySelectorAll(".edit-artist-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const oldName = btn.getAttribute("data-name");
        const oldEmail = btn.getAttribute("data-email");

        showEditEntityModal("Editar Artista", oldName, oldEmail, (newName, newEmail) => {
          if (!newName || !newName.trim()) return;
          const nameTrimmed = newName.trim();
          const emailTrimmed = newEmail ? newEmail.trim().toLowerCase() : "";

          const nameChanged = (nameTrimmed !== oldName);

          // If name changed, verify it doesn't already exist
          if (nameChanged && appState.artists.includes(nameTrimmed)) {
            showWarningToast("Um artista com esse nome já existe!");
            return;
          }

          if (nameChanged) {
            // Update artists array
            const idx = appState.artists.indexOf(oldName);
            if (idx > -1) appState.artists[idx] = nameTrimmed;

            // Update tag colors
            if (appState.tagColors[oldName]) {
              appState.tagColors[nameTrimmed] = appState.tagColors[oldName];
              delete appState.tagColors[oldName];
            }

            // Update events
            appState.events.forEach(ev => {
              if (ev.artist === oldName) ev.artist = nameTrimmed;
            });

            // Supabase sync
            if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
              sbClient.from('events').update({ artist: nameTrimmed }).eq('artist', oldName).then(({ error }) => {
                if (error) console.error("Error updating artist in Supabase", error);
              });
            }
          }

          // Update Emails
          if (!appState.artistEmails) appState.artistEmails = {};

          // Remove old mapping regardless (we'll re-add if needed)
          Object.keys(appState.artistEmails).forEach(email => {
            if (appState.artistEmails[email] === oldName) {
              delete appState.artistEmails[email];
              if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
                sbClient.from('artist_emails').delete().eq('email', email).then(() => { });
              }
            }
          });

          if (emailTrimmed) {
            appState.artistEmails[emailTrimmed] = nameTrimmed;
            if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
              sbClient.from('artist_emails').upsert({ email: emailTrimmed, artist_name: nameTrimmed }).then(() => { });
            }
          }

          saveState();
          updateConfigLists();
          updateDropdownOptions();
          renderEventTable();
          showToast(`Artista ${nameTrimmed} atualizado.`);
        });
      });
    });

    // Attach delete handlers for artists
    document.querySelectorAll(".delete-artist-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-name");
        if (confirm(`Excluir o artista ${name} e todos os seus shows?`)) {
          appState.artists = appState.artists.filter(a => a !== name);
          appState.events = appState.events.filter(e => e.artist !== name);
          // Delete from email mapping
          if (appState.artistEmails) {
            Object.keys(appState.artistEmails).forEach(email => {
              if (appState.artistEmails[email] === name) {
                delete appState.artistEmails[email];
                if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
                  sbClient.from('artist_emails').delete().eq('email', email).then(() => { });
                }
              }
            });
          }
          saveState();
          updateDropdownOptions();
          updateConfigLists();
          updateDashboard();
          renderEventTable();
          renderTimeline();
          showToast(`Artista ${name} excluído.`);
        }
      });
    });
  }

  if (sellerList) {
    sellerList.innerHTML = "";
    appState.sellers.forEach(seller => {
      const color = appState.tagColors[seller] || "#9a9a9f";
      let mappedEmail = "";
      let currentEmail = "";

      const allTeamEmails = { ...appState.adminEmails, ...appState.bookerEmails };
      if (allTeamEmails) {
        const found = Object.keys(allTeamEmails).find(key => allTeamEmails[key] === seller);
        if (found) {
          mappedEmail = ` <span style="color:var(--text-muted); font-size:11px; margin-left:8px;">(${found})</span>`;
          currentEmail = found;
        }
      }

      const isIngrid = seller === "Ingrid (Master)" || seller === "Ingrid";
      const safeSeller = escapeHtml(seller);
      const safeEmail = escapeHtml(currentEmail);
      // Ingrid cannot be deleted (is primary admin)
      const deleteBtnHtml = (isIngrid || (!appState.currentRole || !appState.currentRole.includes("(Admin)"))) ? "" : `
        <button class="action-icon-btn delete-seller-btn" data-name="${safeSeller}" title="Excluir Vendedor" aria-label="Excluir vendedor ${safeSeller}">
          <svg viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      `;

      const item = document.createElement("div");
      item.className = "list-manager-item";
      item.innerHTML = `
        <span class="list-manager-name" style="display:flex; align-items:center; gap:8px;">
          <input type="color" class="color-dot-input" data-name="${safeSeller}" value="${color}" title="Alterar cor de ${safeSeller}" aria-label="Cor de ${safeSeller}">
          ${safeSeller}${isIngrid ? " (Master)" : ""}${mappedEmail}
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="action-icon-btn edit-seller-btn" data-name="${safeSeller}" data-email="${safeEmail}" title="Editar E-mail" aria-label="Editar e-mail do vendedor ${safeSeller}">
            <svg viewBox="0 0 24 24">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          ${deleteBtnHtml}
        </div>
      `;
      sellerList.appendChild(item);
    });

    // Attach edit handlers for sellers
    document.querySelectorAll(".edit-seller-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const oldName = btn.getAttribute("data-name");
        const oldEmail = btn.getAttribute("data-email");

        showEditEntityModal("Editar Vendedor", oldName, oldEmail, (newName, newEmail) => {
          if (!newName || !newName.trim()) return;
          const nameTrimmed = newName.trim();
          const emailTrimmed = newEmail ? newEmail.trim().toLowerCase() : "";

          const nameChanged = (nameTrimmed !== oldName);

          if (nameChanged && appState.sellers.includes(nameTrimmed)) {
            showWarningToast("Um vendedor com esse nome já existe!");
            return;
          }

          if (nameChanged) {
            // Update sellers array
            const idx = appState.sellers.indexOf(oldName);
            if (idx > -1) appState.sellers[idx] = nameTrimmed;

            // Update tag colors
            if (appState.tagColors[oldName]) {
              appState.tagColors[nameTrimmed] = appState.tagColors[oldName];
              delete appState.tagColors[oldName];
            }

            // Update events
            appState.events.forEach(ev => {
              if (ev.vendedor === oldName) ev.vendedor = nameTrimmed;
            });

            // Supabase sync
            if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
              sbClient.from('events').update({ vendedor: nameTrimmed }).eq('vendedor', oldName).then(({ error }) => {
                if (error) console.error("Error updating seller in Supabase", error);
              });
            }
          }

          // Update Emails
          if (!appState.adminEmails) appState.adminEmails = {};
          if (!appState.bookerEmails) appState.bookerEmails = {};

          // Remove old mapping
          Object.keys(appState.adminEmails).forEach(email => {
            if (appState.adminEmails[email] === oldName) delete appState.adminEmails[email];
          });
          Object.keys(appState.bookerEmails).forEach(email => {
            if (appState.bookerEmails[email] === oldName) delete appState.bookerEmails[email];
          });

          if (emailTrimmed) {
            // Assume it's an admin if it's not a booker
            if (appState.bookerEmails[emailTrimmed] !== undefined || ["Heloísa", "Rayanne"].includes(nameTrimmed)) {
              appState.bookerEmails[emailTrimmed] = nameTrimmed;
            } else {
              appState.adminEmails[emailTrimmed] = nameTrimmed;
            }
          }

          saveState();
          updateConfigLists();
          updateDropdownOptions();
          renderEventTable();
          showToast(`Vendedor ${nameTrimmed} atualizado.`);
        });
      });
    });

    // Attach delete handlers for sellers
    document.querySelectorAll(".delete-seller-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-name");
        if (confirm(`Excluir o gerente/vendedor ${name}? Isso removerá a atribuição de vendas desse gerente nas metas.`)) {
          appState.sellers = appState.sellers.filter(s => s !== name);
          // Delete from email mapping
          if (appState.adminEmails) {
            Object.keys(appState.adminEmails).forEach(email => {
              if (appState.adminEmails[email] === name) {
                delete appState.adminEmails[email];
              }
            });
          }
          saveState();
          updateDropdownOptions();
          updateConfigLists();
          renderEventTable();
          showToast(`Vendedor ${name} removido da equipe.`);
        }
      });
    });
  }

  // Seletor de cor nativo (paleta completa) nas bolinhas
  document.querySelectorAll(".color-dot-input").forEach(inp => {
    inp.addEventListener("change", () => {
      const name = inp.getAttribute("data-name");
      appState.tagColors[name] = inp.value;
      saveState();
      updateConfigLists();
      renderEventTable();
      showToast("Cor da tag atualizada!");
    });
  });
}

let currentEditTag = null;
export function initColorPicker() {
  const grid = document.getElementById("color-picker-grid");
  const popover = document.getElementById("color-picker-popover");

  // ClickUp Inspired Colors
  const PRESET_COLORS = ["#5e5ce6", "#0a84ff", "#40c8e0", "#30d158", "#ffcc00", "#ff9f0a", "#ff453a", "#ff375f", "#bf5af2", "#8e8e93", "#5c5c5c", "#1c1c1e"];

  PRESET_COLORS.forEach(color => {
    const swatch = document.createElement("div");
    swatch.className = "color-picker-swatch";
    swatch.style.backgroundColor = color;
    swatch.addEventListener("click", () => {
      if (currentEditTag) {
        appState.tagColors[currentEditTag] = color;
        saveState();
        popover.classList.add("hidden");
        updateConfigLists();
        renderEventTable();
        showToast(`Cor da tag atualizada!`);
      }
    });
    grid.appendChild(swatch);
  });

  // Close popover when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".color-picker-popover") && !e.target.closest(".color-dot")) {
      popover.classList.add("hidden");
    }
  });
}
