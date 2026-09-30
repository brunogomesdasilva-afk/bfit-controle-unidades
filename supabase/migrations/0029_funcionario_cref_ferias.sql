-- Funcionários: CREF (professores de sala e de coletivas), data de contratação e data limite das férias.
-- Os vencimentos entram no fechamento do mês e nos avisos ao entrar no sistema.
alter table funcionarios add column if not exists cref text;
alter table funcionarios add column if not exists cref_vencimento date;
alter table funcionarios add column if not exists data_contratacao date;
alter table funcionarios add column if not exists ferias_limite date;
