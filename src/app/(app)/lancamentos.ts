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
    { campo: "modalidade", rotulo: "Modalidade", tipo: "texto" },
    { campo: "quantidade", rotulo: "Quantidade", tipo: "inteiro", obrigatorio: true },
  ],
  contagem_lutas: [
    { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    { campo: "horario", rotulo: "Horário", tipo: "hora", obrigatorio: true },
    { campo: "professor", rotulo: "Professor", tipo: "texto" },
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

  const supabase = await createClient();
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
  }

  for (const p of PAGINAS) revalidatePath(p, "layout");
  // Atualiza a tela aberta na hora (sem isso a planilha só mostrava a mudança ao recarregar).
  refresh();
  return {};
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
