import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarEscala, SETORES, setorDoDepartamento, somarDias, type Atribuicao, type Pessoa, type Setor } from "@/lib/escala";
import { hoje, mensagemErro } from "@/lib/planilha";

// Gera (ou refaz) a escala de fins de semana e feriados de UM mês (aaaa-mm) de uma unidade e grava. No mês atual,
// só de hoje em diante (o que já passou fica como está). A escala dos outros meses entra no cálculo das regras na
// virada do mês. Usado pela tela da escala (com o acesso do usuário) e pela geração automática do dia 20 (com a
// chave de serviço). "manterExistente": não refaz o que já está gravado, só preenche os turnos vazios.

export type ResultadoEscala = { erro?: string; ok?: string; avisos?: string[]; trocas?: string[] };

export async function gerarEscalaDoMes(
  supabase: SupabaseClient,
  academiaId: string,
  mes: string,
  {
    indisponiveis = [],
    manterExistente = false,
    criadoPor = null,
    simular = false,
  }: { indisponiveis?: { funcionarioId: string; data: string }[]; manterExistente?: boolean; criadoPor?: string | null; simular?: boolean } = {}
): Promise<ResultadoEscala & { atribuicoes?: Atribuicao[] }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { erro: "Escolha o mês da escala." };
  const dataHoje = hoje();
  if (mes < dataHoje.slice(0, 7)) return { erro: "Não dá para gerar a escala de um mês que já passou." };
  const [ano, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const inicio = `${mes}-01` > dataHoje ? `${mes}-01` : dataHoje;
  const setores = Object.keys(SETORES) as Setor[];
  const departamentos = setores.flatMap((s) => SETORES[s].departamentos);
  const folgas = indisponiveis.filter((i) => i.funcionarioId && i.data >= inicio && i.data <= fim);

  const [{ data: funcionarios }, { data: feriados }, { data: vizinhas }, { data: doPeriodo }] = await Promise.all([
    supabase.from("funcionarios").select("id, nome, departamento, genero, horario_entrada, horario_saida").eq("academia_id", academiaId).eq("ativo", true).in("departamento", departamentos),
    supabase
      .from("feriados")
      .select("data, nome, fechada, academia_id")
      .or(`academia_id.is.null,academia_id.eq.${academiaId}`)
      .gte("data", somarDias(inicio, -21))
      .lte("data", somarDias(fim, 21)),
    supabase
      .from("escala")
      .select("data, setor, inicio, fim, ordem, funcionario_id")
      .eq("academia_id", academiaId)
      .in("setor", setores)
      .gte("data", somarDias(inicio, -21))
      .lte("data", somarDias(fim, 21))
      .or(`data.lt.${inicio},data.gt.${fim}`),
    manterExistente
      ? supabase.from("escala").select("data, setor, inicio, fim, ordem, funcionario_id").eq("academia_id", academiaId).in("setor", setores).gte("data", inicio).lte("data", fim)
      : Promise.resolve({ data: null }),
  ]);

  const pessoas: Pessoa[] = (funcionarios ?? []).map((f) => ({
    id: f.id,
    nome: f.nome,
    setor: setorDoDepartamento(f.departamento)!,
    papel: f.departamento,
    genero: f.genero,
    entrada: f.horario_entrada?.slice(0, 5) ?? null,
    saida: f.horario_saida?.slice(0, 5) ?? null,
  }));
  if (!pessoas.length) return { erro: "Nenhum funcionário de Recepção, Limpeza, Professores ou Estagiário cadastrado nesta unidade." };

  // Feriado da unidade vale no lugar do nacional do mesmo dia (ex.: marcar o Natal como fechado).
  const porData = new Map<string, { data: string; nome: string; fechada: boolean }>();
  for (const f of (feriados ?? []).sort((a, b) => (a.academia_id ? 1 : 0) - (b.academia_id ? 1 : 0))) porData.set(f.data, { data: f.data, nome: f.nome, fechada: f.fechada });
  const paraAtribuicao = (a: { data: string; setor: string; inicio: string; fim: string; ordem: number; funcionario_id: string | null }): Atribuicao => ({
    data: a.data,
    setor: a.setor as Setor,
    inicio: a.inicio.slice(0, 5),
    fim: a.fim.slice(0, 5),
    ordem: a.ordem,
    funcionarioId: a.funcionario_id,
  });
  const manter = manterExistente && doPeriodo?.length ? doPeriodo.map(paraAtribuicao) : undefined;

  const { atribuicoes, avisos, trocas } = gerarEscala({
    inicio,
    fim,
    pessoas,
    feriados: [...porData.values()],
    anteriores: (vizinhas ?? []).map(paraAtribuicao),
    indisponiveis: folgas,
    manter,
  });

  if (simular) return { ok: "simulação", avisos, trocas, atribuicoes };
  const { error: erroApagar } = await supabase.from("escala").delete().eq("academia_id", academiaId).in("setor", setores).gte("data", inicio).lte("data", fim);
  if (erroApagar) return { erro: mensagemErro(erroApagar) };
  if (atribuicoes.length) {
    const { error } = await supabase.from("escala").insert(
      atribuicoes.map((a) => ({ academia_id: academiaId, data: a.data, setor: a.setor, inicio: a.inicio, fim: a.fim, ordem: a.ordem, funcionario_id: a.funcionarioId, criado_por: criadoPor }))
    );
    if (error) return { erro: mensagemErro(error) };
  }

  const faltas = avisos.length ? ` ${avisos.length} ${avisos.length === 1 ? "turno ficou" : "turnos ficaram"} sem pessoa disponível.` : "";
  const textoFolgas = folgas.length ? ` ${folgas.length} folga(s) respeitada(s).` : "";
  const textoTrocas = trocas.length ? ` ${trocas.length} troca(s) para não deixar turno vazio.` : "";
  return {
    ok: `Escala gerada: ${atribuicoes.length} turnos de ${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}.${textoFolgas}${textoTrocas}${faltas}`,
    avisos,
    trocas,
  };
}
