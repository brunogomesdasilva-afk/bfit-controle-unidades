import { redirect } from "next/navigation";

// "Avaliação de desempenho" abre direto na A.D.B.
export default function AvaliacaoPage() {
  redirect("/avaliacao/adb");
}
