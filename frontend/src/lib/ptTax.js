// Cálculos fiscais Portugal 2026 (Continente)
// Valores oficiais aproximados — sempre confirmar com TOC

// TSU (Segurança Social)
export const TSU_TRABALHADOR = 0.11;      // 11% retido ao trabalhador
export const TSU_PATRONAL = 0.2375;       // 23.75% custo empresa
export const TSU_INDEPENDENTE = 0.214;    // 21.4% (trabalhador independente paga)

// Outros custos empregador
export const SEGURO_AT = 0.0175;          // Acidentes Trabalho — média electrotecnia
export const FCT_FGCT = 0.01;             // Fundo Compensação Trabalho + Garantia

// Impostos
export const IVA_NORMAL = 0.23;
export const IVA_REDUZIDA = 0.06;         // habitações (RITI)
export const IRC_REDUZIDO = 0.17;         // primeiros 25 000 € (PME)
export const IRC_LIMIAR_REDUZIDO = 25000;
export const IRC_NORMAL = 0.21;
export const DERRAMA_MUNICIPAL_LISBOA = 0.015;

// Retenção IRS na fonte para independentes
export const RETENCAO_IRS_RV = 0.25;      // 25% regra geral (Art.º 101 CIRS)

// Base de trabalho padrão
export const DIAS_UTEIS_MES = 22;
export const HORAS_DIA = 8;
export const MESES_ANO = 12;
export const SUBSIDIOS_EXTRA = 2;         // Natal + Férias
export const N_SALARIOS_ANO = 14;         // 12 + Natal + Férias

// Sub. Alimentação — isento até 6€/dia em cartão, 4.77€/dia em dinheiro (2026)
export const SUB_ALIM_ISENTO_CARTAO = 6.0;
export const SUB_ALIM_ISENTO_DINHEIRO = 4.77;
export const SUB_ALIM_DIAS_MES = 22;

// Medicina do Trabalho — custo anual médio
export const MEDICINA_TRABALHO_ANO = 120;

// Retribuição Mínima Mensal Garantida (RMMG) 2026 — Decreto-Lei 139/2025
export const RMMG_2026 = 920;

// ============================================================
// IRS 2026 — Escalões anuais (Continente)
// Fonte: OE 2026 (valores aproximados)
// ============================================================
export const IRS_ESCALOES_2026 = [
  { limit: 8059,   rate: 0.13,  abater: 0        },
  { limit: 12160,  rate: 0.165, abater: 282.06   },
  { limit: 17233,  rate: 0.22,  abater: 950.91   },
  { limit: 22306,  rate: 0.25,  abater: 1468.90  },
  { limit: 28400,  rate: 0.32,  abater: 3030.05  },
  { limit: 41629,  rate: 0.355, abater: 4024.16  },
  { limit: 44987,  rate: 0.435, abater: 7354.48  },
  { limit: 83696,  rate: 0.45,  abater: 8029.28  },
  { limit: Infinity, rate: 0.48, abater: 10540.16 },
];

// Mínimo de existência 2026 — Art.º 70 CIRS
// Garante que o rendimento líquido anual não fica abaixo da RMMG × 14
export const MINIMO_EXISTENCIA = RMMG_2026 * 14; // 12 880€

// ============================================================
// FUNÇÕES
// ============================================================

/**
 * Calcula IRS anual a pagar dado o rendimento anual bruto de trabalho dependente.
 * Aplica Art.º 70 CIRS (Mínimo de Existência) + escalões progressivos.
 * Trabalhadores à RMMG (920€/mês em 2026) ficam ISENTOS de IRS.
 */
export function calcIRSAnual(rendimentoAnual, dependentes = 0) {
  // Art.º 70 CIRS: isenção total até ao mínimo de existência (RMMG × 14)
  if (rendimentoAnual <= MINIMO_EXISTENCIA) return 0;

  let imposto = 0;
  for (const esc of IRS_ESCALOES_2026) {
    if (rendimentoAnual <= esc.limit) {
      imposto = rendimentoAnual * esc.rate - esc.abater;
      break;
    }
  }

  // Dedução por dependente (aprox. 600 € cada em 2026)
  imposto -= dependentes * 600;
  imposto = Math.max(0, imposto);

  // Salvaguarda Art.º 70: líquido nunca abaixo do mínimo de existência
  const liquidoAposIRS = rendimentoAnual - imposto;
  if (liquidoAposIRS < MINIMO_EXISTENCIA) {
    imposto = Math.max(0, rendimentoAnual - MINIMO_EXISTENCIA);
  }

  return imposto;
}

/**
 * Simula contratação — calcula custo TOTAL empresa dado o salário bruto mensal.
 * Base padrão: 14 salários/ano (12 + Natal + Férias).
 */
export function simulaContratacao({
  salarioBrutoMensal,
  subsidioAlimentacaoDia = 6,
  subAlimCartao = true,
  premiosMensais = 0,
  seguroATPct = SEGURO_AT,
}) {
  const s = Number(salarioBrutoMensal) || 0;
  const salarioAnualBase = s * 12;
  const subsidios = s * 2; // Natal + Férias
  const premios = (Number(premiosMensais) || 0) * 12;
  const salarioAnualBruto = salarioAnualBase + subsidios + premios;

  // Custos sobre salário bruto (Natal e Férias TAMBÉM levam TSU)
  const tsuPatronalAnual = salarioAnualBruto * TSU_PATRONAL;
  const seguroATAnual = salarioAnualBruto * seguroATPct;
  const fctFgctAnual = salarioAnualBase * FCT_FGCT; // só sobre base

  // Sub. Alimentação (isento se ≤ 6€ cartão)
  const subAlimIsento = subAlimCartao ? SUB_ALIM_ISENTO_CARTAO : SUB_ALIM_ISENTO_DINHEIRO;
  const subAlimDia = Number(subsidioAlimentacaoDia) || 0;
  const subAlimAnual = subAlimDia * SUB_ALIM_DIAS_MES * 11; // 11 meses (excluindo férias)
  const subAlimExcesso = Math.max(0, subAlimDia - subAlimIsento) * SUB_ALIM_DIAS_MES * 11;
  const tsuSubAlimExcesso = subAlimExcesso * TSU_PATRONAL; // TSU sobre excesso

  const medicinaAnual = MEDICINA_TRABALHO_ANO;

  const custoTotalAnual = salarioAnualBruto + tsuPatronalAnual + seguroATAnual +
                          fctFgctAnual + subAlimAnual + tsuSubAlimExcesso + medicinaAnual;

  const custoMensalMedio = custoTotalAnual / 12;
  // Custo por hora efectiva (22 dias × 8h × 11 meses trabalhados)
  const horasAno = DIAS_UTEIS_MES * HORAS_DIA * 11;
  const custoHora = custoTotalAnual / horasAno;

  // Rendimento líquido do trabalhador
  const irsAnual = calcIRSAnual(salarioAnualBase + subsidios + premios);
  const tsuTrabAnual = (salarioAnualBase + subsidios + premios) * TSU_TRABALHADOR;
  const liquidoAnual = salarioAnualBase + subsidios + premios - irsAnual - tsuTrabAnual;
  const liquidoMensal = liquidoAnual / 14; // recebe 14 vezes por ano
  // Com sub. alimentação (que é líquido, não retido)
  const liquidoMensalTotal = liquidoMensal + (subAlimDia * SUB_ALIM_DIAS_MES);

  return {
    // Entradas
    salarioBrutoMensal: s,
    // Anuais
    salarioAnualBase,
    subsidios,
    premios,
    salarioAnualBruto,
    tsuPatronalAnual,
    seguroATAnual,
    fctFgctAnual,
    subAlimAnual,
    tsuSubAlimExcesso,
    medicinaAnual,
    irsAnual,
    tsuTrabAnual,
    custoTotalAnual,
    liquidoAnual,
    // Mensais
    custoMensalMedio,
    liquidoMensal,
    liquidoMensalTotal,
    custoHora,
    // Rácios úteis
    ratioBrutoCusto: s > 0 ? custoMensalMedio / s : 0,
    ratioLiquidoCusto: liquidoMensalTotal > 0 ? custoMensalMedio / liquidoMensalTotal : 0,
  };
}

/**
 * Bruto anual → líquido anual (trabalhador dependente, sem sub. alim).
 */
export function brutoParaLiquido(brutoMensal, dependentes = 0) {
  const b = Number(brutoMensal) || 0;
  const anualBase = b * 12;
  const subs = b * 2;
  const bAnualTotal = anualBase + subs;

  const irs = calcIRSAnual(bAnualTotal, dependentes);
  const tsu = bAnualTotal * TSU_TRABALHADOR;
  const liqAnual = bAnualTotal - irs - tsu;
  return {
    brutoMensal: b,
    brutoAnual: bAnualTotal,
    irsAnual: irs,
    tsuTrabalhadorAnual: tsu,
    liquidoAnual: liqAnual,
    liquidoMensal: liqAnual / 14,
    taxaEfetiva: bAnualTotal > 0 ? (irs + tsu) / bAnualTotal : 0,
  };
}

/**
 * Líquido mensal desejado → bruto mensal necessário (aproximação iterativa).
 */
export function liquidoParaBruto(liquidoDesejadoMensal, dependentes = 0) {
  const target = Number(liquidoDesejadoMensal) || 0;
  if (target <= 0) return { brutoMensal: 0, ...brutoParaLiquido(0, dependentes) };

  // Estimativa inicial: bruto = líquido × 1.4
  let bruto = target * 1.4;
  for (let i = 0; i < 20; i++) {
    const r = brutoParaLiquido(bruto, dependentes);
    const diff = target - r.liquidoMensal;
    if (Math.abs(diff) < 0.5) return { brutoMensal: bruto, ...r };
    bruto += diff * 1.5; // ajuste
  }
  return { brutoMensal: bruto, ...brutoParaLiquido(bruto, dependentes) };
}

/**
 * Comparação CLT vs Recibo Verde para o mesmo custo empresa.
 */
export function clteVsIndependente({ custoMensalEmpresa }) {
  const custo = Number(custoMensalEmpresa) || 0;

  // ---- Cenário 1: CLT (empregado) ----
  // Descobrimos o bruto mensal que resulta neste custo. Rácio custo/bruto típico ~1.35
  let brutoCLT = custo / 1.35;
  for (let i = 0; i < 20; i++) {
    const sim = simulaContratacao({ salarioBrutoMensal: brutoCLT });
    const diff = custo - sim.custoMensalMedio;
    if (Math.abs(diff) < 1) break;
    brutoCLT += diff * 1.0;
  }
  const simCLT = simulaContratacao({ salarioBrutoMensal: brutoCLT });

  // ---- Cenário 2: Recibo Verde ----
  // Empresa paga fee bruto + IVA (recuperável).
  // Custo real empresa = fee bruto (assumindo IVA deduzido).
  // Independente recebe fee, mas paga IRS retido 25% + TSU 21.4% no final.
  const feeMensal = custo;
  const feeAnual = feeMensal * 12;
  const irsRetido = feeAnual * RETENCAO_IRS_RV; // retido pela empresa
  const tsuIndep = feeAnual * TSU_INDEPENDENTE; // pago pelo trabalhador

  // O IRS retido é adiantamento — o valor final é calculado pelos escalões.
  // Base tributável para independentes: 75% do rendimento (regime simplificado) — Art.º 31 CIRS
  const rendimentoTributavel = feeAnual * 0.75;
  const irsRealAnual = calcIRSAnual(rendimentoTributavel);
  const acertoIRS = irsRetido - irsRealAnual; // se positivo, reembolso

  const liquidoAnualRV = feeAnual - irsRealAnual - tsuIndep;
  const liquidoMensalRV = liquidoAnualRV / 12;

  return {
    custoMensalEmpresa: custo,
    clt: {
      brutoMensal: brutoCLT,
      liquidoMensal: simCLT.liquidoMensalTotal,
      custoAnualEmpresa: simCLT.custoTotalAnual,
      liquidoAnual: simCLT.liquidoAnual + (6 * 22 * 11), // + sub. alim líquido
      detalhe: simCLT,
    },
    rv: {
      feeMensal,
      feeAnual,
      irsRetido,
      tsuIndep,
      irsRealAnual,
      acertoIRS,
      liquidoMensal: liquidoMensalRV,
      liquidoAnual: liquidoAnualRV,
      custoAnualEmpresa: feeAnual, // sem TSU nem AT
    },
    diferencaLiquidoMensal: liquidoMensalRV - simCLT.liquidoMensalTotal,
    recomendacao: liquidoMensalRV > simCLT.liquidoMensalTotal
      ? "Recibo Verde entrega MAIS líquido ao trabalhador — mas atenção à falsa dependência (Art.º 12 CT)."
      : "CLT entrega MAIS líquido + tem estabilidade + benefícios sociais.",
  };
}

/**
 * Cálculo IRC 2026 (empresa) com escalões PME.
 */
export function calcIRC(lucroTributavel, derramaMunicipalPct = DERRAMA_MUNICIPAL_LISBOA) {
  const l = Number(lucroTributavel) || 0;
  if (l <= 0) return { ircBase: 0, derrama: 0, total: 0, taxaEfetiva: 0 };

  let ircBase = 0;
  if (l <= IRC_LIMIAR_REDUZIDO) {
    ircBase = l * IRC_REDUZIDO;
  } else {
    ircBase = IRC_LIMIAR_REDUZIDO * IRC_REDUZIDO + (l - IRC_LIMIAR_REDUZIDO) * IRC_NORMAL;
  }
  const derrama = l * (Number(derramaMunicipalPct) || 0);
  const total = ircBase + derrama;
  return {
    lucroTributavel: l,
    ircBase,
    derrama,
    total,
    taxaEfetiva: total / l,
    lucroAposImposto: l - total,
  };
}

/**
 * Indemnização por despedimento (Art.º 366 CT — despedimento coletivo/extinção posto):
 * 14 dias de retribuição base por cada ano completo de antiguidade (contratos após Out/2013).
 * Máximo 12 salários base OU 240 dias × RMMG (mínimo).
 */
export function calcIndemnizacao({ salarioBrutoMensal, anosAntiguidade }) {
  const s = Number(salarioBrutoMensal) || 0;
  const anos = Number(anosAntiguidade) || 0;
  // 14 dias por ano = 14/30 × salário mensal por ano
  const indemnizacaoBase = (s * 14 / 30) * anos;
  const teto12sal = s * 12;
  const indemnizacao = Math.min(indemnizacaoBase, teto12sal);
  return {
    salarioBrutoMensal: s,
    anosAntiguidade: anos,
    indemnizacaoBase,
    teto12sal,
    indemnizacao,
    formula: `${s.toFixed(2)} × 14/30 × ${anos} = ${indemnizacaoBase.toFixed(2)}€ (teto 12 salários = ${teto12sal.toFixed(2)}€)`,
  };
}

/**
 * Impacto de um aumento salarial.
 */
export function calcAumento({ brutoActual, brutoNovo }) {
  const antes = simulaContratacao({ salarioBrutoMensal: brutoActual });
  const depois = simulaContratacao({ salarioBrutoMensal: brutoNovo });
  return {
    antes,
    depois,
    aumentoBrutoAnual: depois.salarioAnualBruto - antes.salarioAnualBruto,
    aumentoCustoAnualEmpresa: depois.custoTotalAnual - antes.custoTotalAnual,
    aumentoLiquidoAnual: depois.liquidoAnual - antes.liquidoAnual,
    // Ratio: quanto custa à empresa por cada € extra que o trabalhador recebe líquido
    custoEmpresaPorEuroLiquido: (depois.liquidoAnual - antes.liquidoAnual) > 0
      ? (depois.custoTotalAnual - antes.custoTotalAnual) / (depois.liquidoAnual - antes.liquidoAnual)
      : 0,
  };
}
