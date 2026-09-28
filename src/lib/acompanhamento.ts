import type { SupabaseClient } from "@supabase/supabase-js";
import type { Academia } from "@/lib/database.types";
import { TIPOS_MANUTENCAO } from "@/lib/database.types";
import { div, formatar, formatarDia, INDICADORES, moeda, montarPainel, numero, type DadosPainel } from "@/lib/painelDados";
import { gerarPdfFechamento, type SecaoPdf } from "@/lib/pdfFechamento";
import { diasEmAberto } from "@/lib/pendencias";

// Acompanhamento diário: o Painel de uma unidade num PDF (enviado todo dia por e-mail).

function secoes(d: DadosPainel): SecaoPdf[] {
  const m = d.mes;
  const ativos = m.ativos_pagantes;
  const duas = [
    { rotulo: "Número", largura: 300 },
    { rotulo: "Valor", largura: 223 },
  ];
  const tres = (rotulo: string) => [
    { rotulo, largura: 223 },
    { rotulo: "Dia", largura: 100 },
    { rotulo: "Mês", largura: 100 },
    { rotulo: "Ano", largura: 100 },
  ];
  return [
    {
      titulo: "Faturamento", mostrarQuantidade: false,
      colunas: [
        { rotulo: "Dia", largura: 174 },
        { rotulo: "Acumulado no mês", largura: 174 },
        { rotulo: "Acumulado no ano", largura: 175 },
      ],
      linhas: [[moeda(d.dia.faturamento), moeda(m.faturamento), moeda(d.ano.faturamento)]],
      vazio: "",
    },
    {
      titulo: "Números do mês", mostrarQuantidade: false,
      colunas: duas,
      linhas: [
        ["Vendas", `${numero(m.vendas)} (ICV ${formatar(div(m.vendas, m.visitas), "percentual")}, ${numero(m.visitas)} visitas)`],
        ["Ativos pagantes", numero(ativos)],
        ["Inadimplentes", `${numero(m.inadimplentes)} (${formatar(div(m.inadimplentes, ativos), "percentual")})`],
        ["Cancelamentos efetivados / solicitados", `${numero(m.cancelamentos_efetivados)} / ${numero(m.cancelamentos_solicitados)}`],
        ["Churn", formatar(div(m.cancelamentos_efetivados, ativos), "percentual")],
        ["Alunos por professor na sala", numero(d.medias.alunosPorProfessor, 1)],
        ["Média de alunos por aula coletiva", `${numero(d.medias.mediaAlunosColetiva, 1)} (${numero(d.medias.aulasColetivas)} aulas)`],
        ["NPS médio", numero(m.nps, 1)],
        ["Passagens na catraca", numero(m.passagens)],
        ["Gympass", `${numero(m.gympass)} check-ins (${moeda(m.gympass_valor)})`],
      ],
      vazio: "",
    },
    {
      titulo: "Alunos de outras unidades", mostrarQuantidade: false,
      colunas: tres(""),
      linhas: [
        ["Alunos diferentes", numero(d.visitantes.dia.total.alunos), numero(d.visitantes.mes.total.alunos), numero(d.visitantes.ano.total.alunos)],
        ["Passagens", numero(d.visitantes.dia.total.passagens), numero(d.visitantes.mes.total.passagens), numero(d.visitantes.ano.total.passagens)],
      ],
      vazio: "",
    },
    {
      titulo: "Outras unidades no mês, por origem",
      colunas: [
        { rotulo: "Unidade de origem", largura: 323 },
        { rotulo: "Passagens", largura: 100 },
        { rotulo: "Alunos", largura: 100 },
      ],
      linhas: d.visitantes.mes.porOrigem.map((o) => [o.unidade_origem, numero(o.passagens), numero(o.alunos)]),
      vazio: "Nenhuma passagem de outras unidades no mês.",
    },
    {
      titulo: "Visitas não convertidas", mostrarQuantidade: false,
      colunas: tres(""),
      linhas: [["Visitas não convertidas", numero(d.naoConversao.dia.total), numero(d.naoConversao.mes.total), numero(d.naoConversao.ano.total)]],
      vazio: "",
    },
    {
      titulo: "Motivos de não conversão no mês",
      colunas: [
        { rotulo: "Motivo", largura: 423 },
        { rotulo: "Visitas", largura: 100 },
      ],
      linhas: d.naoConversao.mes.motivos.map(([motivo, n]) => [motivo, numero(n)]),
      vazio: "Nenhuma visita não convertida no mês.",
    },
    {
      titulo: "Indicadores", mostrarQuantidade: false,
      colunas: [
        { rotulo: "Indicador", largura: 143 },
        { rotulo: "Dia", largura: 76 },
        { rotulo: "Mês", largura: 76 },
        { rotulo: "Mês anterior", largura: 76 },
        { rotulo: "Ano", largura: 76 },
        { rotulo: "Ano anterior", largura: 76 },
      ],
      linhas: INDICADORES.map((ind) => [
        ind.rotulo,
        ...[d.dia, d.mes, d.mesAnterior, d.ano, d.anoAnterior].map((t) => formatar(ind.valor(t), ind.formato)),
      ]),
      vazio: "",
    },
    {
      titulo: `Compras pendentes (${d.pendencias.comprasAtrasadas} atrasadas)`,
      colunas: [
        { rotulo: "O que é a compra", largura: 423 },
        { rotulo: "Dias em aberto", largura: 100 },
      ],
      linhas: d.pendencias.compras.map((c) => [c.descricao, String(diasEmAberto(c.data_solicitacao))]),
      vazio: "Nenhuma compra pendente.",
    },
    {
      titulo: "Manutenções pendentes",
      colunas: [
        { rotulo: "Tipo", largura: 90 },
        { rotulo: "O que é a manutenção", largura: 333 },
        { rotulo: "Dias em aberto", largura: 100 },
      ],
      linhas: d.pendencias.manutencoes.map((mt) => [TIPOS_MANUTENCAO[mt.tipo], mt.descricao, String(diasEmAberto(mt.data_inclusao))]),
      vazio: "Nenhuma manutenção pendente.",
    },
  ];
}

// Monta o painel da unidade no dia de referência e gera o PDF. "db" é o cliente com a chave de serviço
// (o envio automático não tem usuário logado).
export async function acompanhamentoDiario(db: SupabaseClient, academia: Academia, academias: Academia[], referencia: string) {
  const dados = await montarPainel(db, { unidade: academia.id, referencia, academias, sistema: db });
  const pdf = await gerarPdfFechamento({
    academia: academia.nome,
    mesTexto: "",
    titulo: `Acompanhamento diário - ${academia.nome}`,
    subtitulo: `Referência: ${formatarDia(referencia)}`,
    secoes: secoes(dados),
  });
  return { dados, pdf, arquivo: `Acompanhamento ${academia.nome} ${referencia}.pdf` };
}

// Envia o acompanhamento do dia de referência (padrão: ontem) de cada academia para os usuários ativos dela e
// os administradores. soAdministradores = teste (só os administradores recebem).
export async function enviarAcompanhamento(
  db: SupabaseClient,
  opcoes: { referencia: string; soAdministradores?: boolean; academiaId?: string | null }
) {
  const { enviarEmail, emailConfigurado } = await import("@/lib/email");
  if (!emailConfigurado()) return { enviados: [] as string[], falhas: ["e-mail de envio não configurado"] };
  const { data: todas } = await db.from("academias").select("*").order("nome");
  const academias = (todas ?? []) as Academia[];
  const { data: perfis } = await db.from("profiles").select("email, perfil, academia_id").eq("ativo", true);
  const admins = (perfis ?? []).filter((p) => p.perfil === "admin").map((p) => p.email as string);
  const enviados: string[] = [];
  const falhas: string[] = [];
  for (const academia of academias.filter((a) => !opcoes.academiaId || a.id === opcoes.academiaId)) {
    const para = [
      ...new Set([
        ...admins,
        ...(opcoes.soAdministradores ? [] : (perfis ?? []).filter((p) => p.academia_id === academia.id).map((p) => p.email as string)),
      ]),
    ];
    try {
      const { dados, pdf, arquivo } = await acompanhamentoDiario(db, academia, academias, opcoes.referencia);
      await enviarEmail({
        para,
        assunto: `BFIT · Acompanhamento diário · ${academia.nome} · ${formatarDia(opcoes.referencia)}`,
        texto: [
          `Olá,`,
          ``,
          `Segue em anexo o acompanhamento diário da academia ${academia.nome} (referência ${formatarDia(opcoes.referencia)}).`,
          `- Faturamento do dia: ${moeda(dados.dia.faturamento)}`,
          `- Faturamento no mês: ${moeda(dados.mes.faturamento)}`,
          `- Vendas no mês: ${numero(dados.mes.vendas)}`,
          `- Compras pendentes: ${dados.pendencias.compras.length} · Manutenções pendentes: ${dados.pendencias.manutencoes.length}`,
          ``,
          `Enviado automaticamente pelo sistema BFIT · Controle de unidades.`,
        ].join("\n"),
        anexos: [{ nome: arquivo, conteudo: pdf }],
      });
      enviados.push(`${academia.nome} (${para.length})`);
    } catch (e) {
      falhas.push(`${academia.nome}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  return { enviados, falhas };
}
