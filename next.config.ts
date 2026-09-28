import type { NextConfig } from "next";

// Os Excel de importação não passam mais pelo servidor do site (vão direto para o armazenamento do
// Supabase), então o limite padrão das Server Actions (1 MB) basta.
// O backup lê as migrations para montar o schema completo: elas precisam ir junto na publicação.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/backup": ["./supabase/migrations/**/*"],
  },
};

export default nextConfig;
