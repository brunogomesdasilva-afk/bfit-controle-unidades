import { processarNotasDrive } from "@/lib/nfDrive";
import { createAdminClient } from "@/lib/supabase/admin";

// Robô das notas do Google Drive (agendado na Vercel todo dia às 19h de Brasília = 22h UTC, ver vercel.json): lança
// as notas da pasta de notas fiscais e leva cada uma para a pasta da contabilidade (Administrador > Notas do Drive).
// Só roda com o segredo CRON_SECRET, que a Vercel manda no cabeçalho Authorization.
export const maxDuration = 800;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`)
    return new Response("Não autorizado.", { status: 401 });
  const db = createAdminClient();
  if (!db) return new Response("Chave de serviço não configurada.", { status: 500 });
  const r = await processarNotasDrive(db, { avisar: true });
  return Response.json({ aviso: r.aviso, restantes: r.restantes ?? 0, resultados: r.resultados.map((x) => `${x.situacao}: ${x.arquivo}`) });
}
