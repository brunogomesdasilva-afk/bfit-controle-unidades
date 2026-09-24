import Link from "next/link";

export function SemAcademias({ admin }: { admin: boolean }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {admin ? "Nenhuma academia cadastrada ainda. " : ""}
      {admin ? (
        <Link href="/academias" className="font-medium text-marca underline hover:text-marca-escuro">
          Cadastre a primeira academia
        </Link>
      ) : (
        "Você ainda não tem acesso a nenhuma academia. Fale com o administrador."
      )}
    </div>
  );
}
