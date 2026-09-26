"use server";

import { refresh, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensagemErro, validar, verificarAcesso, type CampoValidado } from "@/lib/planilha";
import type { Resultado } from "./Planilha";

// Lançamentos por academia e por dia (vendas e frequência).
// Campos que o usuário preenche em cada controle. Os cinza (ICV, churn, previsão de churn)
// são calculados pelo banco e nunca chegam aqui.
const CAMPOS: Record<Tabela, CampoValidado[]> = {
  controle_diario: [
    { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    { campo: "ativos_pagantes", rotulo: "Ativos pag.", tipo: "inteiro" },
    { campo: "visitas", rotulo: "Visitas", tipo: "inteiro" },
    { campo: "vendas", rotulo: "Vendas", tipo: "inteiro" },
    { campo: "inadimplentes", rotulo: "Inadimplentes", tipo: "inteiro" },
    { campo: "faturamento", rotulo: "Faturamento", tipo: "decimal" },
    { campo: "cancelamentos_solicitados", rotulo: "Canc. solic.", tipo: "inteiro" },
    { campo: "cancelamentos_efetivados", rotulo: "Canc. efet.", tipo: "inteiro" },
    { campo: "nps", rotulo: "NPS", tipo: "decimal" },
    { campo: "neoassist", rotulo: "Neoassist", tipo: "inteiro" },
    { campo: "vendas_site", rotulo: "Vendas site", tipo: "inteiro" },
  ],
  controle_conversao: [
    { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    { campo: "visita", rotulo: "Visita", tipo: "texto", obrigatorio: true },
    { campo: "motivo", rotulo: "Motivo da não conversão", tipo: "texto" },
  ],
  contagem_sala: [
    { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true },
    { campo: "musculacao", rotulo: "Musculação", tipo: "inteiro", obrigatorio: true },
    { campo: "cardio", rotulo: "Cardio", tipo: "inteiro", obrigatorio: true },
    { campo: "professores", rotulo: "Qtd. de professores", tipo: "inteiro" },
  ],
  contagem_coletivas: [
    { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true },
    { campo: "professor", rotulo: "Professor", tipo: "texto" },
    { campo: "professor_substituto", rotulo: "Professor substituto", tipo: "texto" },
    { campo: "modalidade", rotulo: "Modalidade", tipo: "texto" },
    { campo: "quantidade", rotulo: "Quantidade", tipo: "inteiro", obrigatorio: true },
  ],
  contagem_lutas: [
    { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true },
    { campo: "professor", rotulo: "Professor", tipo: "texto" },
    { campo: "professor_substituto", rotulo: "Professor substituto", tipo: "texto" },
    { campo: "modalidade", rotulo: "Modalidade", tipo: "texto" },
    { campo: "quantidade", rotulo: "Quantidade", tipo: "inteiro", obrigatorio: true },
  ],
};

type Tabela =
  | "controle_diario"
  | "controle_conversao"
  | "contagem_sala"
  | "contagem_coletivas"
  | "contagem_lutas";

// Tabelas em que todo dia deve ter lançamento (inclusive fim de semana). Coletivas e lutas não entram:
// nem todo dia tem aula.
const TODO_DIA: Tabela[] = ["controle_diario", "contagem_sala"];

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const somarDia = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Lembrete ao incluir: dias entre o último lançamento anterior e a data incluída que ficaram sem
// lançamento (feriados com a academia fechada não contam).
async function diasFaltando(supabase: Awaited<ReturnType<typeof createClient>>, tabela: Tabela, academiaId: string, data: string) {
  const { data: anterior } = await supabase
    .from(tabela)
    .select("data")
    .eq("academia_id", academiaId)
    .lt("data", data)
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!anterior) return null;
  const inicio = somarDia(anterior.data as string, 1);
  if (inicio >= data) return null;
  const { data: fechados } = await supabase
    .from("feriados")
    .select("data, academia_id")
    .eq("fechada", true)
    .gte("data", inicio)
    .lt("data", data);
  const fechado = new Set(
    (fechados ?? []).filter((f) => f.academia_id === null || f.academia_id === academiaId).map((f) => f.data as string)
  );
  const faltam: string[] = [];
  for (let d = inicio; d < data; d = somarDia(d, 1)) if (!fechado.has(d)) faltam.push(d);
  if (faltam.length === 0) return null;
  const semana = (d: string) => DIAS_DA_SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()];
  if (faltam.length === 1) return `Lembrete: o dia ${diaMes(faltam[0])} (${semana(faltam[0])}) está faltando.`;
  if (faltam.length <= 7)
    return `Lembrete: os dias ${faltam.slice(0, -1).map(diaMes).join(", ")} e ${diaMes(faltam.at(-1)!)} estão faltando.`;
  return `Lembrete: faltam ${faltam.length} dias, de ${diaMes(faltam[0])} a ${diaMes(faltam.at(-1)!)}.`;
}

// Telas atualizadas depois de cada gravação.
const PAGINAS = ["/vendas", "/frequencia"];

// A academia vem da aba aberta (presa ao botão da planilha); numa alteração ela não muda.
async function gravar(
  tabela: Tabela,
  academiaId: string,
  id: string | null,
  dados: Record<string, string>
): Promise<Resultado> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };

  const { registro, erro } = validar(CAMPOS[tabela], dados);
  if (erro || !registro) return { erro };
  // Coletivas e lutas: o professor pode ficar em branco só quando há professor substituto.
  if ((tabela === "contagem_coletivas" || tabela === "contagem_lutas") && !registro.professor && !registro.professor_substituto)
    return { erro: "Preencha o professor ou o professor substituto." };

  const supabase = await createClient();

  // Contagem repetida: o mesmo horário (e, em coletivas e lutas, a mesma modalidade) no mesmo dia.
  if (tabela === "contagem_sala" || tabela === "contagem_coletivas" || tabela === "contagem_lutas") {
    let repetida = supabase
      .from(tabela)
      .select("id")
      .eq("academia_id", academiaId)
      .eq("data", String(registro.data))
      .eq("horario", String(registro.horario))
      .limit(1);
    if (tabela !== "contagem_sala")
      repetida = registro.modalidade ? repetida.eq("modalidade", String(registro.modalidade)) : repetida.is("modalidade", null);
    if (id) repetida = repetida.neq("id", id);
    const { data: existente } = await repetida;
    if (existente?.length)
      return {
        erro:
          tabela === "contagem_sala"
            ? "Já existe contagem neste dia e horário. Altere a linha que já está lançada."
            : "Já existe esta aula (mesmo dia, horário e modalidade). Altere a linha que já está lançada.",
      };
  }

  let aviso: string | null = null;
  if (id) {
    const { error } = await supabase.from(tabela).update(registro).eq("id", id);
    if (error) return { erro: mensagemErro(error) };
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from(tabela)
      .insert({ ...registro, academia_id: academiaId, criado_por: user?.id });
    if (error) return { erro: mensagemErro(error) };
    if (TODO_DIA.includes(tabela)) aviso = await diasFaltando(supabase, tabela, academiaId, String(registro.data));
  }

  for (const p of PAGINAS) revalidatePath(p, "layout");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return aviso ? { aviso } : {};
}

async function apagar(tabela: Tabela, id: string): Promise<Resultado> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from(tabela).delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  for (const p of PAGINAS) revalidatePath(p, "layout");
  refresh();
  return {};
}

type Salvar = (academiaId: string, id: string | null, dados: Record<string, string>) => Promise<Resultado>;

// Controle de vendas
export const salvarDiario: Salvar = async (a, id, d) => gravar("controle_diario", a, id, d);
export const excluirDiario = async (id: string) => apagar("controle_diario", id);
export const salvarConversao: Salvar = async (a, id, d) => gravar("controle_conversao", a, id, d);
export const excluirConversao = async (id: string) => apagar("controle_conversao", id);

// Controle de frequência
export const salvarSala: Salvar = async (a, id, d) => gravar("contagem_sala", a, id, d);
export const excluirSala = async (id: string) => apagar("contagem_sala", id);
export const salvarColetiva: Salvar = async (a, id, d) => gravar("contagem_coletivas", a, id, d);
export const excluirColetiva = async (id: string) => apagar("contagem_coletivas", id);
export const salvarLuta: Salvar = async (a, id, d) => gravar("contagem_lutas", a, id, d);
export const excluirLuta = async (id: string) => apagar("contagem_lutas", id);
