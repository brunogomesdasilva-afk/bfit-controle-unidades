import { redirect } from "next/navigation";

// "Controle de vendas" abre direto no controle diário.
export default function VendasPage() {
  redirect("/vendas/diario");
}
