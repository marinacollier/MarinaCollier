# MARINA OS — Auditoria e arquitetura da camada Conhecer · Aprender · Evoluir

27/10/2026. Etapa 0 do plano "Life Intelligence & Personal Growth". Nada novo foi construído antes desta auditoria.

## 1. Os dados de hoje estão seguros?

| Garantia | Como está provado | Situação |
|---|---|---|
| Nada se perde ao reabrir, recarregar, abrir outra aba ou reiniciar offline | `e2e/restart.mjs` (Chromium, perfil iPhone 13), `HARDENING_REPORT.md` | ok |
| Versão nova não sobrescreve o que ela editou | `src/data/seed/new-version.test.ts`, `migrate.test.ts` | ok |
| Coleção nova entra sem quebrar dados antigos | `migrate()` em `src/data/defaults.ts` cria a lista vazia que faltar; seeds novos são idempotentes por id estável e respeitam `removedSeedIds` | ok |
| Backup ida e volta com igualdade do banco inteiro | `backup-roundtrip.test.ts`, `scripts/verify-backup.ts` | ok |
| A Lumos só diz "feito" depois de gravar e ler de volta | `lumos-persist.test.ts` | ok |
| Sincronização com o armazenamento do Claude | `src/data/sync/*.test.ts`; perfil "device-only" nunca sobe | ok |
| Correções P0 desta semana: "hoje às 16h tenho papo da Nemu" e "Outra atividade" | `lumos-phrasing.test.ts` (16 frases) | corrigido 27/10 |

Riscos reais que continuam abertos:

1. **O link publicado do app (claude.ai/artifact/9ndW…) não abre nesta conta do Claude.** Os dados reais dela vivem nesse
   link (IndexedDB e armazenamento do Artifact são por endereço). Publicar num link novo começaria vazio. Nenhuma
   publicação até que a sessão rode na conta dona do link.
2. **A trava é de tela, não é criptografia.** Serve para operação e carreira, mas não basta para escrita íntima.
3. **A sincronização envia todas as coleções.** Diário, reflexões e textos literários iriam para o armazenamento
   do Artifact (só a dona lê, mas sai do aparelho). A camada nova precisa de uma lista de coleções privadas.
4. iPhone real ainda não testado (Safari/PWA).

Conclusão: o código atual protege os dados existentes e aceita coleções novas sem risco. Dá para começar as
expansões, **todas aditivas**, e com uma regra nova de privacidade antes de qualquer conteúdo íntimo.

## 2. O que já existe e será reaproveitado

| Pedido | Já existe | Decisão |
|---|---|---|
| Expedição África do Sul | `trips` + `tripItems` (seções, status, pagamento, valores), Trip OS, seed `trip-africa-do-sul`, Agenda, Home | **Estender** Trip/TripItem, sem módulo novo |
| Meu Universo / Beauty & Fragrance | nada equivalente (`memory` guarda frases, não itens) | **Uma coleção nova genérica** `universeItems` + `scentLogs`; Perfumes é a primeira estante |
| Ateliê Literário | `notes` (nota/ideia) é simples demais; não há versões | **Coleções novas** `literaryWorks`, `literaryVersions`, `literaryCollections`, privadas por padrão |
| Diário / Meu Interior | não existe | Etapa 5 (depois), usando a mesma regra de privacidade do Ateliê |
| Learning Engine | `studyTracks`, `studyItems`, `books` (com capítulo/página atual) | Etapa 2: estender com Skill, Evidence e revisão espaçada; não duplicar Estudos |
| English Coach | nada | Etapa 3 |
| Estudo bíblico (Rute) | `spiritualPlans` + `spiritualSessions`, importar estudo, orações | Etapa 5: estender (reflexões, temas), não recriar |
| Memória com origem e confiança | `memory` já tem `source` (seed/marina/lumos/observed) e `status` (confirmed/observed) | Reaproveitar o mesmo vocabulário em todas as coleções novas |
| Carreira / Vogue / Forbes | `opportunities`, `contacts`, `wins`, `execPosts`, Executive Career Review | Etapa 6: estados de imprensa sobre `wins`/`opportunities` |
| Navegação | Home operacional + Lumos + Espaços em 4 grupos | Entradas novas só em Espaços (Vida / Aprender). Nenhuma aba nova, nenhum card novo na Home |

## 3. Regras comuns da camada nova

- **Fato x suposição.** Todo registro novo guarda `source` (`marina` | `lumos` | `seed`) e, quando é algo que ela
  ainda não confirmou, `confirmed: false`. A interface mostra "a confirmar". A Lumos nunca promove sozinha.
- **Possuir ≠ gostar ≠ desejar.** Em Meu Universo, posse (`tenho`, `acabou`, `desejo`…) e opinião (`amei`, `gostei`…)
  são campos separados.
- **Privacidade por coleção.** `PRIVATE_COLLECTIONS` (Ateliê e, depois, Diário) nunca sobem para a nuvem; ficam no
  aparelho e no arquivo de backup dela (a cópia dela), para uma restauração nunca perder um texto.
- **Sem inventar.** Nada de preço ao vivo, clima, disponibilidade, notas olfativas não confirmadas ou texto
  literário reconstruído. Campo vazio + "pendente" é melhor do que um valor inventado.
- **Código convencional primeiro.** Cadastro, filtros, busca, totais, conflitos e exportação sem IA. IA só onde
  ela pede interpretação (Etapas 2, 3 e 5), sempre pelo servidor, com custo registrado.
- **Aditivo.** Cada módulo traz seu seed idempotente (ids estáveis, respeita o que ela apagou), entra no backup,
  na sincronização (exceto privadas) e na busca, com testes de ida e volta.

## 4. Ordem de entrega

| Etapa | Entrega | Situação |
|---|---|---|
| 0 | Esta auditoria + P0 da Lumos | feito |
| 1a | **Expedição África do Sul** sobre a viagem existente | em construção |
| 1b | **Meu Universo · Beauty & Fragrance** | em construção |
| 1c | **Ateliê Literário** (biblioteca, editor, versões, acervo inicial, coleções, painel com dados reais) | feito 28/10 |
| 2 | Learning Engine (Skill, Evidence, revisão espaçada) sobre Estudos e Livros | depois da validação dela |
| 3 | English Coach (correção, error log, revisão espaçada; tradutor só com API configurada) | idem |
| 4 | Meu Universo: outras estantes (maquiagem, skincare, lugares) | idem |
| 5 | Meu Interior (diário privado), Ateliê com IA, estudo bíblico ampliado | idem |
| 6 | Growth Review + visibilidade executiva | idem |

As três entregas da Etapa 1 vieram como pedidos explícitos e são independentes entre si: cada uma é aditiva,
testada isoladamente e só entra no app depois de passar a suíte inteira.
