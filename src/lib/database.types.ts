export type Profile = {
  id: string;
  nome: string;
  email: string;
  perfil: "admin" | "usuario";
  ativo: boolean;
  ativo_alterado_em: string | null;
  ativo_alterado_por: string | null;
  created_at: string;
};

// Placeholder mínimo para satisfazer o generic do supabase-js.
// Pode ser substituído pelo `supabase gen types typescript` quando o projeto estiver linkado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
