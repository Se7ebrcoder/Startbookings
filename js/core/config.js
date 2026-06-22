// core/config.js — constantes e rótulos centralizados (sem lógica).

export const DEFAULT_ARTISTS = [];
export const DEFAULT_SELLERS = [];
export const DEFAULT_GOAL = 3500000;
export const DEFAULT_EVENTS = [];

// Versão dos dados em cache; bump força limpeza única do localStorage.
export const SB_DATA_VERSION = "4";

// Rótulos de status do evento (Em negociação / Confirmado / Concluído).
export const STATUS_LABELS = { antes: "Em negociação", durante: "Confirmado", apos: "Concluído" };

export const LOGI_STATUS_LABELS = { pendente: "Logística Pendente", andamento: "Logística em Andamento", concluida: "Concluída" };

// Rótulo do valor conforme o modo de transporte do trecho.
export const COST_LABELS = {
  carro_proprio: "Gasolina",
  carro: "Passagem (BlaBlaCar)",
  uber: "Uber",
  taxi: "Táxi",
  aviao: "Passagem (avião)",
  onibus: "Passagem (ônibus)"
};

// Checklist padrão de um evento novo (7 etapas).
export const DEFAULT_CHECKLIST = [
  { texto: "Iniciar negociação", feito: false },
  { texto: "Escolher artistas", feito: false },
  { texto: "Fechar valores (cachê)", feito: false },
  { texto: "Enviar contrato", feito: false },
  { texto: "Receber sinal", feito: false },
  { texto: "Fazer logísticas dos artistas", feito: false },
  { texto: "Acerto final / pagamento", feito: false }
];

export const CONTRACT_LABELS = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };
export const PAYMENT_LABELS = { pendente: "Pendente", sinal_pago: "Sinal Pago", pago_total: "Totalmente Pago" };

// Paleta vibrante para tags automáticas.
export const VIBRANT_PALETTE = [
  "#af52de", // Purple
  "#0a84ff", // Blue
  "#5e5ce6", // Indigo
  "#30d158", // Green
  "#ff9f0a", // Orange
  "#ff453a", // Red
  "#32ade6"  // Cyan
];

export const MODE_ICONS = {
  carro_proprio: "⛽", carro: "🚗", uber: "🚙", taxi: "🚕", aviao: "✈️", onibus: "🚌"
};

export const LEG_MODES = [["carro_proprio", "Carro próprio"], ["carro", "Carro / BlaBlaCar"], ["uber", "Uber"], ["taxi", "Táxi"], ["aviao", "Avião"], ["onibus", "Ônibus"]];
