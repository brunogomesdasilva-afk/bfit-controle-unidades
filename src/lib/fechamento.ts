import { aniversariantesDoMes, diaDaSemana, formatarDia, somarMes } from "@/lib/aniversarios";
import { CONTAGENS, contagensFaltando, diasSemDiario } from "@/lib/contagensFaltando";
import { gerarPdfFechamento } from "@/lib/pdfFechamento";
import { COM_CREF } from "@/lib/database.types";
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

// Situação de uma data em relação a hoje: "Vence em breve" dentro da antecedência (30 dias nas datas importantes
// e no CREF, 60 dias nas férias).
export function situacaoDaData(dias: number | null, antecedencia = 30) {
  if (dias === null) return "Sem data";
  if (dias < 0) return "Vencido";
  if (dias <= antecedencia) return "Vence em breve";
  return "Em dia";
}

const diasAte = (d: string | null) => (d ? Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${hoje()}T12:00:00Z`)) / 86400000) : null);
const porVencimento = (a: DataImportante, b: DataImportante) =>
  (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999") || a.item.localeCompare(b.item, "pt-BR");

// Funcionários ativos da unidade: CREF dos professores (sala e coletivas) e limite para tirar férias.
async function prazosDosFuncionarios(supabase: Supabase, academiaId: string) {
  const { data } = await supabase
    .from("funcionarios")
    .select("nome, departamento, cref, cref_vencimento, ferias_limite")
    .eq("academia_id", academiaId)
    .eq("ativo", true);
  const lista = data ?? [];
  const crefs = lista
    .filter((f) => COM_CREF.includes(f.departamento as string))
    .map((f): DataImportante => {
      const dias = diasAte(f.cref_vencimento as string | null);
      return {
        item: f.cref ? `${f.nome} (CREF ${f.cref})` : `${f.nome} (sem número de CREF)`,
        vencimento: (f.cref_vencimento as string | null) ?? null,
        dias,
        situacao: situacaoDaData(dias, 30),
      };
    })
    .sort(porVencimento);
  const ferias = lista
    .map((f): DataImportante => {
      const dias = diasAte(f.ferias_limite as string | null);
      return { item: f.nome as string, vencimento: (f.ferias_limite as string | null) ?? null, dias, situacao: situacaoDaData(dias, 60) };
    })
    .sort(porVencimento);
  return { crefs, ferias };
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
  const [aniversariantes, semDiario, contagens, datas, prazos] = await Promise.all([
    aniversariantesDoMes(supabase, [academiaId], proximoMes),
    diasSemDiario(supabase, academiaId, inicio, fim),
    contagensFaltando(supabase, [academiaId], { inicio, fim }),
    datasImportantes(supabase, academiaId),
    prazosDosFuncionarios(supabase, academiaId),
  ]);
  return {
    proximoMes,
    aniversariantes,
    semDiario,
    contagens: contagens.map((c) => ({ data: c.data, contagem: CONTAGENS[c.contagem], horarios: c.horarios })),
    datas,
    crefs: prazos.crefs,
    ferias: prazos.ferias,
  };
}

// Seção do PDF com vencimentos destacados (vermelho = vencido, amarelo = dentro da antecedência).
function secaoDeVencimentos(titulo: string, rotuloItem: string, linhas: DataImportante[], vazio: string) {
  const urgentes = linhas.filter((d) => d.situacao === "Vencido" || d.situacao === "Vence em breve").length;
  return {
    titulo: `${titulo} - ${urgentes} vencidos ou para vencer; total`,
    colunas: [
      { rotulo: rotuloItem, largura: 213 },
      { rotulo: "Vencimento", largura: 90 },
      { rotulo: "Dias para vencer", largura: 100 },
      { rotulo: "Situação", largura: 120 },
    ],
    linhas: linhas.map((d) => [d.item, d.vencimento ? formatarDia(d.vencimento) : "-", d.dias === null ? "-" : String(d.dias), d.situacao]),
    destaques: linhas.map((d) => (d.situacao === "Vencido" ? "vermelho" : d.situacao === "Vence em breve" ? "amarelo" : null)) as (
      | "vermelho"
      | "amarelo"
      | null
    )[],
    vazio,
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
      secaoDeVencimentos("CREF dos professores (destaque: 30 dias)", "Professor", dados.crefs, "Nenhum professor de sala ou de coletivas ativo."),
      secaoDeVencimentos("Limite para tirar férias (destaque: 60 dias)", "Funcionário", dados.ferias, "Nenhum funcionário ativo."),
    ],
  });
  return { ...dados, pdf, arquivo: `Fechamento ${academia.nome} ${mes}.pdf` };
}
