# Módulo de Logística — Fase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir consultar uma logística finalizada num modal somente-leitura (que não fecha ao clicar fora) e exportar o roteiro em PDF via impressão.

**Architecture:** SPA vanilla JS (`app-v2.js`) + Supabase. Novo modal `#logistics-view-modal` (read-only) e área `#logistics-print-area`. Render do dossiê a partir de `appState.logistics` reusando helpers da Fase 1. PDF = página de impressão limpa (`@media print` + `window.print()`), sem bibliotecas.

**Tech Stack:** HTML/CSS/JS puro, Jest (jsdom) para função pura.

**Spec:** `docs/superpowers/specs/2026-06-11-logistica-design.md` (§8)

---

## ⚠️ Notas de execução

1. **Git:** projeto NÃO é git. Ignore qualquer "commit".
2. **Teste manual:** `python -m http.server 5500`, `http://localhost:5500/index.html`, `Ctrl+Shift+R`. Admin: `startbookings@gmail.com`.
3. **Pré-requisito:** Fase 1 implementada. Já existem: `appState.logistics`, `getLogisticsRecord(eventKey, artist)`, `appState.logisticsEvents`, `escapeHtml`, `formatDate`, `LOGI_STATUS_LABELS`, `showWarningToast`, `renderLogisticsDashboard`, e o botão `.logi-view-btn` (na Tabela de Eventos, exibido quando status = concluída).

---

## Task 1: Função pura `legToFields` (TDD)

**Files:**
- Modify: `app-v2.js` (perto de `deriveLogisticsStatus`)
- Modify: `app-v2.js` (`module.exports`)
- Test: `__tests__/app.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Em `__tests__/app.test.js`, dentro do `describe(...)` (antes do `});` final):
```javascript
  test('legToFields() formata um trecho de transporte em pares [rótulo, valor]', () => {
    expect(app.legToFields(null)).toEqual([]);
    expect(app.legToFields({ modo: 'uber', saida: '10h', chegada: '12h', origem: 'A', destino: 'B' }))
      .toEqual([['Transporte', 'Uber / Táxi'], ['Saída', '10h'], ['Chegada', '12h'], ['Origem', 'A'], ['Destino', 'B']]);
    const carro = app.legToFields({ modo: 'carro', saida: '8h', motoristaNome: 'Zé', placa: 'ABC1D23' });
    expect(carro[0]).toEqual(['Transporte', 'Carro / BlaBlaCar']);
    expect(carro).toContainEqual(['Motorista', 'Zé']);
    expect(carro).toContainEqual(['Placa', 'ABC1D23']);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest -t legToFields`
Expected: FAIL (função não existe).

- [ ] **Step 3: Implementar**

Em `app-v2.js`, logo após a função `deriveLogisticsStatus(...)`, adicione:
```javascript
// Converte um trecho (ida/volta) em pares [rótulo, valor] para exibição/PDF.
function legToFields(leg) {
  if (!leg || !leg.modo) return [];
  const modo = leg.modo;
  if (modo === 'carro') {
    return [['Transporte', 'Carro / BlaBlaCar'], ['Saída', leg.saida || ''], ['Chegada', leg.chegada || ''],
      ['Ponto de encontro', leg.pontoEncontro || ''], ['Motorista', leg.motoristaNome || ''],
      ['Carro', leg.carroModelo || ''], ['Placa', leg.placa || '']];
  }
  if (modo === 'uber') {
    return [['Transporte', 'Uber / Táxi'], ['Saída', leg.saida || ''], ['Chegada', leg.chegada || ''],
      ['Origem', leg.origem || ''], ['Destino', leg.destino || '']];
  }
  const pairs = [['Transporte', 'Avião'], ['Companhia', leg.companhia || ''], ['Voo', leg.voo || ''],
    ['Localizador', leg.localizador || ''], ['Partida', leg.partida || ''], ['Chegada', leg.chegada || ''],
    ['Recepção no destino', leg.recepcaoNome || ''], ['Veículo de apoio', leg.veiculoApoio || '']];
  (leg.conexoes || []).forEach((c, i) => {
    const parts = [c.cidade, c.espera && ('espera ' + c.espera),
      c.pernoite && ('pernoite: ' + [c.hotelNome, c.hotelEndereco].filter(Boolean).join(' — ')),
      c.translado && ('translado: ' + c.translado)].filter(Boolean).join(' · ');
    pairs.push([`Conexão ${i + 1}`, parts]);
  });
  return pairs;
}
```

- [ ] **Step 4: Exportar para teste**

No `module.exports = { ... }`, adicione `legToFields,`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest` (todos passam) e `node --check app-v2.js`.

---

## Task 2: HTML — modal read-only + área de impressão

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Inserir o modal e a área de impressão**

Junto dos outros modais (logo após o `<!-- LOGISTICS FORM MODAL -->` ... `</div>` que o fecha), insira:
```html
  <!-- LOGISTICS VIEW (read-only) MODAL -->
  <div class="modal-overlay" id="logistics-view-modal">
    <div class="modal-content" style="max-width: 680px;">
      <div class="modal-header">
        <h3 class="modal-title" id="logistics-view-title">Logística</h3>
        <button class="modal-close" id="close-logistics-view-btn" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body" id="logistics-view-body"></div>
      <div class="modal-footer" style="justify-content: space-between;">
        <button type="button" class="btn-secondary" id="logistics-export-pdf-btn">Exportar PDF</button>
        <button type="button" class="btn-primary" id="logistics-view-close-footer-btn">Fechar</button>
      </div>
    </div>
  </div>

  <!-- ÁREA DE IMPRESSÃO (preenchida ao exportar PDF) -->
  <div id="logistics-print-area"></div>
```

- [ ] **Step 2: Validar (Read)**

Confirme que `#logistics-view-modal`, `#logistics-view-body`, `#logistics-export-pdf-btn` e `#logistics-print-area` existem.

---

## Task 3: Render do dossiê, abrir modal e imprimir

**Files:**
- Modify: `app-v2.js`

- [ ] **Step 1: Funções de dossiê, abertura e impressão**

Em `app-v2.js`, adicione (perto das outras funções de logística, ANTES do bloco `if (typeof module !== 'undefined')`):
```javascript
let logisticsViewCurrent = null; // { eventKey, artist }

function fieldsTableHTML(pairs) {
  const rows = pairs.filter(([, v]) => v !== undefined)
    .map(([label, value]) => `<tr><td style="padding:4px 10px; color:var(--text-muted); white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:4px 10px;">${escapeHtml(value || "—")}</td></tr>`).join("");
  return `<table style="width:100%; border-collapse:collapse; font-size:13px;">${rows}</table>`;
}

function logisticsDossierHTML(record, ev) {
  const d = (record && record.data) || {};
  const h = d.hotel || {};
  const hotelPairs = [["Hotel / acomodação", h.nome || ""], ["Endereço", h.endereco || ""],
    ["Check-in", h.checkin || ""], ["Check-out", h.checkout || ""]];
  const evName = ev ? ev.eventName : "";
  const evDate = ev ? formatDate(ev.eventDate) : "";
  return `
    <div class="logi-dossier">
      <p style="margin:0 0 14px; color:var(--text-muted); font-size:13px;">
        <strong style="color:var(--text-main);">${escapeHtml(record.artist || "")}</strong> — ${escapeHtml(evName)} ${evDate ? "(" + evDate + ")" : ""}
      </p>
      <h4 style="margin:10px 0 6px;">Hospedagem principal</h4>${fieldsTableHTML(hotelPairs)}
      <h4 style="margin:16px 0 6px;">Ida</h4>${fieldsTableHTML(legToFields(d.ida))}
      <h4 style="margin:16px 0 6px;">Volta</h4>${fieldsTableHTML(legToFields(d.volta))}
    </div>`;
}

function openLogisticsViewModal(eventKey, artist) {
  const modal = document.getElementById("logistics-view-modal");
  const body = document.getElementById("logistics-view-body");
  if (!modal || !body) return;
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) { showWarningToast("Logística não encontrada."); return; }
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  logisticsViewCurrent = { eventKey, artist };
  document.getElementById("logistics-view-title").textContent = "Roteiro — " + artist;
  body.innerHTML = logisticsDossierHTML(record, ev);
  modal.classList.add("show"); // NÃO adicionar listener de clique-fora: só X/Fechar fecham
}

function printLogistics(eventKey, artist) {
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) return;
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  const area = document.getElementById("logistics-print-area");
  if (!area) return;
  area.innerHTML = `<div class="logi-print-doc">
    <h2 style="margin:0 0 4px;">Roteiro de Viagem</h2>
    ${logisticsDossierHTML(record, ev)}
  </div>`;
  window.print();
}
```

- [ ] **Step 2: Ligar os botões do modal (X / Fechar / Exportar PDF)**

Dentro de `initLogisticsModule`, IMEDIATAMENTE ANTES da `}` que fecha a função, adicione:
```javascript
  const viewModal = document.getElementById("logistics-view-modal");
  if (viewModal) {
    const closeView = () => viewModal.classList.remove("show");
    document.getElementById("close-logistics-view-btn").addEventListener("click", closeView);
    document.getElementById("logistics-view-close-footer-btn").addEventListener("click", closeView);
    document.getElementById("logistics-export-pdf-btn").addEventListener("click", () => {
      if (logisticsViewCurrent) printLogistics(logisticsViewCurrent.eventKey, logisticsViewCurrent.artist);
    });
    // Observação: NÃO há listener de clique fora — o modal só fecha no X/Fechar.
  }
```

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest` (todos passam).

---

## Task 4: Ligar os gatilhos (Tabela de Eventos + Dashboard)

**Files:**
- Modify: `app-v2.js` (`renderEventTable` e `renderLogisticsDashboard`)

- [ ] **Step 1: Ligar o `.logi-view-btn` da Tabela de Eventos**

Em `renderEventTable`, dentro do bloco `if (!isArtist) { ... }` onde se anexam os listeners das linhas (perto de `.delete-btn`), adicione:
```javascript
    document.querySelectorAll(".logi-view-btn").forEach(btn => {
      btn.addEventListener("click", () => openLogisticsViewModal(btn.getAttribute("data-key"), btn.getAttribute("data-artist")));
    });
```

- [ ] **Step 2: Botão "Ver/PDF" nos itens concluídos do dashboard**

Em `renderLogisticsDashboard`, localize a definição de `const actions = st === 'pendente' ? ... : (... Editar ... Desmembrar ...)`. No ramo NÃO-pendente (o `else` do ternário), adicione um botão "Ver/PDF" para status concluída. Substitua o trecho do ramo não-pendente:
```javascript
            : `<button class="btn-secondary logi-edit-btn" data-id="${escapeHtml(rec.id)}">Editar</button>
               <button class="action-icon-btn logi-split-btn" data-id="${escapeHtml(rec.id)}" title="Desmembrar" aria-label="Desmembrar artista">⤴</button>`;
```
por:
```javascript
            : `${st === 'concluida' ? `<button class="btn-secondary logi-view-dash-btn" data-key="${escapeHtml(it.eventKey)}" data-artist="${escapeHtml(it.artist)}">Ver / PDF</button>` : ''}
               <button class="btn-secondary logi-edit-btn" data-id="${escapeHtml(rec.id)}">Editar</button>
               <button class="action-icon-btn logi-split-btn" data-id="${escapeHtml(rec.id)}" title="Desmembrar" aria-label="Desmembrar artista">⤴</button>`;
```
E na seção de anexar listeners (perto de `.logi-edit-btn`/`.logi-split-btn`), adicione:
```javascript
  list.querySelectorAll(".logi-view-dash-btn").forEach(b => b.addEventListener("click", () => openLogisticsViewModal(b.getAttribute("data-key"), b.getAttribute("data-artist"))));
```

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest`.

- [ ] **Step 4: Teste manual**

Login admin → finalize uma logística (Fase 1) → na Tabela de Eventos clique em "Ver Logística" → o modal read-only abre; clicar FORA não fecha; X/Fechar fecham. No dashboard de Logística, item concluído mostra "Ver / PDF".

---

## Task 5: CSS de impressão + do dossiê + bump de versões

**Files:**
- Modify: `style.css`
- Modify: `index.html`

- [ ] **Step 1: Estilos**

Em `style.css`, ao final, adicione:
```css
/* ===== Logística — dossiê e impressão ===== */
#logistics-print-area { display: none; }
.logi-dossier h4 { font-size: 14px; }

@media print {
  body * { visibility: hidden; }
  #logistics-print-area, #logistics-print-area * { visibility: visible; }
  #logistics-print-area {
    display: block !important;
    position: absolute; left: 0; top: 0; width: 100%;
    background: #fff; color: #000; padding: 24px;
  }
  .logi-print-doc h2, .logi-print-doc h4, .logi-print-doc strong, .logi-print-doc p { color: #000 !important; }
  .logi-print-doc td { color: #000 !important; border-bottom: 1px solid #ddd; }
}
```

- [ ] **Step 2: Bump das versões**

Em `index.html`: incremente `app-v2.js?v=N` (N→N+1) e `style.css?v=M` (M→M+1). Use Read para os números atuais; reporte antigos/novos.

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest`.

---

## Task 6: Verificação final (Fase 2)

**Files:** nenhum (QA).

- [ ] **Step 1: Sintaxe e testes**

Run: `node --check app-v2.js && npx jest`
Expected: sem erro; todos os testes passam (inclui `legToFields`).

- [ ] **Step 2: Roteiro manual**

Login admin: abrir "Ver Logística" (Tabela de Eventos) e "Ver / PDF" (dashboard) → modal read-only abre, não fecha ao clicar fora, fecha no X/Fechar. "Exportar PDF" abre a janela de impressão com o roteiro limpo (fundo branco, texto preto) → "Salvar como PDF".

---

## Mapa de arquivos (referência)

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Modal `#logistics-view-modal`, `#logistics-print-area`, bump de versões |
| `app-v2.js` | `legToFields`, `logisticsDossierHTML`, `openLogisticsViewModal`, `printLogistics`, ligação dos botões |
| `style.css` | `@media print` do roteiro + dossiê |
| `__tests__/app.test.js` | Teste de `legToFields` |
