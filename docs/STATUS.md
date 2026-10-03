# MARINA OS — estado atual (03/10/2026)

Auditoria honesta da primeira versão: produto, engenharia, UX e QA.

## O que funciona de verdade

- **Hoje**: saudação por horário, "Agora/Próximo" determinístico, linha "HOJE" (📍 trabalho, treino, projeto),
  Top 3 do dia + Top 3 por domínio (Trabalho/Corpo/Vida), ☀️ Milagre da Manhã expansível (sub-etapas,
  journaling, versão Essential, reorganização em manhã de treino), 🌙 Encerrar o dia, card "Amanhã"
  (presencial 👜 + treino-chave com "Ver estratégia"), energia ⚡/🙂/😮‍💨 que esconde ruído, sexta à noite
  "Fechando a semana ✨", modo fim de semana, widgets reordenáveis.
- **Captura**: brain dump em 1 toque, inbox por grupos, triagem em 12 destinos, linguagem natural
  determinística ("quinta quero correr no almoço", "hotel de JNB", "Fran tá me devendo retorno"…), sempre corrigível.
- **Agenda**: Hoje/Dia/Semana/Agenda, faixas de trabalho e deslocamento, eventos "noite · horário a definir",
  cancelar/mover só um dia de uma série, pauta de eventos, conflitos, import/export .ics.
- **Corpo**: template semanal editável (key sessions 🔥, PREP, sábado livre), "Meu treino da semana",
  arrastar treino com alertas (TotalPass, presencial, horário) que nunca bloqueiam, yoga/circo flexíveis,
  check-in, alimentação simples.
- **Nutrição**: 6 planos do nutricionista transcritos fielmente (seg/qua, ter, qui, sex, sáb, dom),
  contexto do dia derivado do treino (move junto com o treino), linha ONTEM → PRÉ → TREINO → INTRA → PÓS,
  marcações sem gamificação, check-in pós-treino-chave, resumo copiável para o nutricionista,
  composição corporal só em Corpo → Evolução (2022 = histórico, não meta).
- **Montar minha semana** (7 passos), **Trabalho** (5 frentes, roadmap FashionFinder, rituais CEO Review /
  Monthly Board, Waiting For, Wins, Work Inbox manual), **Creator** (pipeline, série África), **Dinheiro**
  (consciência diária, compras planejadas, possíveis duplicados), **Estudos** (Learning OS), **Livros**,
  **Viagens** (Trip OS com tudo "revisar"), **Vida real**, **Luna**, **Metas**, **Revisões**, **Mari**
  (respostas por regras com seus dados), **Busca universal**, **⌘K**, **Personalizar**, **Backup JSON/CSV**.

## O que está limitado ou mockado

- **Mari** não usa IA generativa (interface pronta, flag desligada). Responde com regras.
- **Integrações**: só .ics funciona hoje. Google Calendar, Outlook/Teams e Organizze têm código escrito
  segundo a documentação oficial (Supabase Edge Functions), mas nunca foram implantados → aparecem como
  "Configuração necessária". Toki não tem API pública: o app lê os calendários que ele sincroniza e
  deduplica por iCalUID. Apple (Saúde/Lembretes/Calendário) exige app nativo → "Disponível em breve".
- **Notificações** só enquanto o app está aberto (push com app fechado precisa de servidor).
- Checks da pauta dos rituais e da checklist "Amanhã é presencial" não persistem após fechar.
- Dados ficam só no aparelho (sem sincronização entre dispositivos).

## Onde os dados ficam

IndexedDB do navegador/iPhone (banco `marina-os`). Backup em Mais → Meus dados. O seed da vida real entra
pelo mesmo modelo da interface, com IDs estáveis e migração aditiva (`profile.seedVersion`, hoje v3):
nada que você editou é sobrescrito; exemplos antigos nunca tocados são atualizados ou removidos.

## Como rodar / instalar

Veja o README. Prévia privada (sem instalação/offline): https://claude.ai/artifact/9ndW7TyFpZTGtx9qc7etUn

## Decisões de arquitetura

- Local-first com um store único (zustand) e `StorageAdapter` trocável (Supabase depois).
- Contratos centrais (`src/data/types.ts`), motor de planejamento (`data/planning.ts`) e de nutrição
  (`data/fuel.ts`) compartilhados; nenhuma lógica cita nomes da sua vida — tudo vem de dados.
- Recorrência (regra) separada de ocorrência (conclusão do dia).
- Conflitos nunca bloqueiam nem apagam: Mover / Manter assim / Ignorar.
- Tokens OAuth nunca no navegador; dados corporativos só como metadados.

## Débito técnico

- Supabase Auth + deploy das funções; sincronização entre aparelhos.
- `OccurrenceParent` não aceita eventos (pauta não persiste).
- Override de modo de trabalho por semana (ex.: uma terça remota).
- Alguns sheets locais em features (track editor, "E depois?") fora do registro global.
- Testes E2E (Playwright) dos fluxos principais; hoje são 566 testes unitários/integração.

## Próximos 10 passos recomendados

1. Publicar o build em HTTPS (Vercel/Netlify) e instalar no iPhone.
2. Usar 1 semana real e ajustar o template/rotinas pelo próprio app.
3. Supabase: login + backup automático na nuvem.
4. Google Calendar (pessoal) via Edge Functions já escritas.
5. Microsoft 365 (agenda + Work Inbox read-only), sujeito à política do tenant.
6. Organizze (proxy já escrito) com revisão de duplicados.
7. Persistir checks de pauta/checklists (OccurrenceParent 'event').
8. Push notifications (Web Push) para véspera de treino-chave e presencial.
9. Mari com IA generativa no servidor, usando as mesmas regras como contexto.
10. Testes E2E no iPhone (Safari) dos fluxos: manhã, captura, treino, gasto, fechar o dia.
