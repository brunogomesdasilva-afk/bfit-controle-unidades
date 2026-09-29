-- Cadastro de clientes (importado do Excel do sistema da rede, uma aba por unidade). Cada importação substitui
-- os clientes da unidade. O CPF não é guardado (não é usado em nenhum indicador).

create table if not exists clientes (
  academia_id uuid not null references academias(id) on delete cascade,
  cliente_id text not null,
  nome text,
  bairro text,
  cidade text,
  contrato_id text,
  contrato text,
  data_nascimento date,
  dias_ativos integer,
  inicio_contrato date,
  genero text,
  status text,
  wellhub_id text,
  valor_contrato numeric(10, 2),
  vencimento_contrato date,
  importado_em timestamptz not null default now(),
  primary key (academia_id, cliente_id)
);
create index if not exists idx_clientes_status on clientes (academia_id, status);

alter table clientes enable row level security;
drop policy if exists "clientes_select" on clientes;
create policy "clientes_select" on clientes for select to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()));
drop policy if exists "clientes_write_admin" on clientes;
create policy "clientes_write_admin" on clientes for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));
drop policy if exists "manutencao_bloqueia" on clientes;
create policy "manutencao_bloqueia" on clientes as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));

-- Perfil dos clientes ativos (Painel): quantidade por gênero, faixa etária e plano.
create or replace function clientes_perfil(p_academia uuid, referencia date)
returns table (genero text, faixa text, contrato text, clientes bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(nullif(upper(trim(c.genero)), ''), '?') as genero,
    case
      when c.data_nascimento is null then 'Sem data'
      when age(referencia, c.data_nascimento) < interval '18 years' then 'Menor de 18'
      when age(referencia, c.data_nascimento) < interval '31 years' then '18 a 30'
      when age(referencia, c.data_nascimento) < interval '41 years' then '31 a 40'
      when age(referencia, c.data_nascimento) < interval '51 years' then '41 a 50'
      else '51 ou mais'
    end as faixa,
    coalesce(nullif(trim(c.contrato), ''), 'Sem plano') as contrato,
    count(*)
  from clientes c
  where (p_academia is null or c.academia_id = p_academia)
    and lower(c.status) = 'ativo'
  group by 1, 2, 3;
$$;
grant execute on function clientes_perfil(uuid, date) to authenticated;

-- Pessoas diferentes no Gympass no período (quem foi mais de um dia conta uma vez).
create or replace function gympass_pessoas(p_academia uuid, inicio date, fim date)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct (g.academia_id, g.wellhub_id))
  from gympass g
  where g.data between inicio and fim and (p_academia is null or g.academia_id = p_academia);
$$;
grant execute on function gympass_pessoas(uuid, date, date) to authenticated;
