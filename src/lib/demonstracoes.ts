import type { LinhaBalancete } from "@/lib/balancete";

// Demonstrações gerenciais a partir do balancete da contabilidade: DRE (resultado do período), balanço patrimonial
// (posição no início e no fim) e DFC pelo método indireto (variação das contas entre o início e o fim do período).
// As contas são classificadas pelo grupo (código) e pela descrição, porque o mesmo código pode ter nomes diferentes
// em cada academia (ex.: 3.5.1.05.0091 é "Gás" numa e "Royalties" em outra).

export type Conta = { conta: string; descricao: string; valor: number };
export type Grupo = { chave: string; rotulo: string; valor: number; contas: Conta[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const somar = (contas: Conta[]) => Math.round(contas.reduce((t, c) => t + c.valor, 0) * 100) / 100;

// Só as contas analíticas (as que não têm subcontas), para não somar duas vezes.
export function analiticas(linhas: LinhaBalancete[]) {
  return linhas.filter((l, i) => !linhas.slice(i + 1).some((o) => o.conta.startsWith(`${l.conta}.`)));
}

// ------------------------------------------------------------------------------------------------ DRE

export const GRUPOS_DRE = [
  { chave: "receita", rotulo: "Receita bruta de serviços" },
  { chave: "deducoes", rotulo: "(-) Tributos e cancelamentos sobre a receita" },
  { chave: "pessoal", rotulo: "Pessoal e encargos" },
  { chave: "ocupacao", rotulo: "Ocupação (aluguel, condomínio, IPTU, energia, água, gás)" },
  { chave: "servicos", rotulo: "Serviços de terceiros e manutenção" },
  { chave: "franquia", rotulo: "Franquia (royalties)" },
  { chave: "marketing", rotulo: "Vendas e marketing" },
  { chave: "taxas", rotulo: "Taxas de cartão e meios de pagamento" },
  { chave: "administrativas", rotulo: "Despesas administrativas" },
  { chave: "preoperacionais", rotulo: "Despesas pré-operacionais (não recorrentes)" },
  { chave: "depreciacao", rotulo: "Depreciação e amortização" },
  { chave: "receitas_financeiras", rotulo: "Receitas financeiras" },
  { chave: "despesas_financeiras", rotulo: "Despesas financeiras (juros, tarifas, IOF, multas)" },
  { chave: "outras", rotulo: "Outras receitas e despesas" },
  { chave: "ir_cs", rotulo: "Imposto de renda e contribuição social" },
] as const;
export type ChaveDre = (typeof GRUPOS_DRE)[number]["chave"];
export const DESPESAS_OPERACIONAIS: ChaveDre[] = ["pessoal", "ocupacao", "servicos", "franquia", "marketing", "taxas", "administrativas", "preoperacionais"];

export function grupoDre(conta: string, descricao: string): ChaveDre | null {
  const d = semAcento(descricao);
  if (conta.startsWith("4")) {
    if (/\(-\)|\bI\.?S\.?S\b|\bPIS\b|COFINS|CANCELAMENT|DEVOLU|IMPOSTO|DEDU/.test(d)) return "deducoes";
    if (/FINANCEIR|RENDIMENTO|JUROS/.test(d)) return "receitas_financeiras";
    return conta.startsWith("4.1") ? "receita" : "outras";
  }
  if (!conta.startsWith("3")) return null;
  if (conta.startsWith("3.6") || /IMP(OSTO)? DE RENDA|CONT(RIBUICAO)?\.? SOCIAL|IRPJ|CSLL/.test(d)) return "ir_cs";
  if (/DEPRECIA|AMORTIZA/.test(d)) return "depreciacao";
  if (conta.startsWith("3.5.7")) {
    if (/TAXA DE ADMINISTRA/.test(d)) return "taxas";
    if (conta.startsWith("3.5.7.05") || /RENDIMENTO|GANHO|VARIACAO|DESCONTOS? OBTIDO/.test(d)) return "receitas_financeiras";
    return "despesas_financeiras";
  }
  if (conta.startsWith("3.5.1.01") || /ASSISTENCIA MEDICA|VALE (REFEICAO|TRANSPORTE|ALIMENTACAO)|PRO ?LABORE/.test(d)) return "pessoal";
  if (/ROYALT|FRANQUIA|FUNDO DE PROMO/.test(d)) return "franquia";
  if (/PUBLICIDADE|PROPAGANDA|MARKETING/.test(d)) return "marketing";
  if (/ALUGUE|CONDOMINIO|IPTU|ENERGIA|AGUA|\bGAS\b/.test(d)) return "ocupacao";
  if (/SERVICOS? DE TERCEIROS|MANUTENC|SEGURANCA E VIGIL|MATERIAL DE CONSTRU|LIMPEZA|CONSERVACAO/.test(d)) return "servicos";
  if (/TAXA DE ADMINISTRA|CARTAO.*TAXA|ADQUIR/.test(d)) return "taxas";
  if (/PRE[ -]?OPERAC/.test(d)) return "preoperacionais";
  return "administrativas";
}

export type Dre = {
  grupos: Record<ChaveDre, Grupo>;
  receitaBruta: number;
  receitaLiquida: number;
  despesasOperacionais: number;
  ebitda: number;
  ebit: number;
  resultadoFinanceiro: number;
  lair: number;
  lucro: number;
};

// Resultado do período: movimento das contas de resultado (saldo atual − saldo anterior). Receitas somam, despesas
// (devedoras) entram negativas.
export function montarDre(linhas: LinhaBalancete[]): Dre {
  const grupos = Object.fromEntries(GRUPOS_DRE.map((g) => [g.chave, { ...g, valor: 0, contas: [] as Conta[] }])) as unknown as Record<ChaveDre, Grupo>;
  for (const l of analiticas(linhas)) {
    const chave = grupoDre(l.conta, l.descricao);
    if (!chave) continue;
    const movimento = l.saldo_atual - l.saldo_anterior;
    const valor = l.conta.startsWith("4") ? movimento : -movimento;
    if (Math.abs(valor) < 0.005) continue;
    grupos[chave].contas.push({ conta: l.conta, descricao: l.descricao, valor });
  }
  for (const g of Object.values(grupos)) g.valor = somar(g.contas);
  return totaisDre(grupos);
}

export function totaisDre(grupos: Record<ChaveDre, Grupo>): Dre {
  const v = (c: ChaveDre) => grupos[c].valor;
  const receitaLiquida = v("receita") + v("deducoes");
  const despesasOperacionais = DESPESAS_OPERACIONAIS.reduce((t, c) => t + v(c), 0);
  const ebitda = receitaLiquida + despesasOperacionais;
  const ebit = ebitda + v("depreciacao");
  const resultadoFinanceiro = v("receitas_financeiras") + v("despesas_financeiras");
  const lair = ebit + resultadoFinanceiro + v("outras");
  return { grupos, receitaBruta: v("receita"), receitaLiquida, despesasOperacionais, ebitda, ebit, resultadoFinanceiro, lair, lucro: lair + v("ir_cs") };
}

// ------------------------------------------------------------------------------------------------ Balanço

export const GRUPOS_BALANCO = [
  { chave: "disponivel", rotulo: "Caixa, bancos e aplicações", lado: "ativo", bloco: "Ativo circulante" },
  { chave: "receber", rotulo: "Contas a receber (cartões e clientes)", lado: "ativo", bloco: "Ativo circulante" },
  { chave: "creditos", rotulo: "Adiantamentos e impostos a recuperar", lado: "ativo", bloco: "Ativo circulante" },
  { chave: "socios_ativo", rotulo: "Adiantamentos a sócios e empresas do grupo", lado: "ativo", bloco: "Ativo circulante" },
  { chave: "investimentos", rotulo: "Investimentos", lado: "ativo", bloco: "Ativo não circulante" },
  { chave: "imobilizado", rotulo: "Imobilizado (equipamentos, benfeitorias, móveis)", lado: "ativo", bloco: "Ativo não circulante" },
  { chave: "intangivel", rotulo: "Intangível (franquia)", lado: "ativo", bloco: "Ativo não circulante" },
  { chave: "emprestimos_cp", rotulo: "Empréstimos, financiamentos e saldo negativo em banco", lado: "passivo", bloco: "Passivo circulante" },
  { chave: "fornecedores", rotulo: "Fornecedores e contas a pagar", lado: "passivo", bloco: "Passivo circulante" },
  { chave: "pessoal", rotulo: "Salários, encargos e provisões trabalhistas", lado: "passivo", bloco: "Passivo circulante" },
  { chave: "impostos", rotulo: "Impostos e contribuições a recolher", lado: "passivo", bloco: "Passivo circulante" },
  { chave: "adiantamentos_clientes", rotulo: "Receitas antecipadas (Gympass e clientes)", lado: "passivo", bloco: "Passivo circulante" },
  { chave: "socios_passivo", rotulo: "Sócios e empresas do grupo", lado: "passivo", bloco: "Passivo circulante" },
  { chave: "emprestimos_lp", rotulo: "Empréstimos e financiamentos de longo prazo", lado: "passivo", bloco: "Passivo não circulante" },
  { chave: "lucros_distribuir", rotulo: "Lucros a distribuir aos sócios", lado: "passivo", bloco: "Passivo não circulante" },
  { chave: "capital", rotulo: "Capital social (menos o a integralizar)", lado: "passivo", bloco: "Patrimônio líquido" },
  { chave: "reservas", rotulo: "Lucros acumulados, reservas e distribuições", lado: "passivo", bloco: "Patrimônio líquido" },
  { chave: "resultado", rotulo: "Resultado do ano (ainda não encerrado)", lado: "passivo", bloco: "Patrimônio líquido" },
] as const;
export type ChaveBalanco = (typeof GRUPOS_BALANCO)[number]["chave"];

export function grupoBalanco(conta: string, descricao: string): ChaveBalanco | null {
  const d = semAcento(descricao);
  if (conta.startsWith("1")) {
    if (conta.startsWith("1.1.1")) return "disponivel";
    if (conta.startsWith("1.1.2")) return "receber";
    if (conta.startsWith("1.1.3.02")) return "socios_ativo";
    if (conta.startsWith("1.1")) return "creditos";
    if (conta.startsWith("1.2.2")) return "investimentos";
    if (conta.startsWith("1.2.4") || /INTANGIV|FRANQUIA/.test(d)) return "intangivel";
    return "imobilizado";
  }
  if (!conta.startsWith("2")) return null;
  if (conta.startsWith("2.3")) return conta.startsWith("2.3.1.01") ? "capital" : "reservas";
  if (conta.startsWith("2.2")) return /RESERVA DE LUCRO|LUCROS? A DISTRIBUIR/.test(d) ? "lucros_distribuir" : "emprestimos_lp";
  if (conta.startsWith("2.1.1.01") || conta.startsWith("2.1.1.02") || /SALDO (BANCO )?NEGATIVO|SALDO CREDOR BANCO|CONTA GARANTIDA/.test(d)) return "emprestimos_cp";
  if (/ADIANTAMENTO (GYMPASS|DE CLIENTE|CLIENTE)|RECEITA .*DIFERIDA/.test(d)) return "adiantamentos_clientes";
  if (conta.startsWith("2.1.1.05")) return "fornecedores";
  if (conta.startsWith("2.1.1.10") || conta.startsWith("2.1.1.11") || conta.startsWith("2.1.1.30")) return "pessoal";
  if (conta.startsWith("2.1.1.15")) return "impostos";
  if (conta.startsWith("2.1.1.31") || conta.startsWith("2.1.5")) return "socios_passivo";
  return "fornecedores";
}

export type Balanco = {
  grupos: Record<ChaveBalanco, Grupo>;
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativo: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  patrimonio: number;
  passivo: number;
};

// Posição no início ("anterior") ou no fim ("atual") do período. O resultado do ano ainda não encerrado
// entra no patrimônio, para o balanço fechar (ativo = passivo + patrimônio).
export function montarBalanco(linhas: LinhaBalancete[], momento: "anterior" | "atual"): Balanco {
  const campo = momento === "atual" ? "saldo_atual" : "saldo_anterior";
  const grupos = Object.fromEntries(GRUPOS_BALANCO.map((g) => [g.chave, { chave: g.chave, rotulo: g.rotulo, valor: 0, contas: [] as Conta[] }])) as unknown as Record<ChaveBalanco, Grupo>;
  for (const l of analiticas(linhas)) {
    const chave = grupoBalanco(l.conta, l.descricao);
    if (!chave || Math.abs(l[campo]) < 0.005) continue;
    grupos[chave].contas.push({ conta: l.conta, descricao: l.descricao, valor: l[campo] });
  }
  const total = (c: string) => linhas.find((l) => l.conta === c)?.[campo] ?? 0;
  const resultado = total("4") - total("3");
  if (Math.abs(resultado) >= 0.005) grupos.resultado.contas.push({ conta: "", descricao: "Receitas − despesas do ano até a data", valor: resultado });
  for (const g of Object.values(grupos)) g.valor = somar(g.contas);
  return totaisBalanco(grupos);
}

export function totaisBalanco(grupos: Record<ChaveBalanco, Grupo>): Balanco {
  const soma = (bloco: string) => GRUPOS_BALANCO.filter((g) => g.bloco === bloco).reduce((t, g) => t + grupos[g.chave].valor, 0);
  const ativoCirculante = soma("Ativo circulante");
  const ativoNaoCirculante = soma("Ativo não circulante");
  const passivoCirculante = soma("Passivo circulante");
  const passivoNaoCirculante = soma("Passivo não circulante");
  const patrimonio = soma("Patrimônio líquido");
  return {
    grupos,
    ativoCirculante,
    ativoNaoCirculante,
    ativo: ativoCirculante + ativoNaoCirculante,
    passivoCirculante,
    passivoNaoCirculante,
    patrimonio,
    passivo: passivoCirculante + passivoNaoCirculante + patrimonio,
  };
}

// ------------------------------------------------------------------------------------------------ DFC (indireto)

export const GRUPOS_DFC = [
  { chave: "lucro", rotulo: "Lucro líquido do período", atividade: "operacional" },
  { chave: "depreciacao", rotulo: "(+) Depreciação e amortização", atividade: "operacional" },
  { chave: "receber", rotulo: "Contas a receber (cartões e clientes)", atividade: "operacional" },
  { chave: "creditos", rotulo: "Adiantamentos e impostos a recuperar", atividade: "operacional" },
  { chave: "fornecedores", rotulo: "Fornecedores e contas a pagar", atividade: "operacional" },
  { chave: "pessoal", rotulo: "Salários, encargos e provisões trabalhistas", atividade: "operacional" },
  { chave: "impostos", rotulo: "Impostos a recolher (inclui IR e CS provisionados)", atividade: "operacional" },
  { chave: "adiantamentos_clientes", rotulo: "Receitas antecipadas (Gympass e clientes)", atividade: "operacional" },
  { chave: "imobilizado", rotulo: "Compra de equipamentos, benfeitorias e móveis", atividade: "investimento" },
  { chave: "investimentos", rotulo: "Investimentos e intangível", atividade: "investimento" },
  { chave: "emprestimos", rotulo: "Empréstimos e financiamentos (captação − pagamento)", atividade: "financiamento" },
  { chave: "socios", rotulo: "Sócios e empresas do grupo (adiantamentos e repasses)", atividade: "financiamento" },
  { chave: "distribuicao", rotulo: "Distribuição de lucros e movimentos do patrimônio", atividade: "financiamento" },
] as const;
export type ChaveDfc = (typeof GRUPOS_DFC)[number]["chave"];

const DFC_DO_BALANCO: Partial<Record<ChaveBalanco, ChaveDfc>> = {
  receber: "receber",
  creditos: "creditos",
  fornecedores: "fornecedores",
  pessoal: "pessoal",
  impostos: "impostos",
  adiantamentos_clientes: "adiantamentos_clientes",
  imobilizado: "imobilizado",
  investimentos: "investimentos",
  intangivel: "investimentos",
  emprestimos_cp: "emprestimos",
  emprestimos_lp: "emprestimos",
  socios_ativo: "socios",
  socios_passivo: "socios",
  lucros_distribuir: "distribuicao",
  capital: "distribuicao",
  reservas: "distribuicao",
};

export type Dfc = {
  grupos: Record<ChaveDfc, Grupo>;
  operacional: number;
  investimento: number;
  financiamento: number;
  variacaoCaixa: number;
  caixaInicial: number;
  caixaFinal: number;
  diferenca: number;
};

// Fluxo de caixa do período: lucro + depreciação + variação do capital de giro (operacional), compras de ativo
// (investimento) e empréstimos, sócios e distribuições (financiamento). Aumento de ativo consome caixa; aumento de
// passivo gera caixa. A soma tem de bater com a variação de caixa, bancos e aplicações.
export function montarDfc(linhas: LinhaBalancete[]): Dfc {
  const dre = montarDre(linhas);
  const grupos = Object.fromEntries(GRUPOS_DFC.map((g) => [g.chave, { chave: g.chave, rotulo: g.rotulo, valor: 0, contas: [] as Conta[] }])) as unknown as Record<ChaveDfc, Grupo>;
  grupos.lucro.contas.push({ conta: "", descricao: "Lucro líquido da DRE", valor: dre.lucro });
  if (dre.grupos.depreciacao.valor) grupos.depreciacao.contas.push({ conta: "", descricao: "Depreciação e amortização da DRE", valor: -dre.grupos.depreciacao.valor });
  let caixaInicial = 0;
  let caixaFinal = 0;
  for (const l of analiticas(linhas)) {
    const chave = grupoBalanco(l.conta, l.descricao);
    if (!chave) continue;
    if (chave === "disponivel") {
      caixaInicial += l.saldo_anterior;
      caixaFinal += l.saldo_atual;
      continue;
    }
    const dfc = DFC_DO_BALANCO[chave];
    if (!dfc) continue;
    // Contas de depreciação acumulada (redutoras do imobilizado) não são compra nem venda: já entraram pela DRE.
    if (chave === "imobilizado" && /DEPRECIA|AMORTIZA/.test(semAcento(l.descricao))) continue;
    const variacao = l.saldo_atual - l.saldo_anterior;
    const efeito = l.conta.startsWith("1") ? -variacao : variacao;
    if (Math.abs(efeito) < 0.005) continue;
    grupos[dfc].contas.push({ conta: l.conta, descricao: l.descricao, valor: efeito });
  }
  for (const g of Object.values(grupos)) g.valor = somar(g.contas);
  return totaisDfc(grupos, caixaInicial, caixaFinal);
}

export function totaisDfc(grupos: Record<ChaveDfc, Grupo>, caixaInicial: number, caixaFinal: number): Dfc {
  const soma = (atividade: string) => GRUPOS_DFC.filter((g) => g.atividade === atividade).reduce((t, g) => t + grupos[g.chave].valor, 0);
  const operacional = soma("operacional");
  const investimento = soma("investimento");
  const financiamento = soma("financiamento");
  const variacaoCaixa = operacional + investimento + financiamento;
  return {
    grupos,
    operacional,
    investimento,
    financiamento,
    variacaoCaixa,
    caixaInicial,
    caixaFinal,
    diferenca: Math.round((caixaFinal - caixaInicial - variacaoCaixa) * 100) / 100,
  };
}

// ------------------------------------------------------------------------------------------------ Somas

// Soma grupos de várias demonstrações (meses do ano ou academias), juntando as contas pela descrição.
export function somarGrupos<K extends string>(lista: Record<K, Grupo>[]): Record<K, Grupo> {
  const base = lista[0];
  const resultado = {} as Record<K, Grupo>;
  for (const chave of Object.keys(base) as K[]) {
    const contas = new Map<string, Conta>();
    for (const g of lista) for (const c of g[chave].contas) {
      const k = semAcento(c.descricao);
      const atual = contas.get(k);
      contas.set(k, atual ? { ...atual, valor: atual.valor + c.valor } : { ...c });
    }
    const lista2 = [...contas.values()].filter((c) => Math.abs(c.valor) >= 0.005);
    resultado[chave] = { ...base[chave], contas: lista2, valor: somar(lista2) };
  }
  return resultado;
}
