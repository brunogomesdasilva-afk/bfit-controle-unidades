import { redirect } from "next/navigation";

// "Controle de frequência" abre direto na contagem de sala.
export default function FrequenciaPage() {
  redirect("/frequencia/sala");
}
