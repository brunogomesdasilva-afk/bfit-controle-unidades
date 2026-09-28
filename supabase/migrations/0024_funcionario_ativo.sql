-- Funcionário ativo/inativo: quem já tem histórico (ex.: professor que deu aulas) não é excluído, é inativado.
-- Inativo some das listas (professores das contagens, A.D.B, escala, aniversários), mas o histórico fica.
alter table funcionarios add column if not exists ativo boolean not null default true;
create index if not exists idx_funcionarios_academia_ativo on funcionarios (academia_id, ativo);
