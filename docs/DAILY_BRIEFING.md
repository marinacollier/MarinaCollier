# Daily Executive Briefing → Marina OS

O briefing é escrito fora do app (Claude, com pesquisa na web). O app recebe o **bloco final em JSON**
("BLOCO PARA MARINA OS APP") e transforma em checklist do dia, com check em tudo.

## Como usar (todo dia)

1. Copie o briefing inteiro (texto + bloco JSON).
2. Cole na Lumos (Home ou conversa) e envie.
3. A Lumos mostra a prévia: **Hoje**, **Próximos**, **Waiting For**, **Recorrências** e o que precisa de
   revisão. Toque em **Importar**. **Desfazer** desfaz só o que ainda está como a importação deixou.

O texto do briefing (sem o JSON) fica guardado como nota: “Daily Executive Briefing · dd/mm”. Colar de novo
o mesmo briefing não duplica nada (a nota é atualizada).

## Cada coisa mantém sua natureza (v2)

| No JSON | No app | Aparece onde |
|---|---|---|
| `tasks` | **tarefa do dia do briefing** (sem `due_date` ≠ sem dia) | **Hoje**, na fila única, com a etiqueta da frente |
| `backlog_watchlist` · `scheduled` | **item de backlog**, que não é tarefa, com a janela lida das notas (“Semana de 12 a 16/10”, “a partir de 13/10”, “próxima semana”) | **Próximos → No radar** (recolhido), com check e Hoje / Amanhã / Segunda / Outro dia; quando a janela começa, vira “precisa de você” |
| `backlog_watchlist` · `waiting` | **Waiting For** (liga no Esperando que já existe, por exemplo Vitor e Thales) | só quando o retorno vence ou fica parado tempo demais |
| `backlog_watchlist` · `recurring` | **reconhecida** contra o que já existe (Pagamentos do mês); não cria nada sem valor, dia e frequência | Dinheiro → Pagamentos do mês |

- **Nada duplica:** cada item ganha uma chave fixa (`daily-briefing-2026-10-10-marina-os-verificar-integracao…`). Colar o mesmo JSON 10 vezes grava uma vez só.
- **O seu estado vence:** o que você marcou como feito, moveu, editou, resolveu ou apagou fica como você deixou, mesmo reimportando.
- **Equivalente ≠ parecido:** “Multas do carro” (watchlist) liga na sua tarefa “Resolver multas do carro”. Já “Consolidar pendências JNB” (tarefa de hoje) e “Hospedagem e safari JNB” (depois) são coisas diferentes.
- **Origem:** tudo guarda de onde veio (`daily_briefing`, data, chave, lote). Pergunte à Lumos: **“o que veio do briefing hoje?”**.
- **Prévia → Importar → só diz “importado ✓” depois de salvo no aparelho.** “Desfazer” desfaz só o que ainda está como a importação deixou. Histórico em **Ajustes → Dados → Importações do briefing**.
- **Entrada:** aceita `snake_case` (`backlog_watchlist`, `done_criteria`, `estimated_minutes`, `due_date`) e `camelCase`. Categoria desconhecida não derruba nada. Prioridade desconhecida ou data inválida ficam sem esse dado e aparecem em “precisa de revisão”. Item sem título também não some: entra em “precisa de revisão”.

### Depois do import, pela Lumos
- “B.O. feito.” marca a tarefa como feita.
- “JNB fica pra segunda.” move a tarefa.
- “isso do Santander coloca terça” transforma o item de backlog em tarefa na terça.
- “Vitor respondeu.” resolve o Esperando.
- “Thales ainda não respondeu.” mantém em Esperando e anota a checagem de hoje.

### Campos das tarefas

| Campo | No app |
|---|---|
| `category` | Carreira/Networking/Portfólio → Carreira · Inglês → Estudo · Produto/IA/Operação → Trabalho · Financeiro/Logística → Vida real · Viagem → Viagem · desconhecida → geral |
| `project` | frente existente (Santander, FashionFinder, Day One AI, Yoga App, Tranquilo SP…); um nome novo vira frente nova, com aviso na prévia |
| `priority` | P1 = alta · P2 = média · P3 = baixa · Optional = baixa + etiqueta “opcional” |
| `done_criteria` | “Feito quando: …” (doneCriteria) |
| `estimated_minutes` | duração |
| `due_date` | vazio ou o dia do briefing → tarefa desse dia; data depois → tarefa do dia com prazo |
| `recurring_financial_categories` | pagamentos com check (sem valor) |

O app nunca inventa valor, horário ou vencimento. Em Dinheiro → Pagamentos do mês dá para escolher o dia
de vencimento de cada pagamento; com o dia escolhido, o pagamento aparece em **Hoje** naquele dia, com check.

## Dica para o prompt do briefing

O formato que você já usa funciona como está. Duas coisas ajudam:
- mantenha os títulos do backlog **iguais** aos do app (por exemplo, “Solucionar conta Apple”). Assim o
  briefing puxa a mesma tarefa em vez de criar outra;
- só use `status: "done"` para o que já foi feito de fato.

## Seu backlog de 09/10

O backlog que você mandou em 09/10 (Santander, Fashion Finder, Yoga App, Day One, Tranquilo SP, B.O de
pedágio, multas, hospedagem e safari JNB) e os 28 pagamentos recorrentes já vêm no app (seed v9). Eles entram
**uma vez** no aparelho com o próximo deploy, sem mexer no que você já marcou ou alterou.

## Deploy novo não desfaz nada

- Os dados ficam no aparelho (IndexedDB), e um deploy não toca neles.
- A migração do seed é só aditiva: um item que você apagou não volta, e um item que você editou não é
  sobrescrito.
- Todo check (tarefas, rotina, eventos, follow-ups, pagamentos) é mantido.
- A versão nova só recarrega o app depois de salvar no aparelho o que estava pendente.
- O mesmo endereço do app é obrigatório: os dados ficam guardados por endereço. Se o domínio mudar, use
  Ajustes → Dados → Backup para levar tudo.
