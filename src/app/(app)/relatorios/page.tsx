import { redirect } from "next/navigation";

// "Relatórios" abre direto no resumo do dia.
export default function RelatoriosPage() {
  redirect("/relatorios/diario");
}
