import {
  Cable,
  CirclePower,
  CookingPot,
  Cpu,
  Fan,
  LampCeiling,
  Lightbulb,
  Microwave,
  Monitor,
  PlugZap,
  Power,
  Refrigerator,
  ShowerHead,
  ToggleRight,
  Tv,
  UtilityPole,
  WashingMachine,
} from 'lucide-react';

export const VISIT_SERVICE_OPTIONS = [
  { key: 'tomada', label: 'Tomada', category: 'Tomadas & comandos', iconKey: 'plug-zap', icon: PlugZap, emoji: '🔌', defaultCircuitType: 'Tomada geral', defaultUsagePoint: 'Sala' },
  { key: 'interruptor', label: 'Interruptor', category: 'Tomadas & comandos', iconKey: 'toggle-right', icon: ToggleRight, emoji: '🎚️', defaultCircuitType: 'Comando', defaultUsagePoint: 'Circulação' },
  { key: 'iluminacao', label: 'Ponto de luz', category: 'Tomadas & comandos', iconKey: 'lamp-ceiling', icon: LampCeiling, emoji: '💡', defaultCircuitType: 'Iluminação', defaultUsagePoint: 'Teto' },
  { key: 'forno', label: 'Forno', category: 'Eletrodomésticos', iconKey: 'cooking-pot', icon: CookingPot, emoji: '🔥', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Cozinha' },
  { key: 'placa', label: 'Placa / fogão', category: 'Eletrodomésticos', iconKey: 'power', icon: Power, emoji: '⚡', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Cozinha' },
  { key: 'microondas', label: 'Micro-ondas', category: 'Eletrodomésticos', iconKey: 'microwave', icon: Microwave, emoji: '📦', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Cozinha' },
  { key: 'frigorifico', label: 'Frigorífico', category: 'Eletrodomésticos', iconKey: 'refrigerator', icon: Refrigerator, emoji: '🧊', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Cozinha' },
  { key: 'maq_roupa', label: 'Máq. lavar roupa', category: 'Eletrodomésticos', iconKey: 'washing-machine', icon: WashingMachine, emoji: '🫧', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Lavandaria' },
  { key: 'maq_loica', label: 'Máq. lavar loiça', category: 'Eletrodomésticos', iconKey: 'washing-machine', icon: WashingMachine, emoji: '🧽', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Cozinha' },
  { key: 'exaustor', label: 'Exaustor', category: 'Eletrodomésticos', iconKey: 'fan', icon: Fan, emoji: '🌬️', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'Cozinha' },
  { key: 'termoacumulador', label: 'Termoacumulador', category: 'Água quente', iconKey: 'shower-head', icon: ShowerHead, emoji: '🚿', defaultCircuitType: 'Circuito dedicado', defaultUsagePoint: 'WC' },
  { key: 'tv_dados', label: 'TV / Dados', category: 'Dados & multimédia', iconKey: 'tv', icon: Tv, emoji: '📺', defaultCircuitType: 'Dados / Telecom', defaultUsagePoint: 'Sala' },
  { key: 'monitorizacao', label: 'Monitor / posto', category: 'Dados & multimédia', iconKey: 'monitor', icon: Monitor, emoji: '🖥️', defaultCircuitType: 'Dados / Telecom', defaultUsagePoint: 'Escritório' },
  { key: 'bastidor', label: 'Bastidor / rack', category: 'Dados & multimédia', iconKey: 'cpu', icon: Cpu, emoji: '🗄️', defaultCircuitType: 'Dados / Telecom', defaultUsagePoint: 'Armário técnico' },
  { key: 'alimentacao_geral', label: 'Alimentação geral', category: 'Infraestrutura', iconKey: 'circle-power', icon: CirclePower, emoji: '🔋', defaultCircuitType: 'Alimentação principal', defaultUsagePoint: 'Quadro' },
  { key: 'cablagem', label: 'Cablagem', category: 'Infraestrutura', iconKey: 'cable', icon: Cable, emoji: '🧵', defaultCircuitType: 'Infraestrutura', defaultUsagePoint: 'Percurso técnico' },
  { key: 'quadro', label: 'Quadro / proteção', category: 'Infraestrutura', iconKey: 'utility-pole', icon: UtilityPole, emoji: '🛡️', defaultCircuitType: 'Proteção', defaultUsagePoint: 'Quadro' },
  { key: 'comando_luz', label: 'Iluminação decorativa', category: 'Tomadas & comandos', iconKey: 'lightbulb', icon: Lightbulb, emoji: '✨', defaultCircuitType: 'Iluminação', defaultUsagePoint: 'Sala' },
];

export const VISIT_CIRCUIT_TYPES = [
  'Circuito dedicado',
  'Tomada geral',
  'Iluminação',
  'Comando',
  'Dados / Telecom',
  'Alimentação principal',
  'Proteção',
  'Infraestrutura',
  'Reserva',
];

export const VISIT_USAGE_POINTS = [
  'Cozinha',
  'Lavandaria',
  'Sala',
  'Quarto',
  'WC',
  'Circulação',
  'Escritório',
  'Armário técnico',
  'Quadro',
  'Exterior',
  'Garagem',
  'Varanda',
];

export const getVisitServiceMeta = (serviceKey) => {
  return VISIT_SERVICE_OPTIONS.find((item) => item.key === serviceKey) || VISIT_SERVICE_OPTIONS[0];
};

export const buildEmptyVisitCircuit = () => {
  const base = VISIT_SERVICE_OPTIONS[0];
  const generatedId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `circuit-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  return {
    id: generatedId,
    icon_key: base.iconKey,
    service_key: base.key,
    description: base.label.toUpperCase(),
    quantity: 1,
    circuit_type: base.defaultCircuitType,
    usage_point: base.defaultUsagePoint,
  };
};