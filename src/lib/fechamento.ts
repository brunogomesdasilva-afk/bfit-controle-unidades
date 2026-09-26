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

// Conteúdo do fechamento de uma academia: aniversariantes do mês seguinte e o que ficou sem preencher no
// mês (dias do diário e horários das contagens; no mês atual, só até ontem).
export async function dadosDoFechamento(supabase: Supabase, academiaId: string, mes: string) {
  const proximoMes = somarMes(mes, 1);
  const { inicio, fim } = intervaloDoMes(mes);
  const [aniversariantes, semDiario, contagens] = await Promise.all([
    aniversariantesDoMes(supabase, [academiaId], proximoMes),
    diasSemDiario(supabase, academiaId, inicio, fim),
    contagensFaltando(supabase, [academiaId], { inicio, fim }),
  ]);
  return {
    proximoMes,
    aniversariantes,
    semDiario,
    contagens: contagens.map((c) => ({ data: c.data, contagem: CONTAGENS[c.contagem], horarios: c.horarios })),
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
    ],
  });
  return { ...dados, pdf, arquivo: `Fechamento ${academia.nome} ${mes}.pdf` };
}
