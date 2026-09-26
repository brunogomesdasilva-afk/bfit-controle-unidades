import { getPerfilAtual } from "@/lib/auth";
import { mesDeFechamento, montarFechamento } from "@/lib/fechamento";
import { createClient } from "@/lib/supabase/server";

// PDF do fechamento do mês, aberto numa nova aba. A regra de acesso do banco só devolve a academia
// para quem pode vê-la (administrador ou usuário da unidade).
export async function GET(request: Request) {
  if (!(await getPerfilAtual())) return new Response("Sessão expirada. Entre novamente.", { status: 401 });
  const url = new URL(request.url);
  const mes = mesDeFechamento(url.searchParams.get("mes") ?? undefined);
  const supabase = await createClient();
  const { data: academia } = await supabase
    .from("academias")
    .select("id, nome")
    .eq("id", url.searchParams.get("academia") ?? "")
    .maybeSingle();
  if (!academia) return new Response("Academia não encontrada.", { status: 404 });

  const { pdf, arquivo } = await montarFechamento(supabase, academia, mes);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(arquivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
