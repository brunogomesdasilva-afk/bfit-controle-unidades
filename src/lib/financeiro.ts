// Tipos e utilidades do módulo Financeiro (cadastros, contas a pagar/receber, baixas e extrato).

export type TipoTitulo = "pagar" | "receber";
export type Situacao = "aberto" | "vencido" | "parcial" | "liquidado" | "cancelado";

export type Pessoa = {
  id: string;
  tipo_pessoa: "PF" | "PJ";
  documento: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  cliente: boolean;
  fornecedor: boolean;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  regime_tributario: string | null;
  cnae: string | null;
  email: string | null;
  telefone: string | null;
  contato: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  titular_conta: string | null;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
  categoria_padrao_id: string | null;
  observacoes: string | null;
  ativo: boolean;
};

export type Categoria = { id: string; nome: string; grupo: string; tipo: "receita" | "despesa" | "transferencia"; ativo: boolean };
export type Conta = { id: string; academia_id: string; nome: string; tipo: string; banco: string | null; agencia: string | null; conta: string | null; saldo_inicial: number; data_saldo_inicial: string; ativa: boolean };

export type Titulo = {
  id: string;
  tipo: TipoTitulo;
  academia_id: string;
  pessoa_id: string | null;
  categoria_id: string | null;
  conta_id: string | null;
  descricao: string | null;
  documento: string | null;
  data_emissao: string | null;
  data_registro: string;
  vencimento: string;
  previsao: string | null;
  valor: number;
  parcela: number;
  parcelas: number;
  grupo_parcelas: string | null;
  ret_iss: number;
  ret_irrf: number;
  ret_inss: number;
  ret_pis: number;
  ret_cofins: number;
  ret_csll: number;
  observacoes: string | null;
  cancelado: boolean;
  // da view fin_titulos_situacao
  baixado: number;
  pago: number;
  saldo: number;
  ultima_baixa: string | null;
  situacao: Situacao;
};

export type Baixa = {
  id: string;
  titulo_id: string;
  data: string;
  valor: number;
  juros: number;
  multa: number;
  desconto: number;
  conta_id: string;
  forma: string | null;
  movimento_id: string | null;
  observacoes: string | null;
  criado_em: string;
  criado_por: string | null;
};

export type Movimento = {
  id: string;
  conta_id: string;
  data: string;
  valor: number;
  descricao: string | null;
  pessoa_id: string | null;
  categoria_id: string | null;
  origem: "manual" | "baixa" | "transferencia" | "extrato";
  transferencia_id: string | null;
  conciliado: boolean;
  id_banco: string | null;
};

export const SITUACOES: Record<Situacao, { rotulo: string; cor: string }> = {
  aberto: { rotulo: "A vencer", cor: "bg-sky-100 text-sky-800" },
  vencido: { rotulo: "Vencido", cor: "bg-red-100 text-red-800" },
  parcial: { rotulo: "Baixa parcial", cor: "bg-amber-100 text-amber-900" },
  liquidado: { rotulo: "Liquidado", cor: "bg-emerald-100 text-emerald-800" },
  cancelado: { rotulo: "Cancelado", cor: "bg-slate-200 text-slate-600" },
};

export const FORMAS = ["PIX", "Boleto", "TED/DOC", "Débito automático", "Cartão", "Dinheiro", "Cheque", "Outra"] as const;
export const REGIMES = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real", "Pessoa Física", "Outro"] as const;
export const TIPOS_CONTA_BANCO = ["Corrente", "Aplicação", "Caixa", "Cartão de crédito", "Outra"] as const;

export const reais = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBr = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
export const soNumeros = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
export const nomePessoa = (p: Pick<Pessoa, "nome_fantasia" | "razao_social"> | null | undefined) => (p ? p.nome_fantasia || p.razao_social : "");

export function formatarDocumento(doc: string | null | undefined) {
  const d = soNumeros(doc);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc ?? "";
}

// Dígitos verificadores de CPF e CNPJ.
export function documentoValido(doc: string) {
  const d = soNumeros(doc);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}

// Soma meses a uma data (vencimento das parcelas), mantendo o dia (ou o último dia do mês, se ele não existir).
export function somarMeses(data: string, meses: number) {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
