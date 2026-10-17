# Tranquilo Partner Hub — arquitetura do protótipo

## Objetivo e limites

Primeira versão demonstrável da Central do Franqueado, priorizando a autonomia para preparar um evento e chegar a um briefing revisável sem depender de uma solicitação individual. A interface não autentica usuários, não consulta sistemas Tranquilo, não publica eventos, não processa pagamentos e não chama modelos de IA. Todos os indicadores, praças, eventos, parceiros de operação, artistas placeholder, campanhas e conteúdos são fictícios, rotulados e consumidos localmente.

Os anexos de PRD, backlog e plano de execução originais não estavam disponíveis no workspace; o usuário autorizou prosseguir com o escopo da mensagem. O texto de evolução adicional anexado foi analisado e implementado incrementalmente. As regras operacionais, responsáveis, metodologia do score, conteúdo dos playbooks e textos/campanhas continuam sem validação oficial. A auditoria em [`evolution-audit.md`](evolution-audit.md) registra o baseline, incrementos e próximos passos; [`TODO.md`](../TODO.md) conserva critérios completos e pendências deliberadas.

## Identidade e referências públicas

Referências consultadas: [site Tranquilo](https://tranquilomusica.com.br/), [página de São Paulo](https://tranquilomusica.com.br/saopaulo), [#descubra](https://tranquilomusica.com.br/descubra) e [kit de marca público](https://tranquilomusica.com.br/kit-de-marca).

A interface acompanha o contraste preto e branco, o logotipo serifado, a tipografia de interface sem serifa, os cartões de praça coloridos e o tom próximo observados no site. A base escura mantém continuidade visual; componentes compactos priorizam o trabalho operacional; azul-violeta diferencia a praça demo; cards e selos dão clareza a dados e status. As telas foram ajustadas para desktop e celular. O kit aponta para recursos públicos; os cartões de campanha são prévias demonstrativas, não artes oficiais.

## Mapa de telas

| Rota | Objetivo | Comportamento demonstrativo |
| --- | --- | --- |
| `/` | Dashboard | Evento e praça derivados do evento ativo; progresso isolado; tarefas, score da praça selecionada e CTA autoguiado. |
| `/eventos/preparar` | Jornada principal | Seletor do evento demo; quatro etapas; contexto, operação, divulgação e revisão; nome/data obrigatórios; tarefas ligadas ao evento, responsável, status/checklist, prazo e playbook; progresso fica no navegador. |
| `/conhecimento` | Central de conhecimento | Busca por título, tema, responsável, etapa, material e versão; filtros, responsável por papel, escopo/versionamento demo, checklists locais e link de playbook relacionado. |
| `/marketing` | Templates e kit | Filtros e prévias, arquivos públicos do kit de marca, link geral para modelos do Canva sem ID de design ou integração e CTA ao briefing com contexto. |
| `/vendas` | Indicadores comerciais | Snapshot escolhido pela praça do evento ativo; score ponderado, semáforo, fonte, atualização, estado de ingestão, dados ausentes e alertas inequívocos de simulação. |
| `/briefings` | Briefing de marketing | Seleção de praça/evento/artista placeholder/campanha; formulário contextual; sugestões determinísticas por templates demo; status editorial local, revisão, cópia e exportação Markdown. |
| `/oportunidades` | Espaço futuro | Navegação reservada sem artistas reais, inscrições, oportunidades ou dados de pessoas. |

## Estrutura do código

```text
src/
  App.tsx                 Provider, seleção do evento ativo, projeções e rotas
  components/             Casca, seletor, tarefas, métricas, padrões de UI e feedback
  pages/                  Uma página por rota de produto
  mocks/demoData.ts       Fixtures de duas praças/eventos demo, parceiros-papel, tarefas, playbooks e templates
  services/
    partnerHubService.ts  Adaptador exclusivamente local; leitura, validação, migração e persistência demo
    contracts.ts          Fronteiras TypeScript futuras (Auth, Authorization, Knowledge, Events, Tasks, Marketing, Sales etc.)
    formatters.ts         Datas, moeda e utilitários de cópia
    partnerHubService.test.ts Testes Vitest de domínio/adaptador
  types.ts                Tipos relacionais e estados compartilhados
  styles.css              Tokens, componentes, breakpoints e estados responsivos
public/
  manus-routes.json       Rotas visitáveis declaradas para o Preview
  brand-mark.png          Ícone público usado localmente

docs/
  architecture.md         Arquitetura, mapa, componentes, limites e validação
  evolution-audit.md      Diagnóstico, matriz, backlog e status incremental
```

## Fluxo e modelo de dados

1. `PartnerHubProvider` carrega o conteúdo pelo `partnerHubService`, recupera o ID do evento ativo e consulta sua preparação local. O seletor comum altera esse ID sem criar uma identidade ou permissão fictícia.
2. O adaptador relaciona `Plaza`, `DemoEvent`, `Partner`, tarefas e snapshots por IDs. A UI deriva praça, tarefas, progresso e snapshot comercial do mesmo evento ativo. Trocar de evento troca esses dados em conjunto.
3. O estado da preparação é isolado por ID de evento; progresso/checklists e rascunhos são salvos em `localStorage` sob `tranquilo-hub-demo:`. O serviço valida JSON, preenche estados incompletos, tolera o formato legado e não envia dados para rede externa.
4. Ao abrir `?context=event`, o briefing lê o estado ativo. Mudanças em praça/evento recuperam o contexto demo; artista e campanha são seleções placeholder. A geração é determinística: aplica templates ilustrativos, mostra sugestões por canal e salva um rascunho editável no navegador. Revisão e “aprovado · demo” não representam ato editorial Tranquilo.
5. O adaptador envolve snapshot comercial com fonte, instante de atualização, status de importação e campos ausentes. Score é calculado só quando há métricas completas. As amostras e os pesos atuais continuam inventados.
6. `contracts.ts` contém tipos para serviços futuros; nenhuma implementação real desses serviços, sessão, credencial, API ou sincronização está conectada. As páginas recebem mocks via provider e não importam diretamente `demoData.ts`.

O protótipo contém **duas praças e dois eventos fictícios**, com lista/selector ilustrativo para validar relações e isolamento local. Isso não constitui catálogo oficial, identidade, seleção real do franqueado, autorização ou isolamento de dados por usuário. Os responsáveis são papéis/parceiros demo, não contas. Ao abrir o app em armazenamento limpo, a primeira amostra serve de contexto inicial.

## Componentes e responsabilidades

- `PartnerHubProvider` e `usePartnerHub`: entregam conteúdo, coleções relacionais, evento/plaza ativos, tarefas, snapshot comercial e operações locais de troca/salvamento.
- `AppShell`: navegação desktop/mobile, praça/evento demo atual no cabeçalho, menu mobile e aviso persistente.
- `DemoEventSelector`: troca o evento demo sem se apresentar como seletor de conta ou autorização.
- `PageHeading`, `Card`, `Button`, `DemoBadge`, `ProgressBar`, `SearchInput`, `Toast`, `Modal` e `Checkbox`: padrões de interface e feedback acessível.
- `TaskRow`, `MetricCard` e `Sparkline`: tarefa, KPI/selo explícito e tendência exclusivamente ilustrativa.
- `DashboardPage`: visão unificada da praça/evento ativo, pendências, progresso e caminho evento → responsáveis/playbooks → marketing → briefing; destaca a autonomia antes de solicitar um briefing individual ao Bruno.
- `PrepareEventPage`: checklist de quatro etapas vinculado ao evento selecionado; validação, campos, prazo e referências relacionados.
- `KnowledgePage`: busca e filtro; metadados de tema, escopo, etapa, papel responsável, versão e atualização marcados como demo; checks locais.
- `MarketingPage`: prévias fictícias, filtros, materiais públicos e links gerais externos; não promete designs Canva específicos.
- `SalesPage`: score/semáforo, fonte, atualização e estado demo; alerta comercial na primeira dobra e reforço de não uso decisório.
- `BriefingPage`: campos relacionais, geração fixa por campanha/canal, texto editável, rascunhos, status local, cópia/download `.md`.
- `OpportunitiesPage`: placeholder explícito de jornada futura, sem catálogo ou ações que pareçam reais.

## Serviços e integrações futuras

- `partnerHubService.ts` é o adaptador que está funcionando. Seu contrato interno salva/lista preparações por evento, seleção ativa, checks dos playbooks e briefings no navegador.
- `contracts.ts` define interfaces tipadas para autenticação, autorização, conhecimento, evento, preparação, tarefas, marketing, vendas e diretório. São contratos, não endpoints conectados; Auth/AuthZ não implementam sessão, login, identidade ou decisão de acesso.
- O link do Canva abre a área geral de modelos; não acessa conta do franqueado, não verifica acesso e não abre/cria design específico. URLs de campanha oficiais não foram fornecidas.
- Recursos do Kit de Marca apontam para arquivos públicos ligados pela página oficial; são arquivos de identidade, não templates editáveis de campanha.
- O projeto não inclui servidor, banco, SDK de integração, API, pagamentos, IA generativa, publicação automática ou captura de dados pessoais.

## Limitações e pendências

1. Os anexos originais de PRD, backlog e plano não foram entregues; confirmar regras, responsáveis, conteúdo, prazos, nomenclaturas e critérios com materiais oficiais.
2. Dados de evento, tarefas, papéis, artistas, campanhas, textos e score são exemplos inventados. Selos e textos de contexto os identificam; nenhum conteúdo pode ser tratado como orientação, copy ou métrica aprovada.
3. A seleção entre duas amostras existe apenas para demonstrar relações e isolamento no protótipo. Ainda faltam identidade, autorização efetiva e políticas de visibilidade por praça.
4. O gerador usa templates e sugestões **não aprovados**. A equipe precisa validar tom, textos, templates, fluxos de revisão, autoria e eventual aprovação formal.
5. A Central possui metadados/fixtures, mas não consulta Notion. Permissões, taxonomia, responsabilidade editorial, contrato e política de sincronização precisam ser aprovados antes de qualquer ligação.
6. Vendas mostra proveniência demonstrativa, status `demo` e comportamento para métricas ausentes; não existe ingestão nem score oficial. Os dois snapshots atuais têm todos os campos preenchidos: o estado de ausência é coberto por contrato/teste, mas não aparece como exemplo visual nesta demonstração.
7. Progresso, briefing e checklists permanecem só no navegador atual; não há concorrência, backup, sincronização, auditoria ou persistência multiusuário.
8. Os links oficiais de Canva por campanha não foram fornecidos; a biblioteca aponta à área geral. Substituir somente depois de receber URLs aprovadas.
9. O menu de oportunidades artísticas é só uma estrutura de navegação. Não inclui catálogo, curadoria, inscrição ou automação; pagamentos e publicação continuam fora do escopo.
10. Antes de integrar, a equipe de dois desenvolvedores deve validar segurança, papéis, escopos, APIs, fonte de vendas, critérios de negócio, privacidade, retenção e auditoria.

## Validação realizada

- `npm run typecheck`: concluído sem erros.
- `npm test`: 6 testes aprovados. Cobrem estado compartilhado e normalização, relações por ID, coerência de indicadores, métricas ausentes, isolamento por evento e estados locais do briefing.
- `npm run build`: concluído; `vite build` gerou os arquivos de produção.
- `GET /manus-routes.json`: HTTP 200 e manifesto de sete rotas coerente com o app.
- Preview exercitado: troca de evento em conjunto no Dashboard/preparação/Vendas, deep link do playbook, contexto sem query no briefing, geração local, edição do texto, navegação de saída e reabertura do rascunho persistido, status editorial demonstrativo.
- Desktop: páginas principais capturadas em 1280×900. Mobile: Dashboard, preparação, Vendas e Briefings capturados em 375×812; aviso de simulação e selo do score são legíveis.
- O editor permanece montado ao substituir/apagar o texto, e cópia/download ficam desabilitados com conteúdo vazio. Um briefing de teste foi editado, salvo no navegador e reaberto após navegar para outra rota; os estados `in_review` e `approved_demo` foram conferidos. Não houve publicação nem chamada a serviços externos.

## Observações de pesquisa pública

- A [página inicial](https://tranquilomusica.com.br/) apresenta “Ouvidos atentos. Corações abertos.”, navegação por cidades e informa que ingressos e comunicação oficial ficam no site e canais oficiais.
- A [página de São Paulo](https://tranquilomusica.com.br/saopaulo) organiza próximos eventos por data e usa o CTA “Ver ingressos”. O Partner Hub complementa essa jornada com preparação interna, sem substituir o canal público de venda.
- A jornada [#descubra](https://tranquilomusica.com.br/descubra) começa pelo WhatsApp e informa uma sequência de 23 etapas de cadastro artístico. Ela permanece separada do protótipo; não copiamos campos nem simulamos acesso a candidaturas.
- O [Kit de Marca público](https://tranquilomusica.com.br/kit-de-marca) oferece arquivos para LED em A4 (vertical/horizontal e variações azuis). A biblioteca aponta para recursos públicos; essas peças não são tratadas como templates de campanha.
