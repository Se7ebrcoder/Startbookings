// js/ui/toast.js — feedback visual: loading, indicador de sync e toasts.

export function showAppLoading() {
  const el = document.getElementById("app-loading");
  if (el) el.style.display = "flex";
}
export function hideAppLoading() {
  const el = document.getElementById("app-loading");
  if (el) el.style.display = "none";
}

let syncStatusTimer = null;
// Indicador de sincronização: "saving" | "saved" | "offline".
export function setSyncStatus(state) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  clearTimeout(syncStatusTimer);
  el.className = "sync-status sync-" + state;
  if (state === "saving") {
    el.textContent = "Salvando…";
  } else if (state === "saved") {
    el.textContent = "✓ Salvo";
    syncStatusTimer = setTimeout(() => { el.textContent = ""; el.className = "sync-status"; }, 2200);
  } else if (state === "offline") {
    el.textContent = "⚠ Sem conexão (salvo no aparelho)";
  }
}

export function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  const closeBtn = document.getElementById("toast-close");

  toastText.textContent = message;

  // Limpar classes antigas e adicionar a nova
  toast.className = "toast-msg";
  if (type) toast.classList.add(`toast-${type}`);
  toast.classList.add("show");

  if (closeBtn) {
    closeBtn.onclick = () => toast.classList.remove("show");
  }

  // Apenas sucesso fecha sozinho
  if (type === "success" || !type) {
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }
}

export function showWarningToast(message) {
  const toastCenter = document.getElementById("toast-center");
  const toastCenterText = document.getElementById("toast-center-text");
  const closeBtn = document.getElementById("toast-center-close");

  if (!toastCenter || !toastCenterText) return;

  toastCenterText.textContent = message;
  toastCenter.classList.add("show");

  if (closeBtn) {
    closeBtn.onclick = () => toastCenter.classList.remove("show");
  }
}
