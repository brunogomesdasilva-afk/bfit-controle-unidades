import { redirect } from "next/navigation";

// O submenu da academia abre direto no cadastro de funcionários.
export default async function AcademiaPage({ params }: PageProps<"/academias/[id]">) {
  const { id } = await params;
  redirect(`/academias/${id}/funcionarios`);
}
