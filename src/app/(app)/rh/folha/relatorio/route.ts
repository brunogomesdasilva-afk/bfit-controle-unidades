import { nomeDoMes } from "@/app/(app)/relatorios/comum";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { gerarPdfRelatorio } from "@/lib/pdfFolha";
import { createClient } from "@/lib/supabase/server";

// PDF do relatório de uma conferência da folha, aberto numa nova aba.
export async function GET(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "rh")) return new Response("Sem acesso ao módulo RH.", { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("folha_conferencias")
    .select("mes, status, relatorio, criado_em, fechada_em, academia:academias(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!c || !c.relatorio) return new Response("Conferência não encontrada.", { status: 404 });

  const academia = (c.academia as unknown as { nome: string } | null)?.nome ?? "";
  const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const rodape =
    c.status === "fechada" && c.fechada_em
      ? `Folha fechada em ${quando(c.fechada_em)}`
      : `Conferido em ${quando(c.criado_em)}${c.status === "erro" ? " (conferência incompleta)" : ""}`;
  const pdf = await gerarPdfRelatorio({ academia, mesTexto: nomeDoMes(c.mes), markdown: c.relatorio, rodape });
  const arquivo = `Conferencia folha ${academia} ${c.mes}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(arquivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
