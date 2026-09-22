# BFIT - Controle de unidades

Next.js + Supabase. Base de login, menu e usuários reaproveitada do sistema Gestão de Financiamento,
com banco de dados próprio.

## Primeira configuração

1. Crie um projeto novo no Supabase.
2. No SQL Editor, rode `supabase/migrations/0001_init.sql`.
3. Em Authentication → Users, crie o usuário `brunogomesdasilva@gmail.com` (ele vira administrador automaticamente).
4. Copie `.env.local.example` para `.env.local` e preencha com as chaves do projeto (Project Settings → API).
5. `npm install` e depois `iniciar-sistema.bat` (abre em http://localhost:3001).
