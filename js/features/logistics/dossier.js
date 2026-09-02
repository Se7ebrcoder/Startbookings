// js/features/logistics/dossier.js — roteiro de viagem: visualização e PDF.
//
// O documento é montado UMA vez e usado nos dois lugares: no modal (como
// pré-visualização em "folha branca") e na impressão. Assim o que a pessoa vê
// na tela é exatamente o que sai no PDF.
//
// Organização: os blocos seguem a ORDEM DA VIAGEM — ida, hospedagem, volta —
// e não a ordem em que os dados foram cadastrados. Quem lê o roteiro está
// viajando e precisa achar rápido "o que vem agora".

import { appState } from '../../core/state.js';
import { escapeHtml } from '../../utils/dom.js';
import { formatDate } from '../../utils/format.js';
import { getLogisticsRecord } from '../../data/logistics.repo.js';
import { showWarningToast } from '../../ui/toast.js';

let logisticsViewCurrent = null; // { eventKey, artist }
export { logisticsViewCurrent };

const MODOS = {
  carro_proprio: 'Carro próprio',
  carro: 'Carro / BlaBlaCar',
  uber: 'Uber',
  taxi: 'Táxi',
  aviao: 'Avião',
  onibus: 'Ônibus',
};

const UF_NOME = {
  AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará',
  DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão',
  MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará',
  PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro',
  RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima',
  SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins',
};

// Monta "Cidade, Estado (UF)". O campo `venue` costuma vir com a UF colada
// ("Garanhuns -PE"), o que gerava "Garanhuns -PE — PE" com o estado repetido.
function localFormatado(ev) {
  if (!ev) return '';
  const uf = String(ev.estado || '').trim().toUpperCase();
  let lugar = String(ev.venue || '').trim();
  if (uf) {
    // remove a UF grudada no fim do venue: "-PE", " - PE", "/PE", ", PE"
    lugar = lugar.replace(new RegExp('[\s,/-]+' + uf + '\s*$', 'i'), '').trim();
  }
  const estado = UF_NOME[uf];
  if (lugar && estado) return `${lugar}, ${estado} (${uf})`;
  if (lugar && uf)     return `${lugar} (${uf})`;
  if (lugar)           return lugar;
  if (estado)          return `${estado} (${uf})`;
  return uf;
}

const vazio = (v) => v === null || v === undefined || String(v).trim() === '';
const txt = (v) => escapeHtml(vazio(v) ? '—' : v);

// Linha de destaque do trecho: o que a pessoa precisa ver de relance.
// O MODO ja aparece no badge do cabecalho, entao o destaque nao o repete —
// ele mostra a informacao operacional: numero do voo, horarios ou trajeto.
function destaqueDoTrecho(leg) {
  if (!leg || !leg.modo) return null;
  const m = leg.modo;

  // Sem detalhes a exibir: nao vale ocupar a faixa de destaque.
  if (m === 'carro_proprio' || m === 'uber') return null;

  const horas = (a, b) => (vazio(a) && vazio(b))
    ? '' : `${vazio(a) ? '—' : escapeHtml(a)} &rarr; ${vazio(b) ? '—' : escapeHtml(b)}`;

  if (m === 'aviao') {
    const voo = [leg.companhia, leg.voo].filter(x => !vazio(x)).join(' ');
    return { principal: escapeHtml(voo || 'Voo a definir'), secundario: horas(leg.partida, leg.chegada) };
  }
  if (m === 'taxi') {
    const trajeto = [leg.origem, leg.destino].filter(x => !vazio(x)).map(escapeHtml).join(' &rarr; ');
    return { principal: trajeto || horas(leg.saida, leg.chegada) || 'Trajeto a definir',
             secundario: trajeto ? horas(leg.saida, leg.chegada) : '' };
  }
  // carro e onibus: o horario e a informacao central
  return { principal: horas(leg.saida, leg.chegada) || 'Horários a definir', secundario: '' };
}

// Pares rótulo/valor de um trecho, já sem os campos que viraram destaque.
function camposDoTrecho(leg) {
  if (!leg || !leg.modo) return [];
  const m = leg.modo;
  if (m === 'carro_proprio' || m === 'uber') return [];
  if (m === 'carro') {
    return [['Ponto de encontro', leg.pontoEncontro], ['Motorista', leg.motoristaNome],
            ['Veículo', leg.carroModelo], ['Placa', leg.placa]];
  }
  if (m === 'taxi') return [['Origem', leg.origem], ['Destino', leg.destino]];
  if (m === 'onibus') return [];
  return [['Localizador', leg.localizador], ['Recepção no destino', leg.recepcaoNome],
          ['Veículo de apoio', leg.veiculoApoio]];
}

function tabelaCampos(pares) {
  const linhas = pares.filter(([, v]) => !vazio(v))
    .map(([r, v]) => `<tr><th>${escapeHtml(r)}</th><td>${txt(v)}</td></tr>`).join('');
  return linhas ? `<table class="rt-campos">${linhas}</table>` : '';
}

// Conexões viram blocos próprios — antes eram espremidas numa linha só.
function blocoConexoes(leg) {
  const cx = (leg && leg.conexoes) || [];
  if (!cx.length) return '';
  const itens = cx.map((c, i) => {
    const pares = [['Espera', c.espera], ['Translado', c.translado]];
    if (c.pernoite) {
      pares.push(['Pernoite', 'Sim'], ['Hotel da escala', c.hotelNome], ['Endereço', c.hotelEndereco]);
    }
    return `<div class="rt-conexao">
      <div class="rt-conexao-topo">Conexão ${i + 1}<span>${txt(c.cidade)}</span></div>
      ${tabelaCampos(pares)}
    </div>`;
  }).join('');
  return `<div class="rt-conexoes"><div class="rt-sub">Conexões / escalas</div>${itens}</div>`;
}

function blocoTrecho(numero, titulo, leg) {
  if (!leg || !leg.modo) {
    return `<section class="rt-bloco">
      <div class="rt-bloco-cab"><span class="rt-num">${numero}</span><h3>${escapeHtml(titulo)}</h3></div>
      <p class="rt-vazio">Trecho não preenchido.</p></section>`;
  }
  const d = destaqueDoTrecho(leg);
  const modo = escapeHtml(MODOS[leg.modo] || leg.modo);
  // O modo vive DENTRO da faixa, como titulo do trecho, com o detalhe
  // (voo/horarios/trajeto) logo abaixo. Antes era um badge solto no
  // cabecalho, longe da informacao a que se refere.
  const faixa = d
    ? `<div class="rt-destaque">
         <div class="rt-destaque-modo">${modo}</div>
         <div class="rt-destaque-info">${d.principal}${d.secundario ? ` <span>${d.secundario}</span>` : ''}</div>
       </div>`
    : `<div class="rt-destaque">
         <div class="rt-destaque-modo">${modo}</div>
         <div class="rt-destaque-info rt-fraco">Transporte direto, sem detalhes a informar.</div>
       </div>`;
  return `<section class="rt-bloco">
    <div class="rt-bloco-cab">
      <span class="rt-num">${numero}</span>
      <h3>${escapeHtml(titulo)}</h3>
    </div>
    ${faixa}
    ${tabelaCampos(camposDoTrecho(leg))}
    ${blocoConexoes(leg)}
  </section>`;
}

function blocoHospedagem(numero, dados) {
  if (dados.temHospedagem === false) {
    return `<section class="rt-bloco">
      <div class="rt-bloco-cab"><span class="rt-num">${numero}</span><h3>Hospedagem</h3></div>
      <p class="rt-vazio">Sem hospedagem vinculada a este evento.</p></section>`;
  }
  const h = dados.hotel || {};
  const temCheck = !vazio(h.checkin) || !vazio(h.checkout);
  // Marcada como "tem hospedagem" mas sem nenhum dado preenchido: mostrar uma
  // faixa de destaque com um travessao solto so polui. Melhor dizer o que falta.
  if (vazio(h.nome) && vazio(h.endereco) && !temCheck) {
    return `<section class="rt-bloco">
      <div class="rt-bloco-cab"><span class="rt-num">${numero}</span><h3>Hospedagem</h3></div>
      <p class="rt-vazio">Hospedagem ainda não informada.</p></section>`;
  }
  return `<section class="rt-bloco">
    <div class="rt-bloco-cab"><span class="rt-num">${numero}</span><h3>Hospedagem</h3></div>
    <div class="rt-destaque">
      <div class="rt-destaque-modo">${txt(h.nome)}</div>
      ${temCheck ? `<div class="rt-destaque-info">check-in ${vazio(h.checkin) ? '—' : escapeHtml(h.checkin)} &middot; check-out ${vazio(h.checkout) ? '—' : escapeHtml(h.checkout)}</div>` : ''}
    </div>
    ${tabelaCampos([['Endereço', h.endereco]])}
  </section>`;
}

// Documento completo — usado tanto na tela quanto na impressão.
export function roteiroDocumentoHTML(record, ev) {
  const d = (record && record.data) || {};
  const nomeEvento = ev ? ev.eventName : '';
  const dataEvento = ev && ev.eventDate ? formatDate(ev.eventDate) : '';
  const local = localFormatado(ev);
  const emitido = new Date().toLocaleDateString('pt-BR');

  return `<article class="rt-doc">
    <header class="rt-cab">
      <img class="rt-logo" src="assets/img/logo-print.png" alt="StartBookings">
      <div class="rt-cab-dir">
        <div class="rt-tipo">Roteiro de Viagem</div>
        <div class="rt-emissao">Emitido em ${escapeHtml(emitido)}</div>
      </div>
    </header>

    <div class="rt-identificacao">
      <div class="rt-artista">${escapeHtml(record.artist || '')}</div>
      <div class="rt-evento">
        ${escapeHtml(nomeEvento)}${dataEvento ? ` <span class="rt-sep">&middot;</span> ${escapeHtml(dataEvento)}` : ''}
      </div>
      ${local ? `<div class="rt-local">${escapeHtml(local)}</div>` : ''}
    </div>

    ${blocoTrecho(1, 'Ida', d.ida)}
    ${blocoHospedagem(2, d)}
    ${blocoTrecho(3, 'Volta', d.volta)}

    <footer class="rt-rodape">
      <strong>Documento confidencial.</strong> Contém a localização e os horários do artista.
      Não encaminhe nem publique. Em caso de dúvida, fale com a produção.
    </footer>
  </article>`;
}

// Mantido para compatibilidade com quem já importava este nome.
export const logisticsDossierHTML = roteiroDocumentoHTML;

export function openLogisticsViewModal(eventKey, artist) {
  const modal = document.getElementById('logistics-view-modal');
  const body = document.getElementById('logistics-view-body');
  if (!modal || !body) return;
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) { showWarningToast('Logística não encontrada.'); return; }
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  logisticsViewCurrent = { eventKey, artist };
  document.getElementById('logistics-view-title').textContent = 'Roteiro — ' + artist;
  // Pré-visualização em folha branca: o que aparece aqui é o que sai no PDF.
  body.innerHTML = `<div class="rt-folha">${roteiroDocumentoHTML(record, ev)}</div>`;
  modal.classList.add('show'); // NÃO adicionar clique-fora: só X/Fechar fecham
}

export function printLogistics(eventKey, artist) {
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) return;
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  const area = document.getElementById('logistics-print-area');
  if (!area) return;
  area.innerHTML = roteiroDocumentoHTML(record, ev);
  window.print();
}
