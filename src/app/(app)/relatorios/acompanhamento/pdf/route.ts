import { acompanhamentoDiario } from "@/lib/acompanhamento";
import { getPerfilAtual } from "@/lib/auth";
import type { Academia } from "@/lib/database.types";
import { ontem } from "@/lib/planilha";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// PDF do acompanhamento diário de uma academia (o mesmo do e-mail), para conferir na tela.
export async function GET(request: Request) {
  if (!(await getPerfilAtual())) return new Response("Sessão expirada. Entre novamente.", { status: 401 });
  const url = new URL(request.url);
  const supabase = await createClient();
  // A regra de acesso do banco só devolve a academia para quem pode vê-la.
  const { data: academia } = await supabase.from("academias").select("*").eq("id", url.searchParams.get("academia") ?? "").maybeSingle();
  const db = createAdminClient();
  if (!academia || !db) return new Response("Academia não encontrada.", { status: 404 });
  const data = url.searchParams.get("data");
  const referencia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : ontem();
  const { data: todas } = await db.from("academias").select("*").order("nome");
  const { pdf, arquivo } = await acompanhamentoDiario(db, academia as Academia, (todas ?? []) as Academia[], referencia, (await getPerfilAtual())?.perfil === "admin");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(arquivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
