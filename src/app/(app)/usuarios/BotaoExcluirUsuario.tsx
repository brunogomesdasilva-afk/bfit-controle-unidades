"use client";

// Lixeira de cada usuário na lista: pede confirmação e exclui de vez (ação do servidor já com o id).
export function BotaoExcluirUsuario({ nome, excluir }: { nome: string; excluir: () => Promise<void> }) {
  return (
    <form
      action={excluir}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir ${nome} de vez?\n\nO login e o cadastro são apagados e não dá para desfazer. Se quiser só bloquear o acesso, use "Inativar usuário".`))
          e.preventDefault();
      }}
    >
      <button
        type="submit"
        title={`Excluir ${nome}`}
        aria-label={`Excluir ${nome}`}
        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </form>
  );
}
