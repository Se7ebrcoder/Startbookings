// js/ui/modal.js — acessibilidade dos modais + modais genéricos (confirm/prompt/edit).

// Acessibilidade dos modais: Esc fecha, foco entra ao abrir e volta ao fechar,
// e Tab fica preso dentro do modal. Centralizado via observer das classes
// (todos os modais usam .modal-overlay + classe "show"), sem editar cada um.
export function initModalA11y() {
  const overlays = document.querySelectorAll(".modal-overlay");
  let lastFocused = null;

  const focusablesOf = (modal) => [...modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null);

  const openModal = () => document.querySelector(".modal-overlay.show");

  overlays.forEach(ov => {
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    const obs = new MutationObserver(() => {
      if (ov.classList.contains("show")) {
        lastFocused = document.activeElement;
        const f = focusablesOf(ov);
        setTimeout(() => { (f[0] || ov).focus(); }, 30);
      } else if (lastFocused) {
        try { lastFocused.focus(); } catch (e) { }
        lastFocused = null;
      }
    });
    obs.observe(ov, { attributes: true, attributeFilter: ["class"] });
  });

  document.addEventListener("keydown", (e) => {
    const modal = openModal();
    if (!modal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      const closeBtn = modal.querySelector(".modal-close");
      if (closeBtn) closeBtn.click();
      else { modal.classList.remove("show"); document.body.classList.remove("modal-open"); }
    } else if (e.key === "Tab") {
      const f = focusablesOf(modal);
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

export function showConfirmModal(title, msg, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  if (!modal) {
    // Fallback to native confirm if HTML is missing
    if (confirm(msg)) onConfirm();
    return;
  }

  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-msg');
  const btnOk = document.getElementById('confirm-modal-ok');
  const btnCancel = document.getElementById('confirm-modal-cancel');

  titleEl.textContent = title;
  msgEl.textContent = msg;

  modal.classList.add("show");

  // Handlers
  function handleOk() {
    closeModal();
    onConfirm();
  }

  function handleCancel() {
    closeModal();
  }

  function closeModal() {
    modal.classList.remove("show");
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
  }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
}

// CUSTOM PROMPT MODAL LOGIC
export function showPromptModal(title, label, defaultValue, onConfirm) {
  const modal = document.getElementById('prompt-modal');
  if (!modal) {
    // Fallback
    const val = prompt(label, defaultValue);
    if (val !== null) onConfirm(val);
    return;
  }

  const titleEl = document.getElementById('prompt-modal-title');
  const labelEl = document.getElementById('prompt-modal-label');
  const inputEl = document.getElementById('prompt-modal-input');
  const btnOk = document.getElementById('prompt-modal-ok');
  const btnCancel = document.getElementById('prompt-modal-cancel');

  titleEl.textContent = title;
  labelEl.textContent = label;
  inputEl.value = defaultValue || "";

  modal.classList.add("show");
  inputEl.focus();

  function handleOk() {
    const val = inputEl.value;
    closeModal();
    onConfirm(val);
  }

  function handleCancel() {
    closeModal();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOk();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  function closeModal() {
    modal.classList.remove("show");
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    inputEl.removeEventListener('keydown', handleKeydown);
  }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
  inputEl.addEventListener('keydown', handleKeydown);
}

// CUSTOM EDIT ENTITY MODAL LOGIC
export function showEditEntityModal(title, defaultName, defaultEmail, onConfirm) {
  const modal = document.getElementById('edit-entity-modal');
  if (!modal) return;

  const titleEl = document.getElementById('edit-entity-modal-title');
  const inputName = document.getElementById('edit-entity-name');
  const inputEmail = document.getElementById('edit-entity-email');
  const btnOk = document.getElementById('edit-entity-ok');
  const btnCancel = document.getElementById('edit-entity-cancel');

  titleEl.textContent = title;
  inputName.value = defaultName || "";
  inputEmail.value = defaultEmail || "";

  modal.classList.add("show");
  inputName.focus();

  function handleOk() {
    const n = inputName.value;
    const e = inputEmail.value;
    closeModal();
    onConfirm(n, e);
  }

  function handleCancel() {
    closeModal();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOk();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  function closeModal() {
    modal.classList.remove("show");
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    inputName.removeEventListener('keydown', handleKeydown);
    inputEmail.removeEventListener('keydown', handleKeydown);
  }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
  inputName.addEventListener('keydown', handleKeydown);
  inputEmail.addEventListener('keydown', handleKeydown);
}
