import type { SupabaseClient } from "@supabase/supabase-js";
import { contatos, enviarRelatorio } from "@/lib/notificar";
import { carregarPendencias, linhasDoPdf } from "@/lib/pendencias";
import { gerarPdfPendencias } from "@/lib/pdfPendencias";
import { hoje } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

// Perfil Manutenção: cada pessoa recebe (pelo canal de NOTIFY_CHANNEL) só as manutenções pendentes das unidades que atende.
// Usado no envio do relatório de compras e manutenção e no envio automático diário.

type Perfil = {
  email: string | null;
  email_relatorios: string | null;
  whatsapp: string | null;
  perfil: string;
  academias_manutencao: string[] | null;
};

export async function avisarManutencao(
  db: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  academia: { id: string; nome: string },
  perfis: Perfil[]
) {
  const equipe = perfis.filter((p) => p.perfil === "manutencao" && (p.academias_manutencao ?? []).includes(academia.id));
  if (!contatos(equipe).length) return { enviados: 0, falhas: [] as string[] };
  const { compras, manutencoes } = await carregarPendencias(db as Awaited<ReturnType<typeof createClient>>, academia.id);
  const dataHoje = hoje();
  const dataTexto = dataHoje.split("-").reverse().join("/");
  const pdf = await gerarPdfPendencias({ academia: academia.nome, dataTexto, soManutencoes: true, ...linhasDoPdf(compras, manutencoes) });
  const r = await enviarRelatorio({
    para: equipe,
    assunto: `BFIT · Manutenções pendentes · ${academia.nome} · ${dataTexto} (${manutencoes.length})`,
    texto: [
      `Olá,`,
      ``,
      `Segue em anexo a lista de manutenções pendentes da academia ${academia.nome} em ${dataTexto}: ${manutencoes.length}.`,
      ``,
      `Enviado pelo sistema BFIT · Controle de unidades.`,
    ].join("\n"),
    pdf: { nome: `Manutencoes ${academia.nome} ${dataHoje}.pdf`, conteudo: pdf },
  });
  return { enviados: r.enviados.length, falhas: r.falhas.map((f) => `${academia.nome} (manutenção): ${f}`) };
}
