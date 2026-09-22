import { Logo } from "@/app/Logo";

export default function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grafite-escuro">
      <div className="relative h-14 w-14">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/20 border-t-marca-claro" />
        <Logo variante="icone" className="absolute inset-0 flex items-center justify-center text-xl" />
      </div>
    </div>
  );
}
