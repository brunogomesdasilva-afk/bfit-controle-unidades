import { redirect } from "next/navigation";

// "Thais" abre direto no cadastro de produtos.
export default function ThaisPage() {
  redirect("/thais/produtos");
}
