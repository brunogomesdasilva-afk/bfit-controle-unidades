import { nomeDoMes } from "@/app/(app)/relatorios/comum";
import { aulasDoMes } from "@/lib/aulasDoMes";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { lerMes } from "@/lib/planilha";
import { gerarPdfPlanilhaColetivas } from "@/lib/pdfFolha";
import { createClient } from "@/lib/supabase/server";

// PDF da planilha de coletivas e lutas do mês (horas por professor, PJ x CLT, coberturas), para conferir as
// notas fiscais dos PJ quando chegarem.
export async function GET(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "rh")) return new Response("Sem acesso ao módulo RH.", { status: 403 });
  const url = new URL(request.url);
  const mes = lerMes(url.searchParams.get("mes") ?? undefined);
  const supabase = await createClient();
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", url.searchParams.get("academia") ?? "").maybeSingle();
  if (!academia) return new Response("Academia não encontrada.", { status: 404 });

  const aulas = await aulasDoMes(supabase, academia.id, mes);
  const pdf = await gerarPdfPlanilhaColetivas({ academia: academia.nome, mesTexto: nomeDoMes(mes), aulas });
  const arquivo = `Coletivas ${academia.nome} ${mes}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(arquivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
