# Tranquilo Partner Hub — auditoria e plano de evolução

**Base do diagnóstico:** repositório original entregue em `c354525`, README, TODO, arquitetura e código-fonte/configuração versionados, além do texto `Pasted_content.txt` anexado depois. **Limite documental:** o único anexo encontrado foi esse texto de evolução; PRD, backlog e plano de execução originais não estavam no upload nem no repositório. O diagnóstico e a matriz nas seções 1–6 comparam o baseline inicial com o pedido visível, não com documentos de produto que não recebemos. **Estado atual:** os incrementos descritos nas seções 7–9 foram implementados; a seção 10 apresenta evidências e dependências que ainda faltam.

## 1. Diagnóstico técnico do baseline

- Aplicação client-side em React 18, TypeScript estrito e Vite; navegação por React Router, estilos globais em CSS e ícones Lucide. Não há servidor, banco, login, cliente de API ou configuração de integração.
- A UI é dividida em páginas/componentes; mocks ficam em `src/mocks/demoData.ts`; um adaptador local em `src/services/partnerHubService.ts` lê/salva progresso, checks e briefings no `localStorage` deste navegador.
- A inconsistência central do baseline foi confirmada no código: o Dashboard lia um `event` estático, enquanto a preparação salvava campos localmente e o briefing os recuperava de forma independente. Editar nome, data, praça/cidade ou local podia deixar o Dashboard com a amostra antiga; as páginas não partilhavam sincronização.
- A página de Vendas identificava score, curva, faixas, pesos e critérios como demonstrativos. No Dashboard havia aviso global e selo menor; em celular os selos dos indicadores ficavam ocultos. A comunicação não era uniforme.
- O caminho principal existia por partes: Dashboard → preparação → tarefas/responsáveis → playbooks → Marketing → Briefing. Os destinos estavam disponíveis, mas Marketing não retornava explicitamente ao briefing contextual e faltava uma chamada clara para reduzir pedidos individuais ao Bruno/equipe central.
- A Central de Conhecimento tinha busca, filtros, checklists e deep links para conteúdo de exemplo, sem metadados relacionais completos ou origem autorizada do Notion. O conteúdo não era política operacional validada.
- O gerador era determinístico e local; permitia editar, revisar, copiar e baixar `.md`. Não selecionava praça/evento/artista/campanha nem guardava status editorial.
- Vendas não ingeria dados: valores, tendência, pesos e faixas eram inventados; faltavam metadados estruturados de origem, atualização e campos ausentes.
- O projeto original tinha typecheck e build, sem testes automatizados versionados. A cobertura de regressão era frágil.

## 2. Matriz de requisitos e lacunas — baseline anterior à implementação

“PRD” nesta matriz significa o requisito do texto de evolução recebido. O status abaixo registra o baseline auditado; o estado atual é atualizado nas seções 7–10. A validação contra o PRD original depende do envio desses arquivos.

| Requisito | Implementado | Parcial | Não implementado | Dependência | Prioridade | Responsável técnico sugerido | Critério de aceite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unificar o estado entre Dashboard, preparação e briefing |  | ✓ |  | Modelo compartilhado do evento e adaptador local | P0 | Dev 1 — domínio/serviços | Editar um evento no fluxo atual atualiza nome, praça, data e local no Dashboard e preenche o briefing com os mesmos valores. |
| Jornada contínua: home → evento → responsabilidades → playbooks → marketing → briefing |  | ✓ |  | Navegação e ligações existentes, com CTAs contextuais | P0 | Dev 2 — experiência/interface | Cada etapa oferece próxima ação coerente; um playbook e uma referência visual levam de volta ao briefing contextualizável, sem recomeçar do zero. |
| Destacar que orientação e materiais reduzem pedidos individuais ao Bruno/equipe central |  | ✓ |  | Conteúdo de exemplo; validar linguagem com operação | P0 | Dev 2 — conteúdo/interface | Home e Central explicam onde encontrar orientação, responsável e material antes de pedir ajuda; não prometem conteúdo oficial inexistente. |
| Tornar os dados de vendas inconfundivelmente demonstrativos |  | ✓ |  | Consistência de avisos em desktop, mobile e card resumido | P0 | Dev 2 — experiência/interface | Score, curva, pesos e critérios visíveis trazem aviso inequívoco de simulação, inclusive ao entrar pelo Dashboard em celular; sem alegar que são dados ou metas reais. |
| Evoluir modelos para múltiplos eventos, praças e parceiros; não implementar autenticação fictícia |  |  | ✓ | Regras de seleção/associação ainda não validadas | P1 | Dev 1 — domínio/serviços | Tipos e contratos representam IDs e relações plurais; a UI só habilita seleção depois de critérios e escopos aprovados; não existe login simulado. |
| Preparar contratos de serviço para autenticação, autorização, conhecimento, eventos, tarefas, marketing e vendas |  | ✓ |  | Identidade, papéis, escopos e APIs aprovadas | P1 | Dev 1 — arquitetura | Interfaces tipadas isolam as capacidades e têm adaptador local de demonstração; nenhum endpoint, credencial ou login falso é exibido. |
| Manter mocks até haver sistemas autorizados; não criar integrações falsas | ✓ |  |  | Nenhuma para o protótipo local | P0 | Dev 1 — serviços | Todas as fontes fictícias estão identificadas; a aplicação não envia dados a sistemas Tranquilo nem finge sincronização. |
| Criar testes dos fluxos críticos |  |  | ✓ | Definir casos de unidade e roteiro browser; instalar somente ferramentas necessárias | P0 | Dev 1 — testes de domínio; Dev 2 — jornada | Testes automatizados cobrem adaptação/persistência e a jornada/evento para briefing; validação manual cobre navegação, deep links, disclosures e estados responsivos. |
| Briefing: selecionar praça, evento, artista e campanha e recuperar informações existentes |  | ✓ |  | Modelos aprovados, conteúdo/fonte do artista e associações evento-campanha | P1 | Dev 1 — contratos; Dev 2 — fluxo | Seleções são filtradas por relações autorizadas e pré-preenchem somente campos vindos de fonte identificada; sem cadastros artificiais de artistas. |
| Briefing: usar regras/playbooks aprovados, sugerir textos por canal de templates aprovados, revisar/editar/aprovar/exportar e acompanhar status |  | ✓ |  | Playbooks, templates, tom oficial e estados de aprovação fornecidos pelo negócio | P1 | Dev 2 — produto/interface; Dev 1 — serviço | O rascunho é editável; origem/versionamento visíveis; estados de revisão/aprovação/exportação são explícitos; nada é publicado automaticamente. |
| Não publicar materiais automaticamente | ✓ |  |  | Restrição do produto | P0 | Ambos | Gerar, revisar, copiar e exportar não cria publicação nem chama canal externo. |
| Central de Conhecimento: consumir conteúdo autorizado do Notion, preservando Notion como autoria; estruturar metadados |  | ✓ |  | Permissões, contrato, taxonomia, owner do workspace e política de sincronização | P1 | Dev 1 — integração/dados; Dev 2 — navegação | Metadados de tema, papel, escopo, etapa, conteúdo, materiais, versão e atualização são suportados; Notion continua origem de autoria; só há sincronização após aprovação de acesso/contrato. |
| Não sincronizar conteúdo sem validar permissão e contratos | ✓ |  |  | Aprovação antes de integração | P0 | Dev 1 — arquitetura | Nenhum conector, credencial ou job de sincronização é adicionado sem autorização. |
| Preparação multi-evento: seleção, checklist por etapa, responsáveis, status, prazos, conhecimento, marketing e pendências |  | ✓ |  | Modelo de evento/praça/parceiro e regras oficiais de checklist | P1 | Dev 1 — domínio/serviços; Dev 2 — interface | Cada evento selecionado tem progresso e tarefas próprios; responsável, status, prazo e referências são visíveis; nenhum progresso é compartilhado entre eventos. |
| Vendas: ingestão com fonte, atualização, dados ausentes e status |  |  | ✓ | Sistema de origem, contrato, definições de métricas e autorização | P2 | Dev 1 — ingestão/serviços; Dev 2 — estados UI | Exibir fonte, instante da última importação, sucesso/erro/parcial e tratamento de campos ausentes; manter score simulado separado de métricas oficiais. |
| Não inventar tom oficial; não implementar IA, pagamentos ou publicação automática | ✓ |  |  | Aprovação futura de conteúdo oficial | P0 | Ambos | Conteúdo aparece como exemplo; sem IA generativa, pagamento, publicação ou afirmação de voz aprovada. |
| Não ampliar para curadoria preditiva, área completa de artistas ou automações complexas | ✓ |  |  | Novo escopo aprovado pelo negócio | P0 (restrição) | Ambos | O menu de oportunidades permanece apenas como espaço futuro; sem catálogo, seleção preditiva ou automação. |

## 3. Arquitetura implementada e preparada

A base continua React/Vite; as telas e identidade originais foram preservadas. Não se habilitou servidor, banco, autenticação, Notion, integração Canva, API comercial, pagamentos ou serviço de IA. A estrutura é organizada nos módulos existentes:

```text
src/
  App.tsx                 Provider, seletores, projeções e rotas
  components/             Casca, navegação, seletor de evento, tarefas e módulos reutilizáveis
  pages/                  Dashboard, evento, conhecimento, marketing, vendas e briefing
  mocks/demoData.ts       Fixtures demo relacionadas por IDs
  services/
    partnerHubService.ts  Adaptador local: migração, estado por evento, checks e briefings
    contracts.ts          Interfaces futuras para Auth/AuthZ, Knowledge, Events, Tasks,
                          Marketing, Sales, preparação e diretório (sem implementação externa)
    formatters.ts         Formatação e utilitários
    partnerHubService.test.ts  Testes Vitest do domínio/adaptador
  types.ts                Modelos relacionais, envelopes e estados
```

`PartnerHubProvider` mantém o ID do evento ativo e deriva praça, evento, tarefas e vendas do mesmo conjunto de fixtures. `partnerHubService` adapta para JSON validado no `localStorage`, migra a chave antiga e isola progresso por `eventId`. Briefings usam o contexto do evento e também persistem localmente. Contratos em `contracts.ts` definem fronteiras tipadas; não há instâncias de auth, permissões efetivas ou clientes de serviço.

## 4. Backlog e dependências

### P0 — entregue

1. Unificar estado e progresso do evento entre home, preparação e briefing.
2. Evidenciar a simulação de vendas no card e na tela dedicada, inclusive em mobile.
3. Encadear Dashboard → evento → papel responsável/playbook → marketing → briefing e explicar autonomia operacional.
4. Criar testes de transformação, persistência, migração e contexto; validar fluxo no Preview.

### P1 — incremento de estrutura entregue; produto oficial continua pendente

5. Modelar entidades plurais e relações por IDs para praças, eventos, papéis/parceiros, tarefas, conhecimento, snapshots, artistas placeholder e campanhas demonstrativas; preparar contrato tipado para as capacidades do produto sem login simulado.
6. Implementar seleção entre eventos demo, estado de preparação isolado, briefing relacional com status local e geração determinística a partir de fixtures.
7. Expor no mock de conhecimento metadados de tema, função, escopo, etapa, versão e atualização; preparar o envelope de vendas para fonte, status de ingestão e campos ausentes.
8. Aguardar permissão/contrato antes de consumir Notion ou outros sistemas; aguardar links, templates, tom e critérios oficialmente aprovados antes de substituir conteúdo fictício.

### P2 — dependente de negócio e sistemas

9. Definir ingestão comercial, origem, frequência, campos ausentes, erros/parcialidade, método oficial e score; implementar apenas após autorização e acesso.
10. Integrar conteúdo autorizado da Central, definir responsabilidade editorial e eventual sync com Notion; validar visibilidade e escopo.
11. Aplicar links oficiais de Canva por campanha somente quando fornecidos e aprovados; manter oportunidades artísticas, curadoria preditiva, pagamentos, publicação automática e automações complexas fora do escopo.

## 5. Divisão sugerida para dois desenvolvedores

| Dev | Foco | Entregas |
| --- | --- | --- |
| Dev 1 — domínio e serviços | Estado compartilhado, modelos, adaptação de dados, interfaces e testes | Contratos tipados; persistência/migração; relações e validações; testes para transformação e isolamento de estado. Define com Dev 2 os IDs e nomes antes de conectar serviços autorizados. |
| Dev 2 — UX e aplicação | Jornada, componentes, avisos, acessibilidade e validação responsiva | CTAs de continuidade, deep links, disclosure de dados fictícios, formulários e estados mobile; teste browser do percurso completo. |
| Ambos | Decisões de produto | Validar glossário, critérios do score, conteúdo e acessos; revisar cada integração antes de sua implementação. |

## 6. Critérios de aceite e estratégia de testes

- Ao alterar título, cidade, data, local ou formato do evento na preparação, Dashboard e briefing usam os mesmos valores para o evento selecionado.
- Alternar entre eventos demo não transfere checklist/progresso de um para outro.
- Cada tarefa aponta a um papel e playbook; o caminho leva a marketing e briefing sem perder contexto.
- Vendas mostra fonte, atualização, estado de demonstração e aviso de que score, curva, pesos e critérios são fictícios; um campo métrico ausente não gera score arbitrário.
- O briefing pode selecionar contexto, placeholder de artista/campanha, gerar conteúdo determinístico editável, revisar, marcar um status demo, copiar e exportar sem publicar.
- Typecheck, testes, build e `GET /manus-routes.json` passam; validação manual cobre navegação, disclosures e layout desktop/mobile.
- As amostras não são apresentadas como regras oficiais; o tom e os templates não aprovados permanecem explicitamente demo.

## 7. Resultado do P0 inicial — marco histórico

O P0 inicial concluiu estado compartilhado, alerta de vendas, percurso autoguiado e primeira cobertura unitária. No fechamento desse marco havia dois testes. Esse número é histórico: os testes cresceram e o estado atual está descrito na seção 10. Os dados temporários usados para validar o percurso foram limpos depois do teste.

## 8. Tranche de fundação de domínio — implementada

Foram adicionados tipos relacionais (`Plaza`, evento, parceiro/papel e tarefa), fixtures demo relacionadas por IDs, metadados de conhecimento, envelope comercial e contratos TypeScript para Auth/AuthZ, Knowledge, Events, preparação, Tasks, Marketing, Sales e Directory. Os contratos não criam sessão, login ou decisão de permissão. Os dados continuam fornecidos pelo adaptador local; não foi conectado endpoint, Notion ou API.

## 9. Tranche operacional P1 — implementada

- Dois eventos e praças fictícios podem ser alternados pelo seletor; o Dashboard, preparação, praça, tarefas e snapshot comercial usam o evento ativo.
- Checklists e preparação persistem por ID de evento, com recuperação da chave legada; testes cobrem isolamento entre os dois eventos.
- O briefing seleciona praça/evento/artista placeholder/campanha, recupera o contexto salvo, gera texto por regras fixas, permite edição, revisão, status `in_review` e `approved_demo`, cópia e exportação `.md` no navegador.
- A Central exibe tema, papel responsável, escopo, etapa, versão e atualização dos playbooks mock; não sincroniza Notion.
- Vendas apresenta fonte/atualização/status fictícios e lógica para não calcular score quando falta métrica; score e semáforo continuam exemplos.
- Nada publica, chama IA, processa pagamento ou envia dados a sistemas externos. A navegação artística continua apenas um placeholder.

## 10. Estado atual, validação e pendências

**Validação técnica concluída:** `npm run typecheck`; `npm test` (**6 testes aprovados**); `npm run build`; `git diff --check`. Os testes cobrem evento compartilhado e normalização, IDs/relacionamentos, score por praça e métrica ausente, isolamento de progresso por evento e estados locais de briefing. `GET /manus-routes.json` respondeu HTTP 200 com as sete rotas declaradas.

**Validação de UX no Preview:** a troca de evento refletiu dados, tarefas e score/proveniência do segundo snapshot; a navegação foi exercitada em home, preparação, Knowledge, Marketing, Vendas e Briefings. O playbook e o CTA de Marketing conduzem ao passo seguinte; o briefing sem query também parte do evento ativo, inclui praça/evento/local/formato, gera texto determinístico editável e preserva conteúdo/status após sair e reabrir o rascunho. O editor continua disponível durante substituição do texto; `in_review` e `approved_demo` foram conferidos no histórico local. Desktop foi capturado em 1280×900; celular em 375×812, incluindo editor de briefing, aviso de vendas e Dashboard. O estado de teste foi removido ao final.

**Limite visual conhecido:** os dois snapshots de vendas da demo têm métricas completas (`missingFields: []`). A proteção contra score sem dados está modelada e testada, mas esta versão não exibe um snapshot incompleto na interface.

**Dependências para a próxima fase:** revisão dos documentos de produto originais; aprovação das tarefas, critérios, pesos/faixas de vendas, playbooks, templates, copy/tom e regras de status; entrega dos links específicos do Canva; autorização e contrato para Notion, sistemas comerciais e APIs; definição de identidade, papéis e autorização real; política de persistência compartilhada, privacidade, retenção e auditoria. A próxima fase não deve tratar rascunho local como aprovação editorial, templates como campanha oficial ou dados demo como operação real.
