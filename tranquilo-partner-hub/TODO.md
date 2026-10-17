# Tranquilo Partner Hub — TODO

Premissas: os anexos de PRD, backlog e plano de execução não estavam acessíveis; o usuário autorizou prosseguir somente com o escopo da mensagem e as escolhas do blueprint confirmado. Todo dado da demonstração é fictício, identificado e local. Nenhuma integração real foi criada. O projeto foi organizado para a futura equipe de dois desenvolvedores.

## Entregue

- [x] **Navegação e estrutura responsiva:** produzir o Tranquilo Partner Hub como protótipo funcional, navegável e responsivo para desktop e celular; incluir navegação para Dashboard, preparação de evento, Central de Conhecimento, Marketing, Vendas, briefings e uma entrada reservada para futuras oportunidades artísticas; todos os botões e fluxos principais devem ter comportamento funcional.
- [x] **Dashboard da praça:** mostrar dados da praça, próximos eventos, tarefas prioritárias, indicadores operacionais e avisos; usar exclusivamente dados simulados e sinalizar isso de forma visível.
- [x] **Preparação autônoma do evento:** entregar um fluxo guiado para o franqueado preparar seu evento sem depender de briefings individuais do Bruno; reunir etapas, prazos, responsáveis, status, checklists, playbooks e acessos aos materiais necessários; permitir acompanhar e alterar o progresso no protótipo.
- [x] **Central de conhecimento:** disponibilizar busca e filtros por tema para playbooks, checklists, responsáveis e materiais de apoio; ações de navegação e abertura devem funcionar.
- [x] **Templates de marketing:** fornecer biblioteca pesquisável/filtrável com visualização dos templates e links funcionais para recursos externos do Canva; não inventar URLs específicos, templates ou integrações; identificar links demonstrativos ou genéricos quando materiais oficiais não estiverem disponíveis.
- [x] **Painel demonstrativo de vendas:** exibir indicadores, score e semáforo com explicação dos critérios e aviso explícito de que todos os dados são fictícios; não depender de integração real nem apresentar dados internos.
- [x] **Gerador demonstrativo de briefing:** coletar informações por formulário, permitir revisar e gerar localmente um briefing estruturado segundo regras predefinidas, com ações de copiar e exportar; não usar IA generativa.
- [x] **Estados e ações funcionais:** fazer funcionar navegação, pesquisa, filtros, formulários, checklists e mensagens de sucesso; cobrir estados vazios e tratamento de erros simulados, sem chamadas reais a sistemas.
- [x] **Arquitetura, qualidade e documentação:** separar interface, dados simulados e serviços para facilitar integrações futuras; manter código organizado e componentes reutilizáveis; documentar arquitetura, componentes, premissas, limitações, funcionalidades pendentes e pontos previstos para futuras integrações; não implementar IA generativa, pagamentos ou integrações reais.

## Pendências deliberadas da próxima fase — fora do escopo deste protótipo

- Revisar este protótipo com os anexos de PRD, backlog e plano quando estiverem disponíveis, substituindo premissas por regras aprovadas.
- Confirmar com a operação os playbooks, checklists, responsáveis, nomenclaturas, prazos, indicadores, pesos e faixas do semáforo.
- Trocar as amostras fictícias por fontes oficiais, autenticação, autorização por papel/praça e persistência compartilhada; especificar contratos e tratamento de erros para cada sistema.
- Substituir os links gerais do Canva por links para designs oficiais somente quando forem fornecidos e aprovados.
- Definir, com fonte e escopo próprios, a futura jornada de oportunidades artísticas; esta versão reserva apenas a navegação.
- Avaliar privacidade, segurança, auditoria e retenção de dados antes de qualquer coleta ou integração.

Essas pendências não representam funcionalidades simuladas como se estivessem integradas. Permanecem sem implementação até que o escopo e as fontes oficiais sejam aprovados.

## Evolução solicitada — itens em andamento ou pendentes

- [x] **Auditoria inicial:** entregar diagnóstico técnico, matriz de lacunas em relação ao texto disponível, arquitetura proposta, backlog por dependência, divisão sugerida entre dois desenvolvedores, critérios de aceite e estratégia de testes. A comparação com PRD, backlog e plano originais fica explicitamente limitada à ausência desses arquivos.
- [x] **Estado do evento:** unificar o estado do evento nas telas, eliminando divergências entre dashboard, preparação e briefing.
- [x] **Modelos plurais:** evoluir os modelos para múltiplos eventos, praças e parceiros, sem implementar autenticação fictícia.
- [x] **Contratos de serviço:** preparar contratos de serviço para autenticação, autorização, conhecimento, eventos, tarefas, marketing e vendas, mantendo os mocks enquanto não houver sistemas autorizados disponíveis. Os contratos são interfaces tipadas, não serviços conectados.
- [x] **Testes críticos:** criar testes para os fluxos críticos, incluindo a continuidade do evento e seu contexto no briefing.
- [ ] **Briefing operacional:** permitir selecionar praça, evento, artista e campanha; recuperar informações existentes; utilizar regras e playbooks aprovados; produzir briefing estruturado e sugestões de textos por canal a partir de templates aprovados; revisar, editar, aprovar e exportar; registrar o status do material. Não publicar automaticamente. Não inventar o tom oficial da marca; usar somente conteúdo de exemplo até receber os playbooks. **Parcial no protótipo:** seletores, contexto, texto determinístico, revisão, exportação e status local estão implementados; conteúdo, copy, tom e aprovação oficial continuam dependentes de aprovação do negócio.
- [ ] **Central de Conhecimento autorizada:** preparar consumo de conteúdos autorizados do Notion, preservando a ferramenta como fonte de autoria sempre que fizer sentido. Estruturar tema, função responsável, praça ou escopo de visibilidade, etapa do evento, conteúdo, materiais relacionados, versão e última atualização. Não criar sincronização sem validar permissões e contratos de integração. **Parcial no protótipo:** metadados e escopos demonstrativos estão modelados/visíveis; Notion e conteúdo autorizado não foram conectados.
- [x] **Preparação multi-evento:** incluir seleção do evento, checklist por etapa, responsáveis, status, prazos, links de conhecimento, materiais de marketing e visão de pendências; garantir consistência entre as páginas. A seleção, o progresso e os rascunhos são locais e isolados por ID de evento demonstrativo.
- [x] **Camada de vendas:** preparar ingestão de vendas com fonte, data de atualização, tratamento de dados ausentes e status da importação. Não tratar score demonstrativo como métrica oficial. O envelope, o estado `demo` e a UI para dados ausentes/proveniência estão preparados; teste confirma que não se calcula score sem métrica. Os dois snapshots visuais atuais são completos, então não há uma amostra renderizada de campo ausente; nenhuma ingestão foi conectada.
- [x] **Limites de escopo:** não ampliar para curadoria preditiva, área completa de artistas ou automações complexas neste momento. Sem autenticação fictícia, integrações não autorizadas ou publicação automática.

A auditoria, a matriz de baseline, os incrementos concluídos e os próximos passos estão em [`docs/evolution-audit.md`](docs/evolution-audit.md); itens dependentes de acesso, conteúdo oficial ou validação com o Tranquilo permanecem abertos até que essas dependências sejam resolvidas.
