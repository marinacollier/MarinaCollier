# Career & Executive Growth 2027 — Fase 0 (diagnóstico e plano)

> Status: **proposta para aprovação**. Nada desta fase foi implementado ainda.
> North Star 2027: Head of Product / Head of AI Products (ou diretoria) em empresa média/grande, Brasil ou exterior.

## 1. Diagnóstico do estado atual

**Stack.** React 19 + TypeScript strict + Vite 7 + Tailwind 4, PWA instalável. Estado em um único store (zustand) com API `actions` (create/update/remove/restore). Testes: Vitest + Testing Library (≈800 testes), ESLint, `tsc -b`.

**Persistência.** Local-first: o banco inteiro (`DB`) vive no **IndexedDB do aparelho** (`marina-os` / chave `db`), via `StorageAdapter` (`src/data/storage.ts`). Gravação com debounce + `flushNow`. Migração de schema (`data/defaults.ts → migrate`) e seed versionado (`data/seed`, hoje v6) que só atualiza registros de seed nunca editados.

**Autenticação.** **Não existe login nem backend.** É um app de uma pessoa, num aparelho. Backup/restore por JSON (Ajustes → Backup). As integrações que exigem segredo (Google/Microsoft/Organizze) estão desenhadas para passar por servidor e continuam desligadas por flag.

**Módulos que já cobrem parte do pedido** (reaproveitar, não duplicar):

| Necessidade | Já existe | Lacuna |
|---|---|---|
| CareerGoals | `goals` (níveis dia/semana/maior, status, progress manual, parentId) | falta ligação explícita "carreira" e evidências |
| CareerActivities | `tasks` com `recurrence` + `occurrences` (conclusão por dia, `completedAt`), `weekTemplate`, `scheduleOverrides` (mudança só de um dia), timeline do dia | falta tipo "atividade de carreira" e contagem semanal |
| ProfessionalEvidence | `wins` (ProfessionalWin: data, projeto, impacto, link) | faltam decisão, métricas, confidencialidade, verificação |
| ProfessionalContacts | só `Person` embutido em projetos/links e Waiting For | **não há entidade de contato** |
| Opportunities | — | **não existe** |
| FinancialContracts / receitas | `expenses` (só saída), `financialAccounts`, `financialCategories`, Organizze desligado | **não há receitas nem contratos** |
| Revisão mensal | `monthlyReviews` (highlights, notes, takeForward) + Monthly Board no seed | falta o roteiro de carreira |
| Estudos | `studyTracks`/`studyItems` (Inglês ativo, referências nunca viram tarefa) | falta "inglês executivo" como meta semanal |
| Lumos | conversa determinística (`features/assistant`), camada de inteligência (`data/intel`: contexto, fila "precisa de você", "o que mudou", ActionGraph, planner, memória, `lifeLog` com proveniência) e política de ação (interno → executa + Desfazer; sensível → confirma) | faltam intents de carreira e finanças |

**Como as coisas são guardadas hoje.**
- **Tarefas recorrentes:** a regra de recorrência fica na tarefa; cada dia concluído ou pulado vira uma `Occurrence` (`parentType` + `parentId` + `date`).
- **Mudança de um dia só:** fica em `ScheduleOverride` e não altera o padrão.
- **Metas:** progresso manual (0–100) em `goals`.
- **Acontecimentos reais:** ficam em `lifeLog`, com quem fez e de onde veio (você, fato, integração, inferência, sugestão).

**Bugs de persistência / conclusão / associação já verificados.**
- **Conclusão grava o horário real:** tarefa, rotina e Luna gravam `completedAt` e a data é sempre a de São Paulo, não UTC (testado).
- **Associação errada por nomes parecidos:** a Lumos busca por título com desambiguação ("qual delas?") e nunca escolhe sozinha quando há mais de um candidato. Há testes com frases reais.
- **Risco ainda aberto:** os dados vivem só no aparelho. Se o navegador ou o iPhone limpar o armazenamento, perde-se tudo o que não estiver no backup JSON. Isso pesa mais com dados financeiros e de carreira (ver Riscos).

## 2. Lacunas técnicas

1. **Sem login, sem backend, sem isolamento entre usuários.** Os pedidos "persistência após logout/login" e "permissões e isolamento de dados" não têm onde existir hoje. Criar autenticação paralela está fora do escopo (você pediu para não criar).
2. **Finanças só conhecem saída.** Faltam: receita prevista vs. recebida, contrato recorrente, receita extra e o estado "atrasado".
3. **Faltam três coleções:** contatos profissionais, oportunidades e evidências com métricas e confidencialidade.
4. **Falta trava local para dados sensíveis.** Hoje qualquer pessoa com o celular desbloqueado abre o app.

## 3. Proposta de UX (enxuta, sem virar ERP)

- **Home:** nada de card fixo.
  - Por regra própria (Lumos-first), "Carreira" só aparece como **uma linha** quando é relevante, por exemplo: "Próximo follow-up: Fran · quinta", "Entrevista terça — quer preparar?" ou "2 de 3 sessões de inglês executivo esta semana".
  - O card discreto de Career & Growth (objetivo Head 2027 + próxima ação + atividades da semana) entra como **insight** da Lumos, não como widget permanente.
  - Se você preferir mesmo o card fixo, ele é configurável.
- **Espaços → Trabalho → "Carreira 2027"**, uma página só com cinco blocos:
  1. North Star + objetivos do trimestre;
  2. Esta semana: inglês executivo 3×, networking 1×, posts 2×, liderança 1h, mostrados como contagem, sem porcentagem;
  3. Pipeline de oportunidades: lista simples com status e próxima ação;
  4. Pessoas: follow-ups;
  5. Cases e evidências: com o selo "sem métricas" quando faltar.
  - A revisão mensal abre a partir dessa página.
- **Finanças:** "Contratos" dentro de Dinheiro, com o mês mostrando previsto / recebido / atrasado / cancelado.
  - Renda disponível só aparece quando houver despesas PJ e impostos lançados por você. Nunca assume alíquota.
- **Lumos:** o caminho principal. "Registra 30 min de inglês executivo", "adiciona vaga de Head of Product", "quanto tenho previsto este mês?", "o pagamento do Fashion Finder caiu".

## 4. Modelo de dados (extensões; convenção atual: coleções no `DB`, `Entity` com id/createdAt/updatedAt)

**Reaproveitar e estender:**

- **`Goal`:** + `domain?: 'carreira'`, + `evidenceIds?: ID[]`.
  - North Star = `level: 'maior'`, e os trimestrais são filhos via `parentId`.
  - Progresso continua manual ou calculado só por evidência, **nunca por tempo decorrido**.
- **`Task` com `recurrence`:** as atividades de carreira (inglês executivo, networking, posts, liderança) ganham `careerKind?: 'ingles_exec' | 'networking' | 'post' | 'lideranca' | 'review'` e `goalId?`.
  - Cada execução vira `Occurrence` com `completedAt` e `durationMin`, que é um campo novo opcional em `Occurrence`.
  - A meta semanal fica em `Goal`, por exemplo "3 sessões/semana" com `targetPerWeek?: number`.
- **`ProfessionalWin` (evidência):** + `context?`, `responsibility?`, `decision?`, `metrics?`, `confidentiality: 'publico' | 'interno' | 'confidencial'`, `verification: 'rascunho' | 'verificado'`.
- **`MonthlyReview`:** + `kind?: 'vida' | 'carreira'` e as 6 perguntas como campos de texto. O histórico fica salvo naturalmente.

**Coleções novas (só três, porque não existem hoje):**

- **`contacts: ProfessionalContact`**
  - `name`, `company?`, `role?`, `relationship`, `lastInteraction?`, `nextFollowUp?`, `notes?`.
  - O Waiting For passa a poder apontar `contactId`.
- **`opportunities: Opportunity`**
  - `company`, `role`, `country?`, `workModel?`, `compensation?` (texto livre ou centavos + `currency`), `employmentType?`, `status: 'radar' | 'conversa' | 'processo' | 'entrevista' | 'proposta' | 'fechada' | 'descartada'`, `nextAction?`, `nextActionDate?`, `contactIds?`, `notes?`.
- **`contracts: FinancialContract`**
  - `client`, `amountCents`, `currency`, `paymentDay`, `recurrence: 'mensal'`, `status: 'ativo' | 'encerrado'`, `startDate?`, `endDate?`, `notes?`.
- **Recebimentos: estender `Expense` em vez de criar coleção nova.**
  - Ganha `direction: 'saida' | 'entrada'` (padrão `saida`, então nada muda no que já existe), `contractId?` e status `'previsto' | 'recebido' | 'atrasado' | 'cancelado'` para entradas.
  - Os previstos do mês são **derivados** do contrato e nunca marcados como recebidos sozinhos. "Atrasado" é calculado quando passa o dia e ainda não há registro de recebido. Receita extra é uma entrada sem `contractId`.
  - Alternativa, se preferir: uma coleção `receipts` separada. Recomendo a extensão para reaproveitar a tela e o Organizze.

**Seed (só o que você informou):**
- contratos Santander (R$ 20.000, dia 15) e Fashion Finder (R$ 10.000, dia 30), ambos "ativo — conforme informado";
- a North Star 2027;
- as 5 atividades recorrentes.

Nenhum valor antigo, nenhuma vaga, nenhum contato e nenhum equity. Equity, se surgir, entra só como nota de contrato com status "não formalizado", nunca como patrimônio.

**Privacidade (dentro do que existe, sem auth paralela):**
- campos sensíveis (contratos, oportunidades, contatos) ficam no mesmo IndexedDB, fora de qualquer log;
- `confidentiality` nas evidências é respeitado pela busca e pela Lumos (o que é confidencial não aparece em sugestão);
- opcional: **trava local do app** (código ou Face ID via WebAuthn) para abrir Dinheiro e Carreira. Isso não é login e não sincroniza nada.

## 5. Plano incremental (cada etapa é pequena, testável e reversível)

| # | Etapa | Entrega | Complexidade |
|---|---|---|---|
| 1 | **Contratos + recebimentos** | `contracts`, `Expense.direction/status`, seed dos 2 contratos, tela "Contratos" em Dinheiro com previsto/recebido/atrasado/cancelado | M |
| 2 | **Atividades de carreira** | 5 atividades recorrentes encaixadas pelo SmartPlanner nas janelas livres (sem sobrescrever treinos/natação/yoga/cerâmica; sem duplicar), contagem semanal | M |
| 3 | **Carreira 2027 (página)** | North Star, trimestrais, semana, pipeline, pessoas, cases | M |
| 4 | **Oportunidades + contatos** | coleções, status, follow-ups na fila "precisa de você" | S–M |
| 5 | **Evidências** | campos novos em `wins`, selo "sem métricas", confidencialidade | S |
| 6 | **Lumos** | as 8 frases do pedido (abaixo), com política de confirmação | M |
| 7 | **Executive Career Review mensal** | roteiro de 6 perguntas + histórico | S |
| 8 | (opcional) **Trava local** | código/biometria para Dinheiro e Carreira | S–M |

## 6. Estimativa

Etapas 1–7: **médio**. São cerca de 3 coleções novas, 3 extensões de tipo, 2 telas e um conjunto de intents da Lumos. Tudo reaproveita o store, a timeline, o planner, a fila de atenção e o `lifeLog` que já existem. Nenhuma biblioteca nova.

## 7. Riscos

1. **Dados só no aparelho.** Para finanças e carreira, perder o armazenamento local é o maior risco. Mitigação: lembrete de backup JSON mensal (no Monthly Board) e, no futuro, uma sincronização com backend e autenticação de verdade (que precisa da sua decisão e do seu aval para deploy).
2. **Duplicar agenda.** As atividades de carreira podem colidir com o template de treinos. Mitigação: entram como FLEXÍVEL, o planner só propõe, nada é sobrescrito, e conflitos aparecem na fila.
3. **Métrica virar cobrança.** Mitigação: contagem sem porcentagem, sem "atrasado", nada de "prontidão executiva".
4. **Ambiguidade de nomes** ("Fashion Finder" × "FashionFinder"). Mitigação: um único projeto e um único contrato, com aliases, e a Lumos pergunta quando houver dúvida.
5. **Valor bruto confundido com líquido.** Mitigação: rótulo "faturamento bruto" em todos os lugares, e renda disponível só aparece com dados suficientes.

## 8. Critérios de aceite

- **Contratos e recebimentos:**
  - os 2 contratos aparecem em Dinheiro → Contratos;
  - os previstos de outubro mostram dia 15 e dia 30 como **previsto**;
  - depois de "o pagamento do Fashion Finder foi recebido", o de outubro vira **recebido**, o registro sobrevive a fechar e reabrir o app, e Desfazer volta.
- **Atividades de carreira:**
  - as 5 atividades aparecem na semana em janelas livres, sem tocar em treinos, natação, yoga, cerâmica ou reviews;
  - concluir, reagendar e cancelar funcionam por toque e pela Lumos, e persistem.
- **Pipeline:** "Adiciona uma vaga de Head of Product" pede a empresa se faltar e não inventa nada.
- **Respostas da Lumos que não podem mentir:**
  - "Quanto tenho previsto para receber este mês?" responde o bruto previsto, separado do recebido;
  - nenhuma resposta diz "salvei" antes de a gravação acontecer, e falhas mostram uma mensagem clara.

## 9. Plano de testes

- **Persistência:**
  - grava, recarrega o store a partir do IndexedDB (fake-indexeddb) e confere;
  - exporta e importa o backup.
- **Recorrência:**
  - 3×/semana gera ocorrências certas no fuso de São Paulo;
  - reagendar muda só aquele dia;
  - cancelar não apaga o padrão.
- **Associação:** nomes parecidos levam a uma pergunta de desambiguação, nunca a uma escolha errada.
- **Oportunidades:** testes de transição de status.
- **Finanças:**
  - previsto nunca vira recebido sozinho;
  - atrasado é calculado;
  - receita extra fica separada;
  - nenhum dado sensível aparece em `console`.
- **Lumos:** testes com cada frase exata do pedido contra o seed real.
- **Erros:** falha simulada de gravação mostra uma mensagem clara.
- **Responsividade:** screenshots a 390 px, claro e escuro.
- **Regressão:** a suíte inteira (≈800 testes) mais `tsc` e o build.
- **Login/logout e isolamento entre usuários:** **não aplicável** até existir backend com autenticação. Fica registrado como pendência explícita, não como "passou".
