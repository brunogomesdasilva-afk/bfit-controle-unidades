import { redirect } from "next/navigation";

// O controle diário mudou para "Controle de vendas"; o endereço antigo leva para o novo.
export default async function DiarioAntigoPage({ searchParams }: PageProps<"/frequencia/diario">) {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) if (typeof valor === "string") params.set(chave, valor);
  const q = params.toString();
  redirect(q ? `/vendas/diario?${q}` : "/vendas/diario");
}
