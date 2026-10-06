import { redirect } from "next/navigation";

// "RH" abre direto na conferência da folha de pagamento.
export default function RhPage() {
  redirect("/rh/folha");
}
