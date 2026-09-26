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

// Gera (ou refaz) a escala de fins de semana e feriados de hoje até 31/12. Os turnos já passados ficam
// como estão e entram no cálculo das regras (dias seguidos, interjornada, domingos).
export async function gerarEscalaDaUnidade(academiaId: string): Promise<ResultadoEscala> {
  const bloqueio = await semAcesso(academiaId);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const inicio = hoje();
  const fim = `${inicio.slice(0, 4)}-12-31`;
  const setores: Setor[] = ["recepcao", "limpeza"];

  const [{ data: funcionarios }, { data: feriados }, { data: anteriores }] = await Promise.all([
    supabase
      .from("funcionarios")
      .select("id, nome, departamento, genero, horario_entrada, horario_saida")
      .eq("academia_id", academiaId)
      .in("departamento", setores),
    supabase
      .from("feriados")
      .select("data, nome, fechada, academia_id")
      .or(`academia_id.is.null,academia_id.eq.${academiaId}`)
      .gte("data", somarDias(inicio, -21))
      .lte("data", fim),
    supabase
      .from("escala")
      .select("data, setor, inicio, fim, ordem, funcionario_id")
      .eq("academia_id", academiaId)
      .in("setor", setores)
      .gte("data", somarDias(inicio, -21))
      .lt("data", inicio),
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
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: erroApagar } = await supabase
    .from("escala")
    .delete()
    .eq("academia_id", academiaId)
    .in("setor", setores)
    .gte("data", inicio);
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
  return { ok: `Escala gerada: ${atribuicoes.length} turnos até ${fim.split("-").reverse().join("/")}.${faltas}`, avisos };
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
