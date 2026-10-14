import { exigirAdmin } from "@/lib/auth";
import { descreverQuando, type RegraEnvio } from "@/lib/envios";
import { createClient } from "@/lib/supabase/server";
import { listarGrupos, normalizarCelular, whatsappConfigurado, type GrupoWhatsapp } from "@/lib/whatsapp";
import { FormRegra } from "./FormRegra";

// "Enviar agora" monta os PDFs de todas as unidades e espera alguns segundos entre as mensagens.
export const maxDuration = 300;

// Administrador > Envios automáticos: as regras de quais relatórios vão, por WhatsApp ou e-mail, para quem, em que
// dias e a que hora. O agendador da Vercel roda de hora em hora e envia as regras ativas daquela hora.
export default async function EnviosAutomaticosPage() {
  await exigirAdmin();
  const supabase = await createClient();
  const [{ data: regras }, { data: perfis }] = await Promise.all([
    supabase.from("regras_envio").select("*").order("hora").order("nome"),
    supabase.from("profiles").select("id, nome, email, email_relatorios, whatsapp, perfil").eq("ativo", true).order("nome"),
  ]);
  let grupos: GrupoWhatsapp[] = [];
  let erroGrupos: string | null = null;
  if (whatsappConfigurado()) {
    try {
      grupos = (await listarGrupos()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } catch (e) {
      erroGrupos = e instanceof Error ? e.message : "erro";
    }
  } else erroGrupos = "WhatsApp não configurado no servidor";
  const pessoas = (perfis ?? []).map((p) => ({
    id: p.id as string,
    nome: (p.nome as string) || (p.email as string),
    perfil: p.perfil as string,
    temWhatsapp: Boolean(normalizarCelular(p.whatsapp as string | null)),
    temEmail: Boolean(p.email_relatorios || p.email),
  }));

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Envios automáticos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada regra manda um PDF com todas as unidades, por WhatsApp (para um grupo e/ou pessoas) ou por e-mail, nos dias e na hora escolhidos. As
          mensagens saem com alguns segundos de intervalo entre si, para o WhatsApp não tratar como spam. Use &quot;Enviar agora&quot; para testar.
        </p>
      </div>
      {!(regras ?? []).length && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Nenhuma regra ainda (rode a migration 0046 no Supabase).</p>}
      <div className="space-y-3">
        {((regras ?? []) as RegraEnvio[]).map((r) => (
          <FormRegra
            key={r.id}
            id={r.id}
            inicial={{
              nome: r.nome,
              relatorio: r.relatorio,
              canal: r.canal,
              grupo_id: r.grupo_id,
              grupo_nome: r.grupo_nome,
              para_admins: r.para_admins,
              usuarios: r.usuarios ?? [],
              dias: r.dias,
              dias_semana: r.dias_semana ?? [],
              hora: r.hora,
              com_faturamento: r.com_faturamento,
              ativo: r.ativo,
            }}
            quando={descreverQuando(r)}
            ultimoResultado={r.ultimo_resultado}
            pessoas={pessoas}
            grupos={grupos}
            erroGrupos={erroGrupos}
          />
        ))}
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Nova regra</h2>
        <FormRegra id={null} pessoas={pessoas} grupos={grupos} erroGrupos={erroGrupos} />
      </section>
    </div>
  );
}
