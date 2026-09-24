import { redirect } from "next/navigation";

// "Relatórios" abre direto no relatório de compras e manutenção.
export default function RelatoriosPage() {
  redirect("/relatorios/pendencias");
}
