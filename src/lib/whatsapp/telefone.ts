// Celular só com dígitos e com o DDI do Brasil: "(11) 98888-7777" → "5511988887777". Vazio = inválido.
// É o formato que a Cloud API da Meta e a Z-API esperam (sem "+", sem espaços).
export function normalizarCelular(numero: string | null | undefined): string | null {
  const d = String(numero ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}
