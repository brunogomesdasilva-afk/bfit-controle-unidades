"use server";

import { enviarAcompanhamento } from "@/lib/acompanhamento";
import { getPerfilAtual } from "@/lib/auth";
import { ontem } from "@/lib/planilha";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResultadoEnvio } from "../pendencias/actions";

// Envio manual do acompanhamento diário (só administrador): teste só para os administradores ou para todos.
export async function enviarAgora(soAdministradores: boolean): Promise<ResultadoEnvio> {
  const atual = await getPerfilAtual();
  if (atual?.perfil !== "admin") return { erro: "Só o administrador pode enviar o acompanhamento." };
  const db = createAdminClient();
  if (!db) return { erro: "Chave de serviço do Supabase não configurada no servidor." };
  const { enviados, falhas } = await enviarAcompanhamento(db, { referencia: ontem(), soAdministradores });
  if (falhas.length) return { erro: `Falhou: ${falhas.join("; ")}${enviados.length ? `. Enviados: ${enviados.join(", ")}` : ""}` };
  return { ok: `Enviado: ${enviados.join(", ")} (entre parênteses, quantas pessoas receberam).` };
}
