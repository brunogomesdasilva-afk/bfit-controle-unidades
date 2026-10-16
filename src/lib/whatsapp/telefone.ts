// Celular só com dígitos e com o DDI do Brasil: "(11) 98888-7777" → "5511988887777". Vazio = inválido.
// É o formato que a Cloud API da Meta e a Z-API esperam (sem "+", sem espaços).
export function normalizarCelular(numero: string | null | undefined): string | null {
  const d = String(numero ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

// ID de grupo do WhatsApp como a Z-API devolve: "120363019502650977-group" ou o formato antigo
// "5511999999999-1623281429".
export const ehGrupo = (id: string | null | undefined) => /^\d+-(group|\d+)$/.test(String(id ?? "").trim());

// Destino de um envio: grupo (como está) ou celular normalizado. Vazio/inválido = null.
export function normalizarDestino(destino: string | null | undefined): string | null {
  const texto = String(destino ?? "").trim();
  return ehGrupo(texto) ? texto : normalizarCelular(texto);
}
