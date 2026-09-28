import { aniversariantesDoMes, diaDaSemana, formatarDia, somarMes } from "@/lib/aniversarios";
import { CONTAGENS, contagensFaltando, diasSemDiario } from "@/lib/contagensFaltando";
import { gerarPdfFechamento } from "@/lib/pdfFechamento";
import { hoje, intervaloDoMes } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
export const diaCurto = (d: string) => `${formatarDia(d).slice(0, 5)} (${diaDaSemana(d)})`;

// O fechamento só pode ser feito do mês atual para trás.
export const mesAtual = () => hoje().slice(0, 7);
export function mesDeFechamento(valor: string | undefined) {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) && valor <= mesAtual() ? valor : mesAtual();
}

// Meses oferecidos na tela: o atual e os 24 anteriores.
export const mesesDisponiveis = () => Array.from({ length: 25 }, (_, i) => somarMes(mesAtual(), -i));

export type DataImportante = { item: string; vencimento: string | null; dias: number | null; situacao: string };

// Situação de uma data importante em relação a hoje (mesma regra da aba Datas importantes da academia).
export function situacaoDaData(dias: number | null) {
  if (dias === null) return "Sem data";
  if (dias < 0) return "Vencido";
  if (dias <= 30) return "Vence em breve";
  return "Em dia";
}

async function datasImportantes(supabase: Supabase, academiaId: string): Promise<DataImportante[]> {
  const { data } = await supabase
    .from("datas_importantes")
    .select("item, vencimento")
    .eq("academia_id", academiaId)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .order("item");
  const agora = Date.parse(`${hoje()}T12:00:00Z`);
  return (data ?? []).map((d) => {
    const dias = d.vencimento ? Math.round((Date.parse(`${d.vencimento}T12:00:00Z`) - agora) / 86400000) : null;
    return { item: d.item as string, vencimento: (d.vencimento as string | null) ?? null, dias, situacao: situacaoDaData(dias) };
  });
}

// Conteúdo do fechamento de uma academia: aniversariantes do mês seguinte, o que ficou sem preencher no
// mês (dias do diário e horários das contagens; no mês atual, só até ontem) e as datas importantes
// (vencimentos contados a partir de hoje, com destaque para os vencidos e os dos próximos 30 dias).
export async function dadosDoFechamento(supabase: Supabase, academiaId: string, mes: string) {
  const proximoMes = somarMes(mes, 1);
  const { inicio, fim } = intervaloDoMes(mes);
  const [aniversariantes, semDiario, contagens, datas] = await Promise.all([
    aniversariantesDoMes(supabase, [academiaId], proximoMes),
    diasSemDiario(supabase, academiaId, inicio, fim),
    contagensFaltando(supabase, [academiaId], { inicio, fim }),
    datasImportantes(supabase, academiaId),
  ]);
  return {
    proximoMes,
    aniversariantes,
    semDiario,
    contagens: contagens.map((c) => ({ data: c.data, contagem: CONTAGENS[c.contagem], horarios: c.horarios })),
    datas,
  };
}

export async function montarFechamento(supabase: Supabase, academia: { id: string; nome: string }, mes: string) {
  const dados = await dadosDoFechamento(supabase, academia.id, mes);
  const pdf = await gerarPdfFechamento({
    academia: academia.nome,
    mesTexto: nomeDoMes(mes),
    secoes: [
      {
        titulo: `Aniversariantes de ${nomeDoMes(dados.proximoMes)}`,
        colunas: [
          { rotulo: "Dia", largura: 110 },
          { rotulo: "Nome", largura: 243 },
          { rotulo: "Departamento", largura: 120 },
          { rotulo: "Idade", largura: 50 },
        ],
        linhas: dados.aniversariantes.map((a) => [diaCurto(a.dia), a.nome, a.departamento, String(a.idade)]),
        vazio: "Nenhum aniversariante no mês (ou sem data de nascimento no cadastro).",
      },
      {
        titulo: "Dias sem lançamento no diário",
        colunas: [{ rotulo: "Dia", largura: 523 }],
        linhas: dados.semDiario.map((d) => [diaCurto(d)]),
        vazio: "Todos os dias do mês foram lançados no diário.",
      },
      {
        titulo: "Contagens não feitas",
        colunas: [
          { rotulo: "Dia", largura: 110 },
          { rotulo: "Contagem", largura: 80 },
          { rotulo: "Horários faltando", largura: 333 },
        ],
        linhas: dados.contagens.map((c) => [diaCurto(c.data), c.contagem, c.horarios.join(", ")]),
        vazio: "Todas as contagens do mês foram feitas.",
      },
      {
        titulo: `Datas importantes - ${dados.datas.filter((d) => d.situacao === "Vencido" || d.situacao === "Vence em breve").length} vencidas ou vencendo em 30 dias; total`,
        colunas: [
          { rotulo: "Item", largura: 213 },
          { rotulo: "Vencimento", largura: 90 },
          { rotulo: "Dias para vencer", largura: 100 },
          { rotulo: "Situação", largura: 120 },
        ],
        linhas: dados.datas.map((d) => [d.item, d.vencimento ? formatarDia(d.vencimento) : "-", d.dias === null ? "-" : String(d.dias), d.situacao]),
        destaques: dados.datas.map((d) => (d.situacao === "Vencido" ? "vermelho" : d.situacao === "Vence em breve" ? "amarelo" : null)),
        vazio: "Nenhuma data importante cadastrada (Academias → unidade → Datas importantes).",
      },
    ],
  });
  return { ...dados, pdf, arquivo: `Fechamento ${academia.nome} ${mes}.pdf` };
}
