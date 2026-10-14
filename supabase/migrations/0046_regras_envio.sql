-- Envios automáticos dos relatórios (menu Administrador > Envios automáticos): cada regra diz qual relatório vai,
-- por qual canal (WhatsApp ou e-mail), para quem (um grupo de WhatsApp, os administradores e/ou pessoas escolhidas),
-- em que dias (só dias úteis ou dias da semana escolhidos) e a que hora (de Brasília). O agendador da Vercel roda de
-- hora em hora (/api/cron/envios) e envia as regras ativas daquela hora, no máximo uma vez por dia cada.
create table if not exists regras_envio (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  relatorio text not null check (relatorio in ('manutencao', 'compras', 'acompanhamento', 'semanal')),
  canal text not null default 'whatsapp' check (canal in ('whatsapp', 'email')),
  grupo_id text,            -- WhatsApp: ID do grupo (Z-API), ex.: 120363019502650977-group
  grupo_nome text,          -- só para mostrar na tela
  para_admins boolean not null default false,          -- também para todos os administradores ativos
  usuarios uuid[] not null default '{}',               -- também para estas pessoas (WhatsApp/e-mail do cadastro)
  dias text not null default 'uteis' check (dias in ('uteis', 'semana')),
  dias_semana int[] not null default '{}',             -- com dias = 'semana': 0 = domingo ... 6 = sábado
  hora int not null check (hora between 0 and 23),     -- hora de Brasília
  com_faturamento boolean not null default true,       -- acompanhamento: versão completa (true) ou sem faturamento
  ativo boolean not null default false,
  ultimo_envio date,                                   -- dia (Brasília) do último envio automático: evita repetir
  ultimo_resultado text,
  criado_em timestamptz not null default now()
);
alter table regras_envio enable row level security;
drop policy if exists "regras_envio_admin" on regras_envio;
create policy "regras_envio_admin" on regras_envio for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- Regras iniciais (pedido do cliente). As de grupo começam desligadas: escolha o grupo na tela e ative.
-- As duas últimas repetem o que já era enviado automaticamente (podem ser desligadas na tela).
insert into regras_envio (nome, relatorio, dias, dias_semana, hora, ativo, para_admins, usuarios)
select * from (values
  ('Manutenções pendentes - grupo', 'manutencao', 'uteis', '{}'::int[], 8, false, false, '{}'::uuid[]),
  ('Compras pendentes - grupo dos gerentes', 'compras', 'semana', '{4}'::int[], 8, false, false, '{}'::uuid[]),
  ('Acompanhamento diário - grupo dos gerentes', 'acompanhamento', 'uteis', '{}'::int[], 9, false, false, '{}'::uuid[]),
  ('Acompanhamento diário - administradores', 'acompanhamento', 'uteis', '{}'::int[], 8, true, true, '{}'::uuid[]),
  ('Relatório semanal - Bruno', 'semanal', 'semana', '{4}'::int[], 8, true, false,
    coalesce((select array_agg(id) from profiles where email = 'brunogomesdasilva@gmail.com'), '{}'::uuid[]))
) as v(nome, relatorio, dias, dias_semana, hora, ativo, para_admins, usuarios)
where not exists (select 1 from regras_envio);
