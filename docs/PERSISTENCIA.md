# Persistência — onde ficam os seus dados (e o que pode apagá-los)

Documento honesto: o que o MARINA OS guarda, onde, e quando você pode perder algo.

## 1. Onde os dados vivem

- **Tudo fica no próprio aparelho, no IndexedDB do navegador**, por *origem* (o endereço do site:
  protocolo + domínio + porta). Não existe banco de dados no servidor para os seus dados pessoais.
  As Edge Functions do Supabase servem só para integrações e IA — nada da sua vida fica lá.
- Código: `src/data/storage.ts` (adaptador IndexedDB, banco `marina-os`, chave única `db` com o banco
  inteiro) e `src/data/store.ts` (o estado do app num store zustand).
- **Ciclo de vida** (`store.ts`):
  - `hydrate()` — na abertura: lê o aparelho (duas tentativas), migra o esquema (`migrate`), aplica os
    seeds aditivos (abaixo) e só então começa a salvar.
  - salvamento automático com 250 ms de espera depois de cada mudança; e também ao esconder o app
    (`pagehide` / `visibilitychange`).
  - `persist()` — salva **e lê de volta**; só diz "feito" quando o aparelho tem exatamente o estado atual.
  - `flushNow()` — força o salvamento pendente (usado antes de exportar, depois de importar/restaurar e
    antes de uma atualização do app assumir). Lança erro se não conseguiu salvar.
  - Se salvar falha, aparece o aviso "não salvou" (`saveFailed`) — nunca é engolido em silêncio.
- `main.tsx` pede ao navegador armazenamento persistente (`navigator.storage.persist()`), para o iPhone
  não apagar sob pouco espaço. Instalar na Tela de Início ajuda o iOS a respeitar isso.

## 2. Seeds e migrações (o que roda a cada versão nova)

Uma versão nova do app **não apaga nem reescreve** o que você fez. Tudo é aditivo:

- **Seed da vida real** (`src/data/seed/migrate.ts`, `applyLifeSeed`): roda quando `profile.seedVersion`
  é menor que `LIFE_SEED_VERSION`.
  - registros do seed têm **ids estáveis** (`seed:…`, `proj-santander`…), então dá para saber o que já existe;
  - `profile.seedIds` = ids que este aparelho já recebeu → **um registro do seed só é adicionado uma vez**;
  - `profile.removedSeedIds` = "lápides": o que você apagou nunca volta (`actions.remove` grava a lápide;
    desfazer remove a lápide);
  - um registro do seed que você **editou** (`updatedAt ≠ createdAt`) nunca é sobrescrito;
  - um registro que você já tem com outro id (mesmo título — livro, tarefa, item de viagem) não é
    adicionado de novo ao lado.
- **Daily Briefing embutido** (`src/data/briefing/bundled.ts`): entra pelo **mesmo importador** do JSON
  colado (planBriefing → applyPlan, um lote com desfazer), uma vez por instalação
  (`profile.briefingsApplied`) e só na própria semana.
- **CRM de marcas UGC** (`src/data/seed/ugc-crm.ts`) e **plano bíblico** (`src/data/seed/spiritual.ts`):
  mesmas regras — só criam o que falta e que você nunca apagou; nunca mudam status, notas ou checks.

## 3. "Os itens de viagem confirmados voltaram para *a confirmar*" — as 3 correções

1. **Aba velha só salva se mudou algo** (`dirty` em `store.ts`): uma instância antiga do app (outra aba,
   a versão anterior ainda aberta em segundo plano) ao ser escondida ou atualizada **não grava** a cópia
   velha dela por cima do que a versão nova salvou. Antes, ela gravava e "desconfirmava" tudo.
2. **O seed não adiciona uma cópia com o mesmo nome** (`SAME_AS.tripItems` em `migrate.ts`): um item de
   viagem que você já tem (confirmado, feito, ou com outro id) não ganha um irmão "a confirmar".
3. **O seed nunca é salvo por cima de dados ilegíveis** (`hydrate`): se a leitura do aparelho falha, o app
   roda só em memória com o aviso, e **não escreve nada** — na próxima abertura ele lê de novo os seus dados.

Teste que simula exatamente isso: `src/data/seed/new-version.test.ts` (itens confirmados + edições +
exclusões → "versão nova" com o seed reaplicado → nada reverte, nenhum id de seed ressuscita, ids iguais;
mais a aba velha e a leitura que falha).

## 4. E no preview do Claude (Artifact)?

- **Cada URL de Artifact é uma origem própria.** O IndexedDB é por origem.
- **Republicar no MESMO URL mantém os dados** (mesma origem, mesmo IndexedDB). A versão nova roda o
  `hydrate` acima e preserva tudo.
- **Um URL diferente** (um Artifact novo), **outro aparelho**, **outro navegador**, aba anônima ou "limpar
  dados do site" = **app vazio** (com o seed). Os dados antigos continuam na origem antiga, mas este endereço
  não os vê. Para levar os dados: **Backup → Exportar** num lugar e **Importar** no outro.
- O mesmo vale para o site publicado vs. o preview: são origens diferentes, dados diferentes.

## 5. Backup e restauração

- `src/features/settings/backup.ts` — formato (`app: 'marina-os'`, `format`, `schemaVersion`, `counts`,
  `checksum` FNV-1a, `db`) e validação; ids repetidos no arquivo são unificados (o mais novo vence).
- `src/features/settings/backup-io.ts` — **Exportar** (abre o compartilhar do iPhone; grava
  `profile.lastBackupAt` só quando salvou) e **Restaurar** (substitui tudo, sem mesclar → nada duplica;
  persiste antes de anunciar sucesso; mantém a marca de onboarding do aparelho).
- Ajustes → Dados mostra **"Último backup"** e, se fizer **7 dias ou mais** (ou nunca), um lembrete gentil.
- **Cópias automáticas** (`src/data/snapshots.ts`): antes de **qualquer importação** (arquivo de mudanças,
  Daily Briefing colado, restaurar backup) o app guarda uma cópia completa no próprio aparelho (as 3
  últimas, num IndexedDB separado `marina-os-snapshots`). Em Dados → "Cópias automáticas" → Restaurar.
  Elas ficam **no mesmo aparelho e na mesma origem** — não substituem o backup em arquivo.

## 6. Resumo prático

| Situação | Seus dados |
| --- | --- |
| Versão nova do app (deploy / republicar no mesmo URL) | ficam, tudo preservado |
| Fechar o app, reiniciar o iPhone | ficam |
| Outro URL / outro aparelho / outro navegador | não aparecem → use backup |
| "Limpar histórico e dados" do Safari | apagados → use backup |
| Importação errada | "Desfazer" no lote, ou restaurar a cópia automática |
