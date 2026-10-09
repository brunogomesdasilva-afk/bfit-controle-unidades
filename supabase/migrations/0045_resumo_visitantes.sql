-- Alunos de outras unidades: resumo pronto com uma linha por aluno, dia, academia visitada e unidade de origem.
-- A conta direto nas passagens (1 milhão de linhas) estourava o tempo no ano; o resumo tem só as visitas.
-- Dá também os dias de acesso no período (cada linha é um dia) e a lista aluno por aluno.
create table if not exists resumo_visitantes (
  academia_id uuid not null references academias(id) on delete cascade,
  data date not null,
  unidade_origem text not null,
  cliente_id text not null,
  nome text,
  passagens integer not null,
  primary key (academia_id, data, unidade_origem, cliente_id)
);
create index if not exists resumo_visitantes_data on resumo_visitantes (data, academia_id);
alter table resumo_visitantes enable row level security;
drop policy if exists "resumo_visitantes_select" on resumo_visitantes;
create policy "resumo_visitantes_select" on resumo_visitantes for select to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()));

-- O recálculo dos resumos de passagens (chamado a cada importação, só nos dias tocados) passa a refazer também este.
create or replace function recalcular_resumo_passagens(p_academia uuid, p_datas date[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from resumo_passagens_dia where academia_id = p_academia and data = any (p_datas);
  delete from resumo_passagens_hora where academia_id = p_academia and data = any (p_datas);
  delete from resumo_visitantes where academia_id = p_academia and data = any (p_datas);
  insert into resumo_passagens_dia (academia_id, data, entradas, clientes, liberadas)
    select academia_id, data, count(*), count(distinct cliente_id), count(*) filter (where acao ilike 'liberad%')
    from passagens where academia_id = p_academia and data = any (p_datas)
    group by academia_id, data;
  insert into resumo_passagens_hora (academia_id, data, hora, entradas, clientes)
    select academia_id, data, extract(hour from hora)::smallint, count(*), count(distinct cliente_id)
    from passagens where academia_id = p_academia and data = any (p_datas)
    group by academia_id, data, extract(hour from hora);
  insert into resumo_visitantes (academia_id, data, unidade_origem, cliente_id, nome, passagens)
    select p.academia_id, p.data, p.unidade_origem, coalesce(p.cliente_id, p.nome, '?'), max(p.nome), count(*)
    from passagens p join academias a on a.id = p.academia_id
    where p.academia_id = p_academia and p.data = any (p_datas)
      and p.unidade_origem is not null and p.unidade_origem is distinct from a.origem_catraca
    group by p.academia_id, p.data, p.unidade_origem, coalesce(p.cliente_id, p.nome, '?');
end;
$$;
revoke execute on function recalcular_resumo_passagens(uuid, date[]) from public, anon, authenticated;

-- Carga inicial com tudo o que já foi importado.
delete from resumo_visitantes;
insert into resumo_visitantes (academia_id, data, unidade_origem, cliente_id, nome, passagens)
  select p.academia_id, p.data, p.unidade_origem, coalesce(p.cliente_id, p.nome, '?'), max(p.nome), count(*)
  from passagens p join academias a on a.id = p.academia_id
  where p.unidade_origem is not null and p.unidade_origem is distinct from a.origem_catraca
  group by p.academia_id, p.data, p.unidade_origem, coalesce(p.cliente_id, p.nome, '?');

-- Por unidade de origem: passagens, alunos (sem repetir), dias de acesso (soma dos dias de cada aluno).
drop function if exists visitantes_outras_unidades(uuid, date, date);
create function visitantes_outras_unidades(p_academia uuid, inicio date, fim date)
returns table (unidade_origem text, passagens bigint, alunos bigint, dias bigint)
language sql stable security invoker set search_path = public as $$
  select v.unidade_origem, sum(v.passagens)::bigint, count(distinct (v.academia_id, v.cliente_id)), count(*)
  from resumo_visitantes v
  where v.data between inicio and fim and (p_academia is null or v.academia_id = p_academia)
  group by v.unidade_origem
  order by sum(v.passagens) desc;
$$;
grant execute on function visitantes_outras_unidades(uuid, date, date) to authenticated;

drop function if exists visitantes_outras_unidades_total(uuid, date, date);
create function visitantes_outras_unidades_total(p_academia uuid, inicio date, fim date)
returns table (passagens bigint, alunos bigint, dias bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(v.passagens), 0)::bigint, count(distinct (v.academia_id, v.cliente_id)), count(*)
  from resumo_visitantes v
  where v.data between inicio and fim and (p_academia is null or v.academia_id = p_academia);
$$;
grant execute on function visitantes_outras_unidades_total(uuid, date, date) to authenticated;

-- Aluno por aluno de uma unidade de origem (ou de todas): dias de acesso, passagens e o último dia.
create or replace function visitantes_alunos(p_academia uuid, inicio date, fim date, p_origem text)
returns table (cliente_id text, nome text, unidade_origem text, academia text, dias bigint, passagens bigint, ultimo date)
language sql stable security invoker set search_path = public as $$
  select v.cliente_id, max(v.nome), v.unidade_origem, a.nome, count(*), sum(v.passagens)::bigint, max(v.data)
  from resumo_visitantes v join academias a on a.id = v.academia_id
  where v.data between inicio and fim and (p_academia is null or v.academia_id = p_academia)
    and (p_origem is null or v.unidade_origem = p_origem)
  group by v.cliente_id, v.unidade_origem, a.nome
  order by count(*) desc, sum(v.passagens) desc;
$$;
grant execute on function visitantes_alunos(uuid, date, date, text) to authenticated;
