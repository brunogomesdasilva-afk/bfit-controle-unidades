-- Alunos de outras unidades que passam na nossa catraca.
-- Cada academia guarda o nome com que ela aparece na coluna "Unidade de origem" do relatório de passagens
-- (ex.: "SP-KM 18"); quem vem com outra origem é visitante de outra unidade.

alter table academias add column if not exists origem_catraca text;

-- Preenche com a origem mais frequente nas passagens de cada academia (a própria unidade é a maioria).
update academias a
set origem_catraca = o.unidade_origem
from (
  select distinct on (academia_id) academia_id, unidade_origem
  from passagens
  where unidade_origem is not null
  group by academia_id, unidade_origem
  order by academia_id, count(*) desc
) o
where o.academia_id = a.id and a.origem_catraca is null;

-- Passagens e alunos diferentes de outras unidades no período, por unidade de origem.
-- p_academia vazio = todas as academias que o usuário pode ver (a regra de acesso do banco filtra).
-- Um aluno que veio vários dias no período conta uma vez só (por academia visitada).
create or replace function visitantes_outras_unidades(p_academia uuid, inicio date, fim date)
returns table (unidade_origem text, passagens bigint, alunos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.unidade_origem, count(*), count(distinct (p.academia_id, p.cliente_id))
  from passagens p
  join academias a on a.id = p.academia_id
  where p.data between inicio and fim
    and (p_academia is null or p.academia_id = p_academia)
    and p.unidade_origem is not null
    and p.unidade_origem is distinct from a.origem_catraca
  group by p.unidade_origem
  order by count(*) desc;
$$;

grant execute on function visitantes_outras_unidades(uuid, date, date) to authenticated;

-- Alunos diferentes de outras unidades no período (total, sem repetir o aluno entre as origens).
create or replace function visitantes_outras_unidades_total(p_academia uuid, inicio date, fim date)
returns table (passagens bigint, alunos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*), count(distinct (p.academia_id, p.cliente_id))
  from passagens p
  join academias a on a.id = p.academia_id
  where p.data between inicio and fim
    and (p_academia is null or p.academia_id = p_academia)
    and p.unidade_origem is not null
    and p.unidade_origem is distinct from a.origem_catraca;
$$;

grant execute on function visitantes_outras_unidades_total(uuid, date, date) to authenticated;
