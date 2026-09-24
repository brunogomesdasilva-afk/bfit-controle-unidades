-- Relatórios importados de planilhas Excel (volume grande, carga diária):
-- passagens na catraca (relatório de frequência) e check-ins do Gympass/Wellhub.
-- Cada importação fica registrada; desfazer uma importação apaga só as linhas que ela trouxe.

create table if not exists importacoes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete restrict,
  tipo text not null check (tipo in ('passagens', 'gympass')),
  arquivo text not null,
  linhas_lidas integer not null default 0,
  linhas_novas integer not null default 0,
  criado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists passagens (
  id bigint generated always as identity primary key,
  academia_id uuid not null references academias(id) on delete restrict,
  importacao_id uuid not null references importacoes(id) on delete cascade,
  data date not null,
  hora time not null,
  cliente_id text,
  tipo text,
  nome text,
  entrada_por text,
  dispositivo text,
  liberado_por text,
  motivo text,
  unidade_origem text,
  acao text
);

create table if not exists gympass (
  id bigint generated always as identity primary key,
  academia_id uuid not null references academias(id) on delete restrict,
  importacao_id uuid not null references importacoes(id) on delete cascade,
  data date not null,
  hora time not null,
  unidade_id text,
  unidade text,
  visitante text,
  wellhub_id text,
  produto text,
  periodo_checkin text,
  tipo_checkin text,
  pagamento numeric(10, 2)
);

-- Importar o mesmo arquivo de novo não duplica: a mesma pessoa no mesmo horário é ignorada.
create unique index if not exists passagens_sem_repeticao on passagens (academia_id, data, hora, cliente_id, entrada_por) nulls not distinct;
create unique index if not exists gympass_sem_repeticao on gympass (academia_id, data, hora, wellhub_id) nulls not distinct;

-- Consultas por academia e período (dia, mês, ano)
create index if not exists idx_passagens_academia_data on passagens (academia_id, data, hora);
create index if not exists idx_gympass_academia_data on gympass (academia_id, data, hora);
create index if not exists idx_passagens_importacao on passagens (importacao_id);
create index if not exists idx_gympass_importacao on gympass (importacao_id);
create index if not exists idx_importacoes_academia on importacoes (academia_id, tipo, created_at desc);

-- Acesso: administrador vê tudo; usuário só a academia do seu acesso e pode importar para ela;
-- desfazer importação só o administrador.
do $$
declare
  t text;
begin
  foreach t in array array['importacoes', 'passagens', 'gympass'] loop
    execute format('alter table %1$s enable row level security', t);
    execute format('drop policy if exists "%1$s_select" on %1$s', t);
    execute format(
      'create policy "%1$s_select" on %1$s for select to authenticated using (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_insert" on %1$s', t);
    execute format(
      'create policy "%1$s_insert" on %1$s for insert to authenticated with check (is_admin() or academia_id = minha_academia())', t);
    execute format('drop policy if exists "%1$s_delete" on %1$s', t);
    execute format('create policy "%1$s_delete" on %1$s for delete to authenticated using (is_admin())', t);
  end loop;
end $$;

-- Quem importou pode desfazer a própria importação nos primeiros 15 minutos (arquivo errado, falha no meio).
-- As linhas da importação saem junto (on delete cascade).
drop policy if exists "importacoes_delete_propria" on importacoes;
create policy "importacoes_delete_propria" on importacoes for delete to authenticated
  using (criado_por = auth.uid() and created_at > now() - interval '15 minutes');

-- Atualiza o total de linhas novas depois que a importação termina.
drop policy if exists "importacoes_update" on importacoes;
create policy "importacoes_update" on importacoes for update to authenticated
  using (is_admin() or academia_id = minha_academia()) with check (is_admin() or academia_id = minha_academia());
