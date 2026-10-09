# Daily Executive Briefing → Marina OS

O briefing é escrito fora do app (Claude, com pesquisa na web). O app recebe o **bloco final em JSON**
("BLOCO PARA MARINA OS APP") e transforma em checklist do dia, com check em tudo.

## Como usar (todo dia)

1. Copie o briefing inteiro (texto + bloco JSON).
2. Cole na Lumos (Home ou conversa) e envie.
3. A Lumos mostra o que vai entrar: tarefas novas, itens do backlog puxados para hoje, esperas,
   pagamentos e frentes novas. Toque em **Colocar no app**. **Desfazer** desfaz tudo de uma vez.

O texto do briefing (sem o JSON) fica guardado como nota: “Daily Executive Briefing · dd/mm”. Colar de novo
o mesmo briefing não duplica nada (a nota é atualizada).

## O que o app faz com cada campo

| Campo | No app |
|---|---|
| `title` | título da tarefa; se já existe uma tarefa com o mesmo título, **não duplica** — num briefing diário ela vem para o dia |
| `category` | Carreira/Networking/Portfólio → Carreira · Inglês → Estudo · Produto/IA/Operação → Trabalho · Financeiro/Logística → Vida real · Viagem → Viagem |
| `project` | a frente existente (Santander, FashionFinder, Day One AI, Yoga App, Tranquilo SP…); um nome novo vira frente nova, e a Lumos avisa antes |
| `priority` | P1 = alta · P2 = média · P3/Optional = baixa |
| `done_criteria` | nas notas da tarefa: “Feito quando: …” |
| `estimated_minutes` | duração da tarefa |
| `status` | `todo` · `done` · `waiting` (vai para Esperando; quem = “retorno do Vitor” → Vitor) |
| `due_date` | briefing **diário**: a tarefa é do dia do briefing e `due_date` vira prazo. Backlog: até amanhã vira o dia; depois disso, prazo |
| `backlog_watchlist` | `waiting` → Esperando · `scheduled` → tarefa · `recurring` → pagamento com check |
| `recurring_financial_categories` | pagamentos com check em Dinheiro → **Pagamentos do mês**. Nunca com valor; “— semanal” = check por semana |

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
