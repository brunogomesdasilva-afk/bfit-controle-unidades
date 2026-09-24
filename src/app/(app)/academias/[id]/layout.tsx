import { notFound, redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AbasDaAcademia } from "./AbasDaAcademia";

// Área de uma academia dentro do "Cadastro de academias": nome no topo e os cadastros dela em abas.
// O administrador abre qualquer academia; o usuário de uma academia, só a dele.
export default async function AcademiaLayout({ children, params }: LayoutProps<"/academias/[id]">) {
  const atual = await getPerfilAtual();
  if (!atual) redirect("/login");
  const { id } = await params;
  if (atual.perfil !== "admin" && atual.academiaId !== id) {
    redirect(atual.academiaId ? `/academias/${atual.academiaId}` : "/");
  }
  const supabase = await createClient();
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", id).maybeSingle();
  if (!academia) notFound();

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">Cadastro de academias</p>
      <h1 className="text-lg font-semibold text-slate-900">{academia.nome}</h1>
      <AbasDaAcademia id={academia.id} />
      {children}
    </div>
  );
}
