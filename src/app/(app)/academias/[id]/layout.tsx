import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AbasDaAcademia } from "./AbasDaAcademia";

// Área de uma academia dentro do "Cadastro de academias": nome no topo e os cadastros dela em abas.
export default async function AcademiaLayout({ children, params }: LayoutProps<"/academias/[id]">) {
  await exigirAdmin();
  const { id } = await params;
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
