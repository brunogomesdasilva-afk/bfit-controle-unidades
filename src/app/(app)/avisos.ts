"use server";

import { getPerfilAtual } from "@/lib/auth";
import { CONTAGENS, contagensFaltando } from "@/lib/contagensFaltando";
import { createClient } from "@/lib/supabase/server";

export type GrupoFaltas = {
  academia: string;
  dias: { data: string; itens: { contagem: string; caminho: string; horarios: string[] }[] }[];
};

const CAMINHOS = { contagem_sala: "/frequencia/sala", contagem_coletivas: "/frequencia/coletivas", contagem_lutas: "/frequencia/lutas" };

// Contagens faltando nas academias que o usuário vê (a regra de acesso do banco filtra), por academia e dia.
export async function carregarContagensFaltando(): Promise<GrupoFaltas[]> {
  if (!(await getPerfilAtual())) return [];
  const supabase = await createClient();
  const { data: academias } = await supabase.from("academias").select("id, nome").order("nome");
  const faltas = await contagensFaltando(supabase, (academias ?? []).map((a) => a.id));
  return (academias ?? [])
    .map((a) => {
      const daAcademia = faltas.filter((f) => f.academiaId === a.id);
      const datas = [...new Set(daAcademia.map((f) => f.data))];
      return {
        academia: a.nome as string,
        dias: datas.map((data) => ({
          data,
          itens: daAcademia
            .filter((f) => f.data === data)
            .map((f) => ({
              contagem: CONTAGENS[f.contagem],
              caminho: `${CAMINHOS[f.contagem]}?academia=${a.id}&mes=${data.slice(0, 7)}`,
              horarios: f.horarios,
            })),
        })),
      };
    })
    .filter((g) => g.dias.length > 0);
}
