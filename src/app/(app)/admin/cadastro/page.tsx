import { exigirAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarGrupos, whatsappConfigurado, type GrupoWhatsapp } from "@/lib/whatsapp";
import { CadastroGrupos } from "./CadastroGrupos";

// Administrador > Cadastro: grupos de WhatsApp (nome e ID) usados nas regras de Envios automáticos.
export default async function CadastroPage() {
  await exigirAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("grupos_whatsapp").select("id, nome, grupo_id").order("nome");
  let doWhatsapp: GrupoWhatsapp[] = [];
  let erroWhatsapp: string | null = null;
  if (whatsappConfigurado()) {
    try {
      doWhatsapp = (await listarGrupos()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } catch (e) {
      erroWhatsapp = e instanceof Error ? e.message : "erro";
    }
  } else erroWhatsapp = "WhatsApp não configurado no servidor";

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Cadastro</h1>
        <p className="mt-1 text-sm text-slate-500">
          Grupos de WhatsApp que recebem os relatórios. Os grupos cadastrados aparecem para escolher em Administrador &gt; Envios automáticos.
        </p>
      </div>
      {error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Cadastro indisponível: rode a migration 0047 no Supabase.</p>}
      <CadastroGrupos cadastrados={(data ?? []) as { id: string; nome: string; grupo_id: string }[]} doWhatsapp={doWhatsapp} erroWhatsapp={erroWhatsapp} />
    </div>
  );
}
