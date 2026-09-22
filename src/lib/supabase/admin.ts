import { createClient } from "@supabase/supabase-js";

// Cliente com a chave de serviço (ignora as regras de acesso do banco). Só pode ser usado em código
// de servidor, depois de confirmar que quem chamou é administrador. Nunca expor essa chave ao navegador.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
