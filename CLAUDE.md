@AGENTS.md

# Regras de Git deste projeto
- Duas pessoas trabalham neste repositório.
- A branch principal se chama `master`.
- Sempre rode "git pull" antes de começar qualquer tarefa.
- Nunca trabalhe direto na master: crie uma branch para cada mudança.
- Ao terminar, faça commit e push da branch e abra um Pull Request. Não faça merge na master sem perguntar.
- Nunca commite .env ou .env.local.
- A Vercel está ligada ao GitHub: tudo que entra na `master` é publicado no site oficial automaticamente. Não use mais `vercel deploy` pelo computador (sobrescreveria a versão da master).
- Antes de qualquer push para a `master`, rode `git pull` e confira que a sua cópia tem os commits mais recentes do GitHub. Nunca use `git push --force` na `master`: uma cópia desatualizada publicada apaga do site oficial o que a outra pessoa fez.
