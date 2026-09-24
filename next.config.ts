import type { NextConfig } from "next";

// Os Excel de importação não passam mais pelo servidor do site (vão direto para o armazenamento do
// Supabase), então o limite padrão das Server Actions (1 MB) basta.
const nextConfig: NextConfig = {};

export default nextConfig;
