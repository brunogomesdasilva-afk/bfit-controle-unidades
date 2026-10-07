-- Conferência de pagamentos (menu Financeiro): por academia e mês dos vencimentos, o lote enviado em .zip (fluxo,
-- notas, boletos, guias, fatura do cartão, comprovantes) e o relatório da conferência feito pelo Claude
-- (LIBERAR / SEGURAR / CORRIGIR). Pode haver vários lotes no mês (um por fluxo semanal).
-- Só para quem tem o módulo Financeiro, e cada usuário só vê a academia dele (o administrador vê todas).

create table if not exists pagamentos_conferencias (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- processando: o Claude está conferindo; conferida: relatório pronto; erro: não terminou (texto parcial em "relatorio").
  status text not null default 'processando' check (status in ('processando', 'conferida', 'erro')),
  -- O .zip enviado: nome original e caminho na pasta "pagamentos" do armazenamento.
  arquivo_nome text not null,
  arquivo_caminho text not null,
  -- Arquivos de dentro do .zip: [{nome, tipo, tamanho, lido}].
  inventario jsonb not null default '[]',
  relatorio text,
  modelo text,
  erro text,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists pagamentos_conferencias_academia on pagamentos_conferencias (academia_id, criado_em desc);

-- Quem tem o módulo Financeiro, na academia dele (administrador: todas).
create or replace function pode_financeiro(academia uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tem_modulo('financeiro') and (is_admin() or academia = minha_academia());
$$;
revoke execute on function pode_financeiro(uuid) from public;
grant execute on function pode_financeiro(uuid) to authenticated;

alter table pagamentos_conferencias enable row level security;
drop policy if exists "pagamentos_conferencias_select" on pagamentos_conferencias;
create policy "pagamentos_conferencias_select" on pagamentos_conferencias for select to authenticated
  using ((select pode_financeiro(academia_id)));
drop policy if exists "pagamentos_conferencias_insert" on pagamentos_conferencias;
create policy "pagamentos_conferencias_insert" on pagamentos_conferencias for insert to authenticated
  with check ((select pode_financeiro(academia_id)));
drop policy if exists "pagamentos_conferencias_update" on pagamentos_conferencias;
create policy "pagamentos_conferencias_update" on pagamentos_conferencias for update to authenticated
  using ((select pode_financeiro(academia_id))) with check ((select pode_financeiro(academia_id)));
-- Sem exclusão: o histórico das conferências não se apaga.

drop policy if exists "manutencao_bloqueia" on pagamentos_conferencias;
create policy "manutencao_bloqueia" on pagamentos_conferencias as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));

-- Pasta privada dos lotes: <academia_id>/<mês>/<arquivo>.zip. Enviar e ler: módulo Financeiro da academia.
insert into storage.buckets (id, name, public, file_size_limit)
values ('pagamentos', 'pagamentos', false, 52428800) -- até 50 MB por .zip
on conflict (id) do nothing;

create or replace function pode_financeiro_pasta(caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when split_part(caminho, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pode_financeiro(split_part(caminho, '/', 1)::uuid)
    else false
  end;
$$;
revoke execute on function pode_financeiro_pasta(text) from public;
grant execute on function pode_financeiro_pasta(text) to authenticated;

drop policy if exists "pagamentos_enviar" on storage.objects;
create policy "pagamentos_enviar" on storage.objects for insert to authenticated
  with check (case when bucket_id = 'pagamentos' then pode_financeiro_pasta(name) else false end);
drop policy if exists "pagamentos_ler" on storage.objects;
create policy "pagamentos_ler" on storage.objects for select to authenticated
  using (case when bucket_id = 'pagamentos' then pode_financeiro_pasta(name) else false end);
