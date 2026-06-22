// utils/domain.js — regras puras de negócio (sem DOM, sem Supabase, testáveis).
import { formatDate } from './format.js';

export function eventGroupKey(e) {
  return e.groupId || `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
}

export function getLogisticsCost(record) {
  if (!record || !record.data) return 0;
  const d = record.data;
  const v = (x) => parseFloat(x && x.valor) || 0;
  const hotel = d.hotel && d.temHospedagem !== false ? (parseFloat(d.hotel.valor) || 0) : 0;
  return v(d.ida) + v(d.volta) + hotel;
}

// Progresso de uma checklist.
export function checklistProgress(list) {
  const arr = Array.isArray(list) ? list : [];
  return { feitos: arr.filter(i => i && i.feito).length, total: arr.length };
}

// Estado do lembrete de um card: "atrasado" | "chegando" | "nenhum".
export function reminderState(card, hojeStr, antecedenciaDias = 3) {
  const l = card && card.lembrete;
  if (!l || !l.ativo || !l.data) return "nenhum";
  if (l.data < hojeStr) return "atrasado";
  const limite = new Date(hojeStr + "T00:00:00");
  limite.setDate(limite.getDate() + antecedenciaDias);
  const limiteStr = limite.toISOString().slice(0, 10);
  if (l.data <= limiteStr) return "chegando";
  return "nenhum";
}

// Lista os lembretes ligados em estado de alerta, com nome/estado do evento.
export function collectDueReminders(eventCards, events, hojeStr) {
  const out = [];
  (eventCards || []).forEach(card => {
    const st = reminderState(card, hojeStr);
    if (st === "nenhum") return;
    const ev = (events || []).find(e => (e.groupId || "") === card.groupId);
    out.push({
      groupId: card.groupId,
      eventName: ev ? ev.event : card.groupId,
      estado: ev ? (ev.estado || "") : "",
      estado_alerta: st
    });
  });
  return out;
}

export function getPaymentStatus(amount, received) {
  const total = parseFloat(amount) || 0;
  const paid = parseFloat(received) || 0;
  if (paid <= 0) return 'pendente';
  if (total > 0 && paid >= total) return 'pago_total';
  return 'sinal_pago';
}

// Status logístico de um artista: sem registro = 'pendente'.
export function deriveLogisticsStatus(record) {
  if (!record) return 'pendente';
  return record.status || 'andamento';
}

// Converte um trecho (ida/volta) em pares [rótulo, valor] para exibição/PDF.
export function legToFields(leg) {
  if (!leg || !leg.modo) return [];
  const modo = leg.modo;
  if (modo === 'carro_proprio') {
    return [['Transporte', 'Carro próprio']];
  }
  if (modo === 'uber') {
    return [['Transporte', 'Uber']];
  }
  if (modo === 'carro') {
    return [['Transporte', 'Carro / BlaBlaCar'], ['Saída', leg.saida || ''], ['Chegada', leg.chegada || ''],
    ['Ponto de encontro', leg.pontoEncontro || ''], ['Motorista', leg.motoristaNome || ''],
    ['Carro', leg.carroModelo || ''], ['Placa', leg.placa || '']];
  }
  if (modo === 'taxi') {
    return [['Transporte', 'Táxi'], ['Saída', leg.saida || ''], ['Chegada', leg.chegada || ''],
    ['Origem', leg.origem || ''], ['Destino', leg.destino || '']];
  }
  if (modo === 'onibus') {
    return [['Transporte', 'Ônibus'], ['Ida / Volta', leg.saida || ''], ['Chegada', leg.chegada || '']];
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

// Conflito de data de um artista. Recebe `events` por parâmetro (antes lia
// appState.events direto) para permanecer pura/testável.
export function checkArtistDateConflict(events, artist, date, estado, currentEventId = null) {
  if (!artist || !date) return { status: "ok" };
  const conflicts = (events || []).filter(e => e.artist === artist && e.date === date && e.id !== currentEventId);
  if (conflicts.length > 0) {
    const estadoToCompare = (estado || '').toUpperCase();
    const sameStateConflict = conflicts.find(e => estadoToCompare && (e.estado || '').toUpperCase() === estadoToCompare);

    if (sameStateConflict) {
      return { status: "blocked", message: `⛔ ${artist} já tem uma festa no dia ${formatDate(date)} no estado ${estadoToCompare}! Mesmo dia e mesmo estado não é permitido.` };
    } else {
      return { status: "warned", message: `Aviso: ${artist} já tem um evento marcado nesta data em outro estado!` };
    }
  }
  return { status: "ok" };
}
