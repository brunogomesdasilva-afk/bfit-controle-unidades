"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { consultarCnpj } from "@/lib/consultaCnpj";
import { feriadosDaAcademia, proximoDiaUtil } from "@/lib/diasUteis";
import { documentoValido, soNumeros, somarMeses, type TipoTitulo } from "@/lib/financeiro";
import { data as lerData, hoje, mensagemErro, numero, texto } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../Planilha";

// Ações do módulo Financeiro: cadastros, contas a pagar/receber, baixas (inclusive parciais), extrato e
// conciliação. O acesso por academia é garantido também pelas regras do banco (pode_financeiro).

export type ResultadoFin = { erro?: string; ok?: string; id?: string };

async function acesso() {
  const atual = await getPerfilAtual();
  if (!atual) return { erro: "Sua sessão expirou. Entre novamente." as const };
  if (!temModulo(atual, "financeiro")) return { erro: "Você não tem o módulo Financeiro." as const };
  return { atual, supabase: await createClient() };
}
const atualizar = () => {
  revalidatePath("/financeiro", "layout");
  refresh();
};
const valor = (v: string | undefined) => numero(v);
const centavos = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------------------------------- Clientes e fornecedores

const CAMPOS_PESSOA = [
  "razao_social", "nome_fantasia", "inscricao_estadual", "inscricao_municipal", "regime_tributario", "cnae", "email", "telefone", "contato",
  "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "banco", "agencia", "conta", "tipo_conta", "titular_conta",
  "chave_pix", "tipo_chave_pix", "categoria_padrao_id", "observacoes",
] as const;

export async function salvarPessoa(id: string | null, dados: Record<string, string>): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const documento = soNumeros(dados.documento);
  if (documento && !documentoValido(documento)) return { erro: "CPF/CNPJ inválido: confira os números." };
  const registro: Record<string, string | boolean | null> = {};
  for (const c of CAMPOS_PESSOA) registro[c] = texto(dados[c], c === "observacoes" ? 1000 : 200);
  if (!registro.razao_social) return { erro: "Informe a razão social (ou o nome, se for pessoa física)." };
  registro.documento = documento || null;
  registro.tipo_pessoa = documento.length === 11 ? "PF" : "PJ";
  registro.cliente = dados.cliente === "sim";
  registro.fornecedor = dados.fornecedor === "sim";
  if (!registro.cliente && !registro.fornecedor) return { erro: "Marque se é cliente, fornecedor ou os dois." };
  registro.ativo = dados.ativo !== "nao";
  registro.uf = registro.uf ? String(registro.uf).toUpperCase().slice(0, 2) : null;
  const { data: salvo, error } = id
    ? await a.supabase.from("fin_pessoas").update(registro).eq("id", id).select("id").single()
    : await a.supabase.from("fin_pessoas").insert(registro).select("id").single();
  if (error) return { erro: error.code === "23505" ? "Já existe um cadastro com esse CPF/CNPJ." : mensagemErro(error) };
  atualizar();
  return { ok: "Cadastro salvo.", id: salvo.id };
}

// Dados da Receita para preencher o cadastro pelo CNPJ.
export async function buscarCnpj(cnpj: string) {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const r = await consultarCnpj(cnpj);
  if ("erro" in r) return { erro: r.erro };
  const regime = r.mei.optante ? "MEI" : r.simples.optante ? "Simples Nacional" : null;
  return {
    dados: {
      razao_social: r.razao_social,
      nome_fantasia: r.nome_fantasia ?? "",
      regime_tributario: regime ?? "",
      cnae: r.cnae_principal,
      cidade: r.municipio.split("/")[0] ?? "",
      uf: r.municipio.split("/")[1] ?? "",
      situacao: r.situacao_cadastral,
    },
  };
}

// ------------------------------------------------------------------------------------------- Categorias e contas

export async function salvarGrupo(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const nome = texto(dados.nome, 120);
  if (!nome) return { erro: "Informe o nome do grupo." };
  if (!["receita", "despesa", "transferencia"].includes(dados.tipo)) return { erro: "Escolha o tipo." };
  const registro = { nome, tipo: dados.tipo, ativo: dados.ativo !== "nao" };
  const { error } = id ? await a.supabase.from("fin_grupos").update(registro).eq("id", id) : await a.supabase.from("fin_grupos").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe esse grupo." : mensagemErro(error) };
  // As categorias do grupo acompanham o tipo dele.
  if (id) await a.supabase.from("fin_categorias").update({ tipo: dados.tipo }).eq("grupo_id", id);
  atualizar();
  return {};
}

export async function salvarCategoria(id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const nome = texto(dados.nome, 120);
  if (!nome) return { erro: "Informe o nome da categoria." };
  if (!dados.grupo_id) return { erro: "Escolha o grupo." };
  const { data: grupo } = await a.supabase.from("fin_grupos").select("tipo").eq("id", dados.grupo_id).maybeSingle();
  if (!grupo) return { erro: "Grupo não encontrado." };
  const registro = { nome, grupo_id: dados.grupo_id, tipo: grupo.tipo, ativo: dados.ativo !== "nao" };
  const { error } = id ? await a.supabase.from("fin_categorias").update(registro).eq("id", id) : await a.supabase.from("fin_categorias").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe essa categoria." : mensagemErro(error) };
  atualizar();
  return {};
}

export async function salvarConta(academiaFixa: string | null, id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const academia_id = academiaFixa ?? dados.academia_id;
  const nome = texto(dados.nome, 120);
  if (!academia_id) return { erro: "Escolha a academia." };
  if (!nome) return { erro: "Dê um nome para a conta (ex.: Bradesco Continental)." };
  const saldo = numero(dados.saldo_inicial?.replace(/^-/, ""));
  if (saldo === undefined) return { erro: "Saldo inicial inválido." };
  const negativo = (dados.saldo_inicial ?? "").trim().startsWith("-");
  const dataSaldo = lerData(dados.data_saldo_inicial);
  if (dataSaldo === undefined) return { erro: "Data do saldo inicial inválida." };
  const registro = {
    academia_id,
    nome,
    tipo: dados.tipo || "Corrente",
    banco: texto(dados.banco, 80),
    agencia: texto(dados.agencia, 20),
    conta: texto(dados.conta, 30),
    saldo_inicial: (negativo ? -1 : 1) * (saldo ?? 0),
    data_saldo_inicial: dataSaldo ?? hoje(),
    ativa: dados.ativa !== "nao",
  };
  const { error } = id ? await a.supabase.from("fin_contas").update(registro).eq("id", id) : await a.supabase.from("fin_contas").insert(registro);
  if (error) return { erro: error.code === "23505" ? "Já existe uma conta com esse nome nesta academia." : mensagemErro(error) };
  atualizar();
  return {};
}

// ------------------------------------------------------------------------------------------- Títulos (pagar/receber)

// Inclui (com parcelamento: o valor total é dividido em N parcelas mensais, a diferença de centavos na última)
// ou altera um título.
export async function salvarTitulo(tipo: TipoTitulo, id: string | null, dados: Record<string, string>): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const total = valor(dados.valor);
  if (!total) return { erro: "Informe o valor." };
  const vencimentoDigitado = lerData(dados.vencimento);
  if (!vencimentoDigitado) return { erro: "Informe o vencimento." };
  // Vencimento em sábado, domingo ou feriado vai para o próximo dia útil (também em cada parcela).
  const feriados = await feriadosDaAcademia(a.supabase, dados.academia_id || null);
  const vencimento = proximoDiaUtil(vencimentoDigitado, feriados);
  if (!dados.academia_id) return { erro: "Escolha a academia (projeto)." };
  if (!dados.pessoa_id) return { erro: tipo === "pagar" ? "Escolha o fornecedor." : "Escolha o cliente." };
  if (!dados.categoria_id) return { erro: "Escolha a categoria." };
  const datas = { previsao: lerData(dados.previsao), data_registro: lerData(dados.data_registro) };
  if (Object.values(datas).some((d) => d === undefined)) return { erro: "Alguma data está inválida." };
  const retencoes: Record<string, number> = {};
  for (const r of ["ret_iss", "ret_irrf", "ret_inss", "ret_pis", "ret_cofins", "ret_csll"]) {
    const v = valor(dados[r]);
    if (v === undefined) return { erro: "Valor de retenção inválido." };
    retencoes[r] = v ?? 0;
  }
  const base = {
    tipo,
    academia_id: dados.academia_id,
    pessoa_id: dados.pessoa_id,
    categoria_id: dados.categoria_id,
    conta_id: dados.conta_id || null,
    descricao: texto(dados.descricao, 300),
    documento: texto(dados.documento, 60),
    data_registro: datas.data_registro ?? hoje(),
    observacoes: texto(dados.observacoes, 1000),
    ...retencoes,
  };

  if (id) {
    const { data: atual } = await a.supabase.from("fin_titulos_situacao").select("baixado").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Título não encontrado." };
    if (total < Number(atual.baixado)) return { erro: `O valor não pode ficar menor que o já baixado (${Number(atual.baixado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` };
    const { error } = await a.supabase
      .from("fin_titulos")
      .update({ ...base, valor: total, vencimento, previsao: datas.previsao ?? vencimento })
      .eq("id", id);
    if (error) return { erro: mensagemErro(error) };
    atualizar();
    return { ok: "Título alterado.", id };
  }

  const parcelas = Math.min(Math.max(Number(dados.parcelas) || 1, 1), 120);
  const porParcela = centavos(Math.floor((total / parcelas) * 100) / 100);
  const grupo = parcelas > 1 ? crypto.randomUUID() : null;
  const linhas = Array.from({ length: parcelas }, (_, i) => {
    const venc = proximoDiaUtil(somarMeses(vencimentoDigitado, i), feriados);
    return {
      ...base,
      valor: i === parcelas - 1 ? centavos(total - porParcela * (parcelas - 1)) : porParcela,
      vencimento: venc,
      previsao: i === 0 ? (datas.previsao ?? venc) : venc,
      parcela: i + 1,
      parcelas,
      grupo_parcelas: grupo,
      criado_por: a.atual.id,
    };
  });
  const { data: criados, error } = await a.supabase.from("fin_titulos").insert(linhas).select("id");
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: parcelas > 1 ? `${parcelas} parcelas incluídas.` : "Título incluído.", id: criados?.[0]?.id };
}

// Importar NF, 1º passo quando o emitente não está cadastrado: cadastra o fornecedor com os dados da nota e da
// Receita e a categoria padrão escolhida na tela. Só depois a nota é conferida e lançada.
export type FornecedorDaNota = { documento: string; razao_social: string; nome_fantasia: string | null; regime_tributario: string | null; cnae: string | null; cidade: string | null; uf: string | null };

export async function cadastrarFornecedorDaNota(f: FornecedorDaNota, categoriaId: string): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  if (!categoriaId) return { erro: "Escolha a categoria padrão do fornecedor." };
  const doc = soNumeros(f.documento);
  const { data: existente } = doc ? await a.supabase.from("fin_pessoas").select("id").eq("documento", doc).maybeSingle() : { data: null };
  if (existente) {
    await a.supabase.from("fin_pessoas").update({ categoria_padrao_id: categoriaId, fornecedor: true }).eq("id", existente.id);
    atualizar();
    return { ok: "Fornecedor já estava cadastrado: categoria padrão atualizada.", id: existente.id };
  }
  const regime = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real", "Pessoa Física", "Outro"].includes(f.regime_tributario ?? "") ? f.regime_tributario : null;
  const { data: nova, error } = await a.supabase
    .from("fin_pessoas")
    .insert({
      documento: doc || null,
      tipo_pessoa: doc.length === 11 ? "PF" : "PJ",
      razao_social: texto(f.razao_social, 200) ?? "Fornecedor",
      nome_fantasia: texto(f.nome_fantasia ?? undefined, 200),
      regime_tributario: regime,
      cnae: texto(f.cnae ?? undefined, 200),
      cidade: texto(f.cidade ?? undefined, 100),
      uf: f.uf ? f.uf.toUpperCase().slice(0, 2) : null,
      fornecedor: true,
      categoria_padrao_id: categoriaId,
    })
    .select("id")
    .single();
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: "Fornecedor cadastrado.", id: nova.id };
}

// Lançamento de uma NF importada do PDF (o fornecedor já está cadastrado): cria os títulos a pagar, um por
// parcela, com o PDF anexado. Vencimento fora de dia útil vai para o próximo.
export type NotaParaLancar = {
  academiaId: string;
  fornecedorId: string;
  categoriaId: string;
  contaId: string;
  documento: string;
  descricao: string;
  observacoes: string;
  retencoes: Record<"ret_iss" | "ret_irrf" | "ret_inss" | "ret_pis" | "ret_cofins" | "ret_csll", string>;
  parcelas: { vencimento: string; valor: string }[];
  anexo: string | null;
};

export async function lancarNotaFiscal(n: NotaParaLancar): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  if (!n.academiaId) return { erro: "Escolha a academia." };
  if (!n.categoriaId) return { erro: "Escolha a categoria." };
  if (!n.parcelas.length) return { erro: "Informe o vencimento e o valor (ou as parcelas)." };
  const parcelas = n.parcelas.map((p) => ({ vencimento: lerData(p.vencimento), valor: valor(p.valor) }));
  if (parcelas.some((p) => !p.vencimento || !p.valor)) return { erro: "Toda parcela precisa de vencimento e valor." };
  const retencoes: Record<string, number> = {};
  for (const [k, v] of Object.entries(n.retencoes)) {
    const x = valor(v);
    if (x === undefined) return { erro: "Valor de retenção inválido." };
    retencoes[k] = x ?? 0;
  }

  if (!n.fornecedorId) return { erro: "Cadastre o fornecedor antes de lançar a nota." };
  const pessoaId = n.fornecedorId;
  // Fornecedor já cadastrado sem categoria padrão: passa a ter a desta nota.
  await a.supabase.from("fin_pessoas").update({ categoria_padrao_id: n.categoriaId }).eq("id", pessoaId).is("categoria_padrao_id", null);

  const feriados = await feriadosDaAcademia(a.supabase, n.academiaId);
  const grupo = parcelas.length > 1 ? crypto.randomUUID() : null;
  const linhas = parcelas.map((p, i) => {
    const venc = proximoDiaUtil(p.vencimento!, feriados);
    return {
      tipo: "pagar",
      academia_id: n.academiaId,
      pessoa_id: pessoaId,
      categoria_id: n.categoriaId,
      conta_id: n.contaId || null,
      descricao: texto(n.descricao, 300),
      documento: texto(n.documento, 60),
      data_registro: hoje(),
      vencimento: venc,
      previsao: venc,
      valor: p.valor!,
      parcela: i + 1,
      parcelas: parcelas.length,
      grupo_parcelas: grupo,
      observacoes: texto(n.observacoes, 1000),
      anexo: n.anexo,
      // Retenções ficam só na 1ª parcela (são da nota inteira).
      ...(i === 0 ? retencoes : {}),
      criado_por: a.atual.id,
    };
  });
  const { error } = await a.supabase.from("fin_titulos").insert(linhas);
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: `NF ${n.documento} lançada${parcelas.length > 1 ? ` em ${parcelas.length} parcelas` : ""}${n.fornecedorId ? "" : " (fornecedor cadastrado)"}.` };
}

// Link temporário para abrir o PDF anexado a um título.
export async function linkDoAnexo(caminho: string) {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const { data, error } = await a.supabase.storage.from("pagamentos").createSignedUrl(caminho, 60 * 10);
  return error || !data ? { erro: "Não foi possível abrir o anexo." } : { url: data.signedUrl };
}

export async function cancelarTitulo(id: string, cancelar: boolean): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  if (cancelar) {
    const { count } = await a.supabase.from("fin_baixas").select("id", { count: "exact", head: true }).eq("titulo_id", id);
    if (count) return { erro: "Este título tem baixas. Estorne as baixas antes de cancelar." };
  }
  const { error } = await a.supabase.from("fin_titulos").update({ cancelado: cancelar }).eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: cancelar ? "Título cancelado." : "Título reativado." };
}

// ------------------------------------------------------------------------------------------- Baixas

export type BaixaPedida = { tituloId: string; valor: string; juros?: string; multa?: string; desconto?: string };

// Baixa um ou vários títulos (o mesmo pagamento/recebimento): cada baixa abate o saldo do título e lança no
// extrato da conta (saída no pagar, entrada no receber). Baixa menor que o saldo deixa o título em "baixa parcial".
// "movimentoId": a baixa usa uma linha que já está no extrato (importada do banco), sem lançar outra.
export async function baixarTitulos(
  baixas: BaixaPedida[],
  comum: { data: string; contaId: string; forma: string; observacoes?: string; movimentoId?: string }
): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const data = lerData(comum.data);
  if (!data) return { erro: "Informe a data da baixa." };
  if (!comum.contaId) return { erro: "Escolha a conta." };
  if (!baixas.length) return { erro: "Escolha pelo menos um título." };

  const { data: titulos } = await a.supabase.from("fin_titulos_situacao").select("id, tipo, saldo, situacao, pessoa_id, categoria_id, descricao, documento, parcela, parcelas").in("id", baixas.map((b) => b.tituloId));
  const lidas: { titulo: NonNullable<typeof titulos>[number]; valor: number; juros: number; multa: number; desconto: number }[] = [];
  for (const b of baixas) {
    const t = titulos?.find((x) => x.id === b.tituloId);
    if (!t) return { erro: "Título não encontrado." };
    if (t.situacao === "cancelado" || t.situacao === "liquidado") return { erro: `O título ${t.documento ?? t.descricao ?? ""} está ${t.situacao}.` };
    const v = valor(b.valor);
    const juros = valor(b.juros) ?? 0;
    const multa = valor(b.multa) ?? 0;
    const desconto = valor(b.desconto) ?? 0;
    if (!v || juros === undefined || multa === undefined || desconto === undefined) return { erro: "Algum valor da baixa está inválido." };
    if (centavos(v + desconto) > centavos(Number(t.saldo)) + 0.001)
      return { erro: `A baixa (${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${desconto ? " + desconto" : ""}) é maior que o saldo do título (${Number(t.saldo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` };
    lidas.push({ titulo: t, valor: v, juros, multa, desconto });
  }

  for (const b of lidas) {
    const pago = centavos(b.valor + b.juros + b.multa);
    let movimentoId = comum.movimentoId ?? null;
    if (!movimentoId) {
      const { data: mov, error: erroMov } = await a.supabase
        .from("fin_movimentos")
        .insert({
          conta_id: comum.contaId,
          data,
          valor: b.titulo.tipo === "pagar" ? -pago : pago,
          descricao: [b.titulo.descricao, b.titulo.documento && `NF ${b.titulo.documento}`, b.titulo.parcelas > 1 && `${b.titulo.parcela}/${b.titulo.parcelas}`].filter(Boolean).join(" · ") || null,
          pessoa_id: b.titulo.pessoa_id,
          categoria_id: b.titulo.categoria_id,
          origem: "baixa",
          criado_por: a.atual.id,
        })
        .select("id")
        .single();
      if (erroMov) return { erro: mensagemErro(erroMov) };
      movimentoId = mov.id;
    } else {
      await a.supabase.from("fin_movimentos").update({ pessoa_id: b.titulo.pessoa_id, categoria_id: b.titulo.categoria_id }).eq("id", movimentoId);
    }
    const { error } = await a.supabase.from("fin_baixas").insert({
      titulo_id: b.titulo.id,
      data,
      valor: b.valor,
      juros: b.juros,
      multa: b.multa,
      desconto: b.desconto,
      conta_id: comum.contaId,
      forma: comum.forma || null,
      movimento_id: movimentoId,
      observacoes: texto(comum.observacoes, 500),
      criado_por: a.atual.id,
    });
    if (error) return { erro: mensagemErro(error) };
  }
  atualizar();
  return { ok: lidas.length > 1 ? `${lidas.length} títulos baixados.` : "Baixa registrada." };
}

// Histórico de baixas de um título (para a janela do título).
export async function historicoTitulo(id: string) {
  const a = await acesso();
  if ("erro" in a) return [];
  const { data } = await a.supabase
    .from("fin_baixas")
    .select("id, data, valor, juros, multa, desconto, forma, observacoes, criado_em, conta:fin_contas(nome), movimento:fin_movimentos(conciliado, origem), autor:profiles(nome)")
    .eq("titulo_id", id)
    .order("data");
  return (data ?? []).map((b) => ({
    id: b.id as string,
    data: b.data as string,
    valor: Number(b.valor),
    juros: Number(b.juros),
    multa: Number(b.multa),
    desconto: Number(b.desconto),
    forma: b.forma as string | null,
    observacoes: b.observacoes as string | null,
    conta: (b.conta as unknown as { nome: string } | null)?.nome ?? "",
    conciliado: Boolean((b.movimento as unknown as { conciliado: boolean } | null)?.conciliado),
    autor: (b.autor as unknown as { nome: string } | null)?.nome ?? "",
    criadoEm: b.criado_em as string,
  }));
}

// Estorna uma baixa: o saldo volta para o título e o lançamento sai do extrato (se veio do banco, a linha do
// extrato fica, sem o vínculo).
export async function estornarBaixa(id: string): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const { data: b } = await a.supabase.from("fin_baixas").select("id, movimento_id").eq("id", id).maybeSingle();
  if (!b) return { erro: "Baixa não encontrada." };
  const { data: mov } = b.movimento_id ? await a.supabase.from("fin_movimentos").select("id, origem, conciliado").eq("id", b.movimento_id).maybeSingle() : { data: null };
  const { count } = b.movimento_id ? await a.supabase.from("fin_baixas").select("id", { count: "exact", head: true }).eq("movimento_id", b.movimento_id) : { count: 0 };
  if (mov?.origem === "baixa" && mov.conciliado && (count ?? 0) <= 1) return { erro: "O lançamento desta baixa já foi conciliado no extrato. Desmarque a conciliação antes de estornar." };
  const { error } = await a.supabase.from("fin_baixas").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  if (mov?.origem === "baixa" && (count ?? 0) <= 1) await a.supabase.from("fin_movimentos").delete().eq("id", mov.id);
  atualizar();
  return { ok: "Baixa estornada." };
}

// ------------------------------------------------------------------------------------------- Extrato e conciliação

export async function salvarLancamento(dados: Record<string, string>): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const data = lerData(dados.data);
  const v = valor(dados.valor);
  if (!dados.conta_id) return { erro: "Escolha a conta." };
  if (!data) return { erro: "Informe a data." };
  if (!v) return { erro: "Informe o valor." };
  const registro = {
    conta_id: dados.conta_id,
    data,
    valor: dados.sentido === "saida" ? -v : v,
    descricao: texto(dados.descricao, 300),
    pessoa_id: dados.pessoa_id || null,
    categoria_id: dados.categoria_id || null,
  };
  const { error } = dados.id
    ? await a.supabase.from("fin_movimentos").update(registro).eq("id", dados.id)
    : await a.supabase.from("fin_movimentos").insert({ ...registro, origem: "manual", criado_por: a.atual.id });
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: "Lançamento salvo." };
}

export async function transferir(dados: Record<string, string>): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const data = lerData(dados.data);
  const v = valor(dados.valor);
  if (!dados.origem || !dados.destino || dados.origem === dados.destino) return { erro: "Escolha a conta de origem e a de destino (diferentes)." };
  if (!data || !v) return { erro: "Informe a data e o valor." };
  const { data: categoria } = await a.supabase.from("fin_categorias").select("id").eq("nome", "Transferência entre contas").maybeSingle();
  const transferencia_id = crypto.randomUUID();
  const descricao = texto(dados.descricao, 300) ?? "Transferência entre contas";
  const { error } = await a.supabase.from("fin_movimentos").insert([
    { conta_id: dados.origem, data, valor: -v, descricao, categoria_id: categoria?.id ?? null, origem: "transferencia", transferencia_id, criado_por: a.atual.id },
    { conta_id: dados.destino, data, valor: v, descricao, categoria_id: categoria?.id ?? null, origem: "transferencia", transferencia_id, criado_por: a.atual.id },
  ]);
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: "Transferência lançada nas duas contas." };
}

export async function conciliar(ids: string[], conciliado: boolean): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const { error } = await a.supabase
    .from("fin_movimentos")
    .update({ conciliado, conciliado_em: conciliado ? new Date().toISOString() : null })
    .in("id", ids);
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: conciliado ? `${ids.length} lançamento(s) conciliado(s).` : "Conciliação desfeita." };
}

export async function excluirLancamento(id: string): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const { count } = await a.supabase.from("fin_baixas").select("id", { count: "exact", head: true }).eq("movimento_id", id);
  if (count) return { erro: "Este lançamento é de uma baixa de título. Estorne a baixa no título." };
  const { data: mov } = await a.supabase.from("fin_movimentos").select("transferencia_id").eq("id", id).maybeSingle();
  const { error } = mov?.transferencia_id
    ? await a.supabase.from("fin_movimentos").delete().eq("transferencia_id", mov.transferencia_id)
    : await a.supabase.from("fin_movimentos").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  atualizar();
  return { ok: mov?.transferencia_id ? "Transferência excluída das duas contas." : "Lançamento excluído." };
}

// Importa o extrato do banco (arquivo OFX). Cada linha que bate com um lançamento ainda não conciliado da conta
// (mesmo valor, até 3 dias de diferença) concilia esse lançamento; as que não batem entram no extrato como
// "do banco", para classificar ou baixar um título com elas. Linha já importada antes é ignorada.
export async function importarOfx(contaId: string, conteudo: string): Promise<ResultadoFin> {
  const a = await acesso();
  if ("erro" in a) return { erro: a.erro };
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1);
  if (!blocos.length) return { erro: "Não achei lançamentos no arquivo. Exporte o extrato do banco em OFX (Money)." };
  const campo = (b: string, nome: string) => b.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
  const linhas = blocos
    .map((b) => {
      const d = campo(b, "DTPOSTED");
      return {
        data: d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "",
        valor: Number(campo(b, "TRNAMT").replace(",", ".")),
        id: campo(b, "FITID") || `${d}|${campo(b, "TRNAMT")}|${campo(b, "MEMO")}`,
        descricao: [campo(b, "NAME"), campo(b, "MEMO")].filter(Boolean).join(" · "),
      };
    })
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.data) && Number.isFinite(l.valor) && l.valor !== 0);
  if (!linhas.length) return { erro: "O arquivo não tem lançamentos válidos." };
  const datas = linhas.map((l) => l.data).sort();
  const somar = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const { data: existentes } = await a.supabase
    .from("fin_movimentos")
    .select("id, data, valor, conciliado, id_banco")
    .eq("conta_id", contaId)
    .gte("data", somar(datas[0], -3))
    .lte("data", somar(datas[datas.length - 1], 3));
  const usados = new Set<string>();
  const jaImportados = new Set((existentes ?? []).map((m) => m.id_banco).filter(Boolean));
  let conciliados = 0;
  let novos = 0;
  let repetidos = 0;
  for (const l of linhas) {
    if (jaImportados.has(l.id)) {
      repetidos++;
      continue;
    }
    const par = (existentes ?? [])
      .filter((m) => !m.conciliado && !m.id_banco && !usados.has(m.id) && Math.abs(Number(m.valor) - l.valor) < 0.005 && Math.abs(Date.parse(m.data) - Date.parse(l.data)) <= 3 * 86400000)
      .sort((x, y) => Math.abs(Date.parse(x.data) - Date.parse(l.data)) - Math.abs(Date.parse(y.data) - Date.parse(l.data)))[0];
    if (par) {
      usados.add(par.id);
      await a.supabase.from("fin_movimentos").update({ conciliado: true, conciliado_em: new Date().toISOString(), id_banco: l.id }).eq("id", par.id);
      conciliados++;
    } else {
      const { error } = await a.supabase.from("fin_movimentos").insert({
        conta_id: contaId,
        data: l.data,
        valor: l.valor,
        descricao: l.descricao || null,
        origem: "extrato",
        conciliado: true,
        conciliado_em: new Date().toISOString(),
        id_banco: l.id,
        criado_por: a.atual.id,
      });
      if (error && error.code !== "23505") return { erro: mensagemErro(error) };
      novos++;
    }
  }
  atualizar();
  return {
    ok: `${linhas.length} linhas do extrato: ${conciliados} conciliadas com lançamentos do sistema, ${novos} novas (classifique ou baixe um título com elas)${repetidos ? `, ${repetidos} já importadas antes` : ""}.`,
  };
}
