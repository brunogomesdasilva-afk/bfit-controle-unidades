import { redirect } from "next/navigation";

// Menu Thais fora do ar por enquanto (pedido do Bruno): o endereço direto também volta para o Painel.
// Para liberar de novo, apague este arquivo e tire o "oculto" do item no Sidebar.
export default function ThaisLayout() {
  redirect("/");
}
