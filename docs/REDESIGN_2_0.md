# MARINA OS 2.0 — auditoria UX/UI, nova arquitetura e plano por fases

06/11/2026. Ponto de partida: o app real (código do ramo `claude/marina-os-life-app-ix1zvv`), 53 telas, 54 rotas,
1.433 testes passando. Fotos do antes e do depois em `docs/redesign/antes/` e `docs/redesign/depois/`
(iPhone 13). Regra desta reforma: **nenhum dado é migrado ou copiado** — tudo que muda é como os registros
existentes são mostrados. Por isso não existe risco de perda na troca de telas; o backup e as cópias
automáticas continuam como rede de segurança.

## 1. Diagnóstico

| # | Problema | Impacto | Gravidade | Solução | Onde |
|---|---|---|---|---|---|
| 1 | **Cinco "calendários"**: linha do dia da Home (`data/timeline.ts`), Agenda (`agendaFor`), Calendário da Expedição, Montar a semana (`/semana`), plano da Bíblia | Para saber como está a segunda é preciso abrir vários módulos | **Crítica** | Um calendário universal: projeção única de tudo que tem data (seção 3) | agenda, today, travel/expedition, planner |
| 2 | A Agenda **não mostra** passeios, reservas, voos e hospedagens da viagem, contas a vencer, recebimentos, cuidados da Luna, prazos de tarefa | O caiaque de 09/11 não aparece na Agenda | **Crítica** | Fontes novas no calendário universal | `data/selectors.ts` `agendaFor` |
| 3 | Três abas principais (Início, Agenda, Espaços) com **20+ destinos** dentro de Espaços e trabalho e dinheiro misturados com vida | Arquitetura confusa: "onde fica X?" | Alta | 5 destinos: Hoje · Agenda · Minha Vida · Projetos · Finanças | nav, Espaços |
| 4 | Home com **"0 de 40 hoje"** + painel da viagem com 9 seções abertas (agenda, pagamentos, fornecedores, entregas, gastos, trabalho, conflitos…) | Dia ilegível em 10 s; ansiedade | Alta | Primeiro nível só com urgente (até 3), conflitos e próxima ação; o resto a um toque | TodayPage, TripOpsPanel |
| 5 | **Abas dentro de abas**: Viagem → Expedição/Geral/Itens/Gastos → Painel/Briefing/Calendário/… | Muitos toques; perde-se o contexto | Alta | Viagem com uma camada só de seções (fase 3) | travel/TripPage, expedition/Views |
| 6 | **Emojis como ícones de interface** em toda parte (cards, linhas, títulos) | Visual ruidoso, inconsistente entre aparelhos | Média | Ícones lucide de traço fino; emoji só como conteúdo dela | todos os módulos (feito nos hubs; resto por fase) |
| 7 | Duplicidade: "Esperando retorno" aparece em Trabalho, Espaços, Home e painel da viagem; pendências da viagem em Home, Expedição e Agenda | A mesma informação em 3–4 lugares | Média | Um lugar de origem + atalhos; no calendário, um registro só (dedupe) | work, today, expedition |
| 8 | Bloco grande sem rótulo na Agenda (base de trabalho/aula) cobrindo a tarde | Parece erro; esconde compromissos | Média | Blocos de base como faixa discreta, filtrável | agenda/Timeline |
| 9 | Tablet = coluna de celular centralizada (max 640 px), barra inferior | Uso pobre no VAIO/tablet | Média | Coluna lateral de navegação a partir de 768 px (feito); calendário em 2 colunas (fase 2) | BottomNav, Page |
| 10 | Formulários e chips de edição aparecem na navegação (sheets com todos os campos, segmented de status) | "Administrar o app" em vez de ver | Média | Ver → detalhes → Editar (progressive disclosure) — começando pelo calendário | EventSheet, TripItemSheet |
| 11 | Hierarquia tipográfica inconsistente (títulos display de 34 px, eyebrows em caixa alta espaçada em excesso) | Cansaço visual | Baixa | Tokens de tipografia (seção 5) | index.css |
| 12 | Estados vazios desiguais: módulos vazios somem (bom) mas algumas telas mostram listas vazias com cabeçalhos | Ruído | Baixa | Um padrão de vazio por tela | vários |

## 2. Nova arquitetura da informação

| Destino | O que tem | De onde vem |
|---|---|---|
| **Hoje** | saudação discreta, data · local · fuso, Lumos, agora/próximos, até 3 prioridades, urgências, hábitos do dia, alertas relevantes | Início (mantido, simplificado) |
| **Agenda** | o calendário universal (Dia · Semana · Mês · Lista, filtros, conflitos) | Agenda + linha do dia + calendário da Expedição + /semana |
| **Minha Vida** | Corpo e movimento · Saúde e autocuidado · Mente e autoconhecimento · Estudos · Livros e biblioteca · Viagens e experiências · Casa, rotina e Luna · Objetivos de vida; busca no topo | Espaços (reagrupado) |
| **Projetos** | Fashion Finder, Tranquilo, outros projetos, Carreira e candidaturas, UGC e parcerias, retornos aguardados | Trabalho + Carreira + Creator |
| **Finanças** | saldo, receitas, despesas, contas, cartões, projeções, gastos de viagem | Dinheiro |
| menu secundário (avatar) | Ajustes, integrações, privacidade, dados/backup, notificações | Ajustes |

"Relacionamentos e família" ainda não tem modelo de dados: não aparece vazia; entra na fase 3.

## 3. Inventário de módulos

| Módulo | Decisão |
|---|---|
| Início / Hoje | **mantido**, simplificado |
| Agenda, linha do dia, Calendário da Expedição, Montar a semana | **fundidos** no calendário universal (as telas antigas ficam acessíveis a partir da Agenda até a fase 5) |
| Espaços | **substituído** por Minha Vida (mesmas entradas, reagrupadas) |
| Trabalho, Projeto, Carreira, Posts, Revisão executiva, Creator/UGC | **reunidos** em Projetos |
| Dinheiro | **mantido** como Finanças (simplificação da visão principal na fase 3) |
| Treinos, Nutrição, Meal prep, Evolução | mantidos em Corpo e movimento |
| Cuidar de Mim | **preservado**, discreto, em Mente e autoconhecimento |
| Bíblia, Ateliê Literário | Mente e autoconhecimento |
| Estudos, Conteúdos salvos, Livros | Estudos / Biblioteca (biblioteca única na fase 3) |
| Meu Universo | Saúde e autocuidado |
| Viagens + Expedição | Viagens e experiências; abas aninhadas reduzidas na fase 3 |
| Luna, Casa & admin, Inbox & notas, Tarefas | Casa, rotina e Luna |
| Metas, Revisão da semana, Meu mês | Objetivos de vida |
| Nenhum módulo removido nesta reforma | componentes obsoletos só saem na fase 5, depois de verificados sem uso |

## 4. Plano de migração sem perda de dados

1. **Nada é copiado.** O calendário universal é uma projeção sobre os registros existentes (ids `fonte:id`),
   então não há migração de banco nem risco de duplicar. Mudar de tela não toca nos dados.
2. Rotas antigas continuam funcionando por redirecionamento (`/espacos`, `/mais`).
3. Antes de qualquer mudança futura de **dados** (ex.: biblioteca única, Casa do Saber), o app guarda uma cópia
   automática (`snapshotOf`, Ajustes → Dados → cópias), como já faz nas importações.
4. Cada fase só entra com typecheck, lint, todos os testes, build e verificação no navegador (celular e tablet),
   incluindo reabrir o app e conferir que o que foi editado persistiu.

## 5. Design system (tokens)

Base existente em `src/index.css` (paleta terra & mata, modo claro/escuro): `--bg`, `--surface`, `--surface-2`,
`--ink`, `--ink-2`, `--muted`, `--line`, destaque `--accent` e tons por categoria (`sage`, `ocean`, `sand`,
`plum`). Regras 2.0:
- **Uma** cor de destaque (accent); categorias só como ponto/borda discreta, nunca fundo forte.
- Ícones lucide, traço 1.6–1.7, 18–21 px; **sem emojis como interface** (emoji continua permitido no conteúdo
  dela: nome de projeto, nota).
- Tipografia: display (Bodoni) só no título da página e na saudação (26–30 px); texto 14.5–15.5 px; eyebrow
  para rótulo de seção.
- Alvos de toque ≥ 44 px; linhas de lista 56 px; espaçamento de seção 24 px.
- Cards apenas como contêiner de lista; nada de card dentro de card.
- Ver → detalhe → editar em toda a aplicação.

## 6. Matriz de integrações (estado real em 06/11)

| Integração | Estado | Observação |
|---|---|---|
| Armazenamento do Claude (sync) | **conectada e funcional** dentro do app do Claude | dados dela em `rec/` do Artifact, só a dona |
| Importar .ics / assinar calendário | **parcialmente funcional** | importação de arquivo funciona; assinatura por URL depende do proxy (`ics-proxy`) |
| Google Calendar | **não conectada** | código das Edge Functions escrito (`oauth-google`, `google-calendar-events`), nunca implantado → "Configuração necessária" |
| Outlook / Teams (Microsoft 365) | **não conectada** | idem (`oauth-microsoft`, `ms-calendar-events`, `teams-mentions`), sujeito à política do tenant |
| Calendário Apple / Saúde / Lembretes | **não suportada** | exige app nativo |
| Strava | **não conectada** | sem código de integração; treinos registrados à mão |
| Garmin (Forerunner 955, Edge 540) | **não suportada** hoje | API de parceiros Garmin exige aprovação; registro manual |
| Organizze | **não conectada** | proxy escrito (`organizze-proxy`), não implantado |
| Supabase (login + backup) | **não conectada** | inerte até configurar |
| Flexcil / Casa do Saber | **não suportada** | sem API pública; registro manual dos materiais e cursos |
| Notificações push | **parcial** | só com o app aberto |

Nenhuma integração é simulada: o que não está conectado aparece como "Não conectado".

## 7. Fases

| Fase | Conteúdo | Situação |
|---|---|---|
| 0 | Auditoria, arquitetura, inventário, plano de migração, matriz de integrações, fotos do antes | **feito** |
| 1 | Navegação em 5 destinos (celular + tablet), Minha Vida, Projetos, Home calma, painel da viagem com divulgação progressiva | **feito** (testes + navegador) |
| 2 | Calendário universal (modelo canônico por projeção, dedupe, Dia/Semana/Mês/Lista, filtros, detalhe antes de edição, conflitos, fuso) | em construção |
| 3 | Minha Vida a fundo: biblioteca única, trilhas de estudo (Inglês C1, IA, Produto, Psicologia/Psicanálise/Filosofia, Outros), Casa do Saber, materiais do Flexcil, Corpo unificado, Relacionamentos, intercâmbio 2027, Finanças simplificada, viagem sem abas aninhadas | a fazer |
| 4 | Captura rápida em linguagem natural para todos os tipos, busca global por tipo, conectores reais (Google primeiro), notificações | a fazer |
| 5 | QA de regressão, acessibilidade, performance com histórico grande, remoção de componentes obsoletos | a fazer |

## 8. Pendências técnicas conhecidas

- Telas antigas ainda usam emojis como ícone (Expedição, Hoje, Trabalho, Dinheiro…) — trocar por fase.
- Viagem: 4 abas + sub-abas; reduzir para seções de uma camada.
- Diário íntimo **não** será ativado antes de criptografia de verdade (a trava atual é de tela).
- Drag-and-drop no calendário só onde o registro de origem já aceita mover com segurança.
- Assinaturas recorrentes (Casa do Saber): alerta só quando valor e periodicidade forem informados.
- Publicar no link do app depende da sessão que tem acesso a ele.
