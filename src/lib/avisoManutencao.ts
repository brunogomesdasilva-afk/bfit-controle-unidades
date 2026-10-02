import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigurado, emailDeRelatorio, enviarEmail } from "@/lib/email";
import { carregarPendencias, linhasDoPdf } from "@/lib/pendencias";
import { gerarPdfPendencias } from "@/lib/pdfPendencias";
import { hoje } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";
import { enviarWhatsapp } from "@/lib/whatsapp";

// Perfil Manutenção: cada pessoa recebe (WhatsApp e e-mail) só as manutenções pendentes das unidades que atende.
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
  if (!equipe.length) return { enviados: 0, falhas: [] as string[] };
  const { compras, manutencoes } = await carregarPendencias(db as Awaited<ReturnType<typeof createClient>>, academia.id);
  const dataHoje = hoje();
  const dataTexto = dataHoje.split("-").reverse().join("/");
  const pdf = await gerarPdfPendencias({ academia: academia.nome, dataTexto, soManutencoes: true, ...linhasDoPdf(compras, manutencoes) });
  const nome = `Manutencoes ${academia.nome} ${dataHoje}.pdf`;
  const falhas: string[] = [];
  let enviados = 0;

  const emails = equipe.map((p) => emailDeRelatorio(p)).filter(Boolean);
  if (emails.length && emailConfigurado()) {
    try {
      await enviarEmail({
        para: emails,
        assunto: `BFIT · Manutenções pendentes · ${academia.nome} · ${dataTexto}`,
        texto: [
          `Olá,`,
          ``,
          `Segue em anexo a lista de manutenções pendentes da academia ${academia.nome} em ${dataTexto}: ${manutencoes.length}.`,
          ``,
          `Enviado pelo sistema BFIT · Controle de unidades.`,
        ].join("\n"),
        anexos: [{ nome, conteudo: pdf }],
      });
      enviados += emails.length;
    } catch (e) {
      falhas.push(`${academia.nome} (manutenção, e-mail): ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  const whats = await enviarWhatsapp({
    para: equipe.map((p) => p.whatsapp),
    legenda: `BFIT · Manutenções pendentes · ${academia.nome} · ${dataTexto} (${manutencoes.length})`,
    pdf: { nome, conteudo: pdf },
  });
  falhas.push(...whats.falhas.map((f) => `${academia.nome} (manutenção): ${f}`));
  return { enviados, falhas };
}
