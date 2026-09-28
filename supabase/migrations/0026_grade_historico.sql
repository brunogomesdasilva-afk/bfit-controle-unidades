-- Histórico da grade de aulas: cada aula vale de "vigente_de" até "vigente_ate" (vazio = vale até hoje).
-- Alterar uma aula encerra a versão anterior e cria uma nova; excluir encerra. O fechamento de cada dia usa a
-- grade que valia naquele dia, então mudar a grade não altera os meses já fechados.

alter table grade_aulas add column if not exists vigente_de date not null default current_date;
alter table grade_aulas add column if not exists vigente_ate date;
alter table grade_aulas drop constraint if exists grade_aulas_vigencia;
alter table grade_aulas add constraint grade_aulas_vigencia check (vigente_ate is null or vigente_ate >= vigente_de);

-- Só uma versão vigente por aula (dia, horário e modalidade); as encerradas ficam como histórico.
drop index if exists grade_aulas_unica;
create unique index grade_aulas_unica on grade_aulas (academia_id, tipo, dia_semana, horario, lower(modalidade))
  where vigente_ate is null;
create index if not exists idx_grade_aulas_vigencia on grade_aulas (academia_id, vigente_de, vigente_ate);
