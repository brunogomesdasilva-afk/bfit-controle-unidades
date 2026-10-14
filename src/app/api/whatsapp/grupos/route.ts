import { getPerfilAtual } from "@/lib/auth";
import { listarGrupos, whatsappConfigurado } from "@/lib/whatsapp";

// Grupos de WhatsApp de que o número conectado (Z-API) participa, com o ID de cada um (só administrador).
// O ID serve para testar: /api/whatsapp/teste?para=<ID do grupo>.
export async function GET() {
  const atual = await getPerfilAtual();
  if (atual?.perfil !== "admin") return Response.json({ ok: false, erro: "Só o administrador pode ver os grupos." }, { status: 403 });
  if (!whatsappConfigurado())
    return Response.json({ ok: false, erro: "WhatsApp não configurado: confira WHATSAPP_PROVIDER e as credenciais do provedor." }, { status: 500 });
  try {
    const grupos = (await listarGrupos()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return Response.json({ ok: true, quantidade: grupos.length, grupos });
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 });
  }
}
