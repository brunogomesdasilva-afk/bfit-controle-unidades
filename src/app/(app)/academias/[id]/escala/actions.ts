"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { gerarEscala, somarDias, type Pessoa, type Setor } from "@/lib/escala";
import { hoje, mensagemErro, validar } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "../../../Planilha";

export type ResultadoEscala = { erro?: string; ok?: string; avisos?: string[] };

async function semAcesso(academiaId: string) {
  const atual = await getPerfilAtual();
  if (!atual) return "Sua sessão expirou. Entre novamente.";
  if (atual.perfil !== "admin" && atual.academiaId !== academiaId) return "Você só pode alterar a escala da sua unidade.";
  return null;
}

export type OpcoesEscala = { mes: string; indisponiveis: { funcionarioId: string; data: string }[] };

// Gera (ou refaz) a escala de fins de semana e feriados de UM mês (aaaa-mm). No mês atual, só de hoje em
// diante (os turnos que já passaram ficam como estão). A escala dos outros meses não muda e entra no cálculo
// das regras na virada do mês (dias seguidos, interjornada, domingos). "indisponiveis" são folgas pedidas:
// o funcionário não entra na escala naquele dia.
export async function gerarEscalaDaUnidade(academiaId: string, opcoes: OpcoesEscala): Promise<ResultadoEscala> {
  const bloqueio = await semAcesso(academiaId);
  if (bloqueio) return { erro: bloqueio };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(opcoes.mes)) return { erro: "Escolha o mês da escala." };
  const dataHoje = hoje();
  if (opcoes.mes < dataHoje.slice(0, 7)) return { erro: "Não dá para gerar a escala de um mês que já passou." };

  const supabase = await createClient();
  const [ano, m] = opcoes.mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const inicio = `${opcoes.mes}-01` > dataHoje ? `${opcoes.mes}-01` : dataHoje;
  const fim = ultimoDia;
  const setores: Setor[] = ["recepcao", "limpeza"];
  const indisponiveis = opcoes.indisponiveis.filter((i) => i.funcionarioId && i.data >= inicio && i.data <= fim);

  const [{ data: funcionarios }, { data: feriados }, { data: anteriores }] = await Promise.all([
    supabase
      .from("funcionarios")
      .select("id, nome, departamento, genero, horario_entrada, horario_saida")
      .eq("academia_id", academiaId)
      .eq("ativo", true)
      .in("departamento", setores),
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
  ]);

  const pessoas: Pessoa[] = (funcionarios ?? []).map((f) => ({
    id: f.id,
    nome: f.nome,
    setor: f.departamento as Setor,
    genero: f.genero,
    entrada: f.horario_entrada?.slice(0, 5) ?? null,
    saida: f.horario_saida?.slice(0, 5) ?? null,
  }));
  if (!pessoas.some((p) => p.setor === "recepcao") && !pessoas.some((p) => p.setor === "limpeza"))
    return { erro: "Nenhum funcionário de Recepção ou Limpeza cadastrado nesta unidade." };

  // Feriado da unidade vale no lugar do nacional do mesmo dia (ex.: marcar o Natal como fechado).
  const porData = new Map<string, { data: string; nome: string; fechada: boolean }>();
  for (const f of (feriados ?? []).sort((a, b) => (a.academia_id ? 1 : 0) - (b.academia_id ? 1 : 0)))
    porData.set(f.data, { data: f.data, nome: f.nome, fechada: f.fechada });

  const { atribuicoes, avisos } = gerarEscala({
    inicio,
    fim,
    pessoas,
    feriados: [...porData.values()],
    anteriores: (anteriores ?? []).map((a) => ({
      data: a.data,
      setor: a.setor as Setor,
      inicio: a.inicio.slice(0, 5),
      fim: a.fim.slice(0, 5),
      ordem: a.ordem,
      funcionarioId: a.funcionario_id,
    })),
    indisponiveis,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: erroApagar } = await supabase
    .from("escala")
    .delete()
    .eq("academia_id", academiaId)
    .in("setor", setores)
    .gte("data", inicio)
    .lte("data", fim);
  if (erroApagar) return { erro: mensagemErro(erroApagar) };
  if (atribuicoes.length) {
    const { error } = await supabase.from("escala").insert(
      atribuicoes.map((a) => ({
        academia_id: academiaId,
        data: a.data,
        setor: a.setor,
        inicio: a.inicio,
        fim: a.fim,
        ordem: a.ordem,
        funcionario_id: a.funcionarioId,
        criado_por: user?.id,
      }))
    );
    if (error) return { erro: mensagemErro(error) };
  }

  revalidatePath(`/academias/${academiaId}/escala`);
  refresh();
  const faltas = avisos.length ? ` ${avisos.length} ${avisos.length === 1 ? "turno ficou" : "turnos ficaram"} sem pessoa disponível.` : "";
  const folgas = indisponiveis.length ? ` ${indisponiveis.length} folga(s) respeitada(s).` : "";
  return {
    ok: `Escala gerada: ${atribuicoes.length} turnos de ${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}.${folgas}${faltas}`,
    avisos,
  };
}

// Feriados da cidade da unidade (os nacionais já vêm cadastrados).
export async function salvarFeriado(academiaId: string, id: string | null, dados: Record<string, string>): Promise<Resultado> {
  const bloqueio = await semAcesso(academiaId);
  if (bloqueio) return { erro: bloqueio };
  const { registro, erro } = validar(
    [
      { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
      { campo: "nome", rotulo: "Feriado", tipo: "texto", obrigatorio: true },
    ],
    dados
  );
  if (erro || !registro) return { erro };
  const fechada = dados.fechada === "sim";

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("feriados").update({ ...registro, fechada }).eq("id", id)
    : await supabase.from("feriados").insert({ ...registro, fechada, academia_id: academiaId });
  if (error) return { erro: error.code === "23505" ? "Já existe um feriado nesta data para esta unidade." : mensagemErro(error) };
  revalidatePath(`/academias/${academiaId}/escala`);
  refresh();
  return {};
}

export async function excluirFeriado(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("feriados").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };
  refresh();
  return {};
}
