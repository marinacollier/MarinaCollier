# Seus dados no armazenamento do Claude

## Onde os dados ficam agora

Quando o MARINA OS abre como Artifact no app do Claude, ele usa o banco de documentos do próprio Artifact (`claude.use("db")`). A sincronização liga sozinha: sem login, sem botão.

- **Neste aparelho** (IndexedDB), como sempre. Continua funcionando offline.
- **No armazenamento do Artifact**, na coleção `rec`: um documento por registro (`rec/<id>`) com `{c: coleção, id, v: versão, d: dados | null, del, at, dev}`. O perfil fica no documento `_profile+me`.
- Nunca sobem para a nuvem: hash/sal do PIN, id do Face ID, estado da sincronização e conflitos (`privacyLock`, `cloudSync*`, `syncConflicts`).

Status em Ajustes → Dados: "Sincronizado com o Claude · há 1 min", "Salvo só neste aparelho" ou o erro. Se der erro, aparece uma bolinha discreta no canto superior direito.

## Como funciona

- **Primeira vez neste aparelho:** antes de mexer em qualquer coisa, guarda uma cópia automática (Ajustes → Dados → cópias). Se o armazenamento do Claude estiver vazio, envia tudo, lê de volta e confere (quantidade e conteúdo de cada registro). Se já tiver dados, **a nuvem ganha**: uma instalação nova nunca sobrescreve o que você editou. O que só existe aqui é enviado depois; uma edição local diferente vira item em "Para revisar".
- **Depois:** envia cerca de 2 s depois de cada mudança; busca ao abrir o app, ao voltar para ele e ao reconectar; e recebe ao vivo o que outro aparelho gravou.
- **Edição nos dois aparelhos:** fica a versão mais nova, e a outra vai para "Para revisar". Exclusões viajam como marcação (`del: true`), sem sumir de vez.

## Quem pode ver e mexer

- O Artifact é publicado com a regra `{path: "", read: "owner", write: "owner"}`: **só a dona do Artifact** lê e grava esses dados.
- **Não compartilhe o Artifact por link público.** Mesmo com essa regra, mantenha-o privado.
- O Claude, numa sessão de desenvolvimento sua, consegue ler e gravar esses documentos pela ferramenta de dados de Artifact da plataforma, **agindo como você**. Use isso para conferir, consertar ou recuperar registros. Por isso, só peça a ele em conversas suas.

## Limites

- Documento de até 256 KiB. Um registro maior (por exemplo, uma nota enorme) fica só neste aparelho, e o status avisa.
- No máximo 25.000 documentos por Artifact.
- Gravações em sequência são limitadas: o app grava poucas de cada vez e espera um pouco quando a plataforma pede (`resource_exhausted`).
- Não há transação. Vale a última gravação, e a fusão usa a versão (`v`), não o horário.
- Fora do Artifact (navegador comum, testes, cópia salva), o `use("db")` volta vazio e o app funciona exatamente como antes: só no aparelho, ou com Supabase se estiver configurado.

## Como recuperar

1. **A fusão deu errado:** vá em Ajustes → Dados → cópias automáticas e restaure "Antes da primeira sincronização com o Claude". A restauração também sobe para a nuvem.
2. **Perdi o aparelho, ou o armazenamento foi apagado:** abra o Artifact de novo. Os dados descem sozinhos da nuvem.
3. **Um registro sumiu ou ficou estranho:** peça ao Claude, na sessão de desenvolvimento, para ler `rec` no banco do Artifact e regravar o documento. Uma exclusão continua lá como `del: true` com a última versão em `v`; o conteúdo anterior pode estar em "Para revisar" ou nas cópias automáticas.
4. Faça backup de vez em quando (Ajustes → Dados → Backup). É a cópia que não depende de nenhuma nuvem.
