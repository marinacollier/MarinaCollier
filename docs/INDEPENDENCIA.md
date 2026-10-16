# Independência — Entrega 1: o app com os seus dados na nuvem

Status: **preparado, desligado.** Nada foi criado, publicado ou ligado. O código fica inerte até você
fazer os passos da seção 3 e ligar a sincronização em Ajustes → Dados.

> Dentro do Artifact no app do Claude, o mesmo motor sincroniza sozinho com o armazenamento do próprio
> Artifact, sem login. Ele tem preferência sobre o Supabase. Veja [CLAUDE_DB.md](CLAUDE_DB.md).

## 1. Como funciona

```
 iPhone (fonte da tela)                         Supabase (sua conta)
 ┌──────────────────────────┐                  ┌──────────────────────────────┐
 │ zustand store ──► IndexedDB (salva sempre)  │ tabela public.records        │
 │        │ depois de salvar                   │ (user_id, collection, id,    │
 │        ▼                                    │  data jsonb, version,        │
 │ src/data/sync/engine.ts                     │  deleted, updated_at, seq)   │
 │  base   = o que já combinou com a nuvem     │ RLS: só auth.uid() = user_id │
 │  outbox = diferença base × banco local ─────┼► upsert (PostgREST/REST)     │
 │  merge  ◄───────────── puxa linhas seq > cursor ──────────────────────────┤
 └──────────────────────────┘                  └──────────────────────────────┘
```

- **O aparelho continua sendo a fonte da tela.** Tudo salva primeiro no IndexedDB, como hoje. A nuvem é
  uma cópia sincronizada; sem internet o app funciona igual.
- **Cada registro vira uma linha** (`tasks/abc`, `meals/xyz`…). O perfil vira `_profile/me`.
- **Fila de saída (outbox):** depois de cada salvamento, o motor compara o banco local com a última
  versão combinada com a nuvem (hash do conteúdo por registro). O que mudou entra na fila, que fica
  gravada no aparelho (store `marina-os-sync`, separada do banco e fora dos backups) — mudança feita
  offline sobrevive a fechar o app e sai quando a internet volta (tenta de novo em 15 s, 1 min, 5 min…).
- **Versão = `updatedAt` em milissegundos.** Registro do seed nunca editado tem versão 0 (um aparelho
  novo nunca passa por cima do que você editou em outro).
- **Sincronizar** = puxar o que mudou (cursor `seq`, um contador do servidor) → juntar → enviar a fila.
  - Só um lado mudou → fica essa mudança.
  - Os dois lados mudaram o mesmo registro → **fica a versão mais nova** e a outra vai para
    **Ajustes → Dados → Para revisar**, onde dá para "Manter assim" ou "Usar a outra versão". Nunca some
    em silêncio.
  - Apagar vira **lápide** (`deleted = true`, conteúdo `null`). Não existe política de DELETE.
  - O servidor também só aceita versão maior (trigger `records_stamp`), então duas sincronizações ao
    mesmo tempo não fazem a mais velha vencer.
- **Status honesto:** "Salvo neste aparelho" (desligado, offline, com fila ou com erro) ×
  "Sincronizado às hh:mm" (só depois de uma rodada completa sem pendências).

Código: `src/data/sync/engine.ts` (motor), `postgrest.ts` (REST com fetch e o token da sua sessão, sem
SDK), `index.ts` (ligação com o app), `fake-postgrest.ts` + `sync.test.ts` (testes),
`src/features/settings/CloudSyncSection.tsx` (tela), `supabase/migrations/0002_records.sql` (tabela).

## 2. O que é inerte (e por quê)

A sincronização só faz qualquer requisição se **as três** condições valerem:

1. o app foi publicado com `VITE_SUPABASE_URL` (ou `VITE_MARINA_API_URL`) **e** `VITE_SUPABASE_ANON_KEY`;
2. você entrou na **Conta do MARINA OS** (e-mail + código);
3. você ligou neste aparelho, pelo botão **"Enviar meus dados para a nuvem"**.

Sem isso, a seção "Nuvem" nem aparece e o status fica "Salvo neste aparelho". Restaurar um backup com a
sincronização ligada num aparelho novo **não** liga nada: ela se desliga até esse aparelho fazer o envio
conferido dele.

## 3. Como ligar (precisa da sua aprovação e das suas contas)

1. **Supabase:** crie um projeto (plano gratuito serve para começar). Anote a *Project URL* e a *anon
   public key* (Settings → API). A *anon key* é pública por desenho; a *service role key* **nunca** vai
   para o app.
2. **Auth:** em Authentication → Providers deixe *Email* ligado; crie seu usuário (Authentication →
   Users → Invite) — o app usa `create_user: false`, então ninguém mais consegue se cadastrar. No
   template de e-mail, use o código (`{{ .Token }}`).
3. **Banco:** rode as migrações na ordem, no SQL Editor ou com a CLI (`supabase db push`):
   `0001_integrations.sql` e `0002_records.sql`.
4. **Funções** (só se quiser integrações/IA): `supabase functions deploy …` e os segredos delas — ver
   `docs/INTEGRATIONS.md`. A sincronização em si **não** precisa de função: fala direto com o REST.
5. **Hospedagem** (Vercel, Netlify ou Cloudflare Pages): conecte o repositório, build `npm run build`,
   pasta `dist`, e as variáveis:
   - `VITE_SUPABASE_URL=https://<ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<anon key>`
   - (opcional) `VITE_MARINA_API_URL=https://<ref>.supabase.co/functions/v1`
6. **Atenção ao endereço:** os dados do IndexedDB são por endereço (origem). Num domínio novo o app
   abre vazio. Antes de trocar: **Exportar backup** no endereço antigo → abrir o novo → **Importar**.
7. No app: Ajustes → Conta do MARINA OS → entrar. Depois Ajustes → Dados → **Enviar meus dados para a
   nuvem**. O app envia tudo, baixa de volta e compara **contagem por coleção** e **hash de cada
   registro**; mostra a comparação e **só liga se bater**. Nada é apagado do aparelho.
8. **Segundo aparelho:** restaure nele o backup do primeiro (mesmos ids → nada duplica) e toque em
   "Enviar" lá também. O que a nuvem tiver de mais novo prevalece; o resto chega na primeira sincronização.

## 4. Custos

Supabase tem plano gratuito com limites de banco, transferência e usuários; projetos gratuitos podem
ser pausados por inatividade. Vercel/Netlify/Cloudflare Pages têm planos gratuitos para sites
estáticos. **Verifique os preços e limites atuais nos sites antes de criar** — mudam com frequência e
não estão garantidos aqui. O volume do MARINA OS (alguns milhares de registros JSON) é pequeno.

## 5. Privacidade

- Isolamento por RLS: cada linha só é lida/escrita por quem a criou (`auth.uid() = user_id`).
- **Não há criptografia ponta a ponta nesta entrega.** O conteúdo fica legível para quem administra o
  projeto Supabase (você) e, tecnicamente, para o provedor. O bloqueio de privacidade do app é uma trava
  de tela, não cifra os dados. Próximo passo possível: cifrar `data` no aparelho com uma chave derivada
  de uma frase-senha sua (e aceitar que esquecer a frase = perder a cópia da nuvem).
- **Nunca sobe:** hash/sal do PIN e id do Face ID (`privacyLock`), estado da sincronização, conflitos,
  tokens de login (ficam fora do banco), tokens de Google/Microsoft (ficam no servidor das funções).

## 6. O que continua só no aparelho

- O banco completo no IndexedDB (fonte da tela) e as **cópias automáticas** antes de importações.
- Bloqueio de privacidade, a fila de sincronização, o cursor e a lista "Para revisar".
- Backups em arquivo continuam funcionando e continuam recomendados.

## 7. Voltar atrás (rollback)

- **Pausar:** Ajustes → Dados → Pausar. Nada é apagado; o app volta a ser só local.
- **Desligar de vez:** remova as variáveis `VITE_SUPABASE_*` e publique de novo — a seção some e
  nenhuma requisição é feita. Os dados do aparelho não mudam.
- **Apagar a nuvem:** no Supabase, `delete from public.records where user_id = '<seu id>';` (ou apague o
  projeto). O aparelho não é afetado.
- **Voltar o banco:** `drop table public.records; drop function public.records_stamp(); drop sequence public.records_seq;`

## 8. Limites conhecidos

- Conflito é por registro inteiro (não por campo): a versão mais nova fica inteira, a outra vai para revisão.
- Os dois aparelhos devem rodar a mesma versão do app (o PWA se atualiza sozinho). Coleções que só uma
  versão mais nova conhece ficam guardadas na nuvem e não são aplicadas até atualizar.
- O cursor usa um contador do servidor (`seq`) e cada rodada relê as últimas 100 posições, para pegar
  uma escrita simultânea que tenha confirmado atrasada. Com muitas escritas ao mesmo tempo (não é o caso
  de uma pessoa) isso poderia não bastar — limite conhecido.
- Registros criados pelo seed com ids aleatórios podem duplicar num segundo aparelho que não veio de
  backup — por isso o passo 8.
