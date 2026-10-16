# Ida e volta com o ChatGPT (sem IA dentro do app)

O app não chama IA nenhuma neste fluxo. Ele **exporta um contexto**, você conversa com o ChatGPT, e o
ChatGPT responde com um **JSON de mudanças** que o app lê de forma determinística — com prévia, regras e
desfazer.

## Passo a passo no iPhone

1. **Ajustes → Dados → ChatGPT**: marque os módulos (tarefas, aguardando, backlog, projetos, treinos,
   refeições, hábitos, UGC, receitas, gastos). Dados sensíveis ficam **fora por padrão** (valores em dinheiro,
   saúde, contatos das marcas, notas) — ligue só o que quiser mandar. Módulos de uma área trancada (cadeado
   de privacidade) não saem enquanto trancados.
2. Toque **"Copiar contexto para ChatGPT"** e cole na conversa. Peça o que quiser ("reorganiza minha semana",
   "marca como feito o que eu disse", "planeja 3 treinos").
   - Só quer as regras? **"Copiar só as instruções"**.
3. O ChatGPT responde **só** com um JSON `marina-os/changes@1`. Copie a resposta inteira (pode vir com
   ```` ```json ```` — o app acha o JSON).
4. Na **Home**, no quadro da Lumos, toque o ícone **📋 Colar e importar JSON** (1 toque; o iPhone pode
   pedir um segundo toque em "Colar"). Abre a **Central de importação** já com a prévia. (Também em
   Ajustes → Dados → Central de importação → "Colar e ver prévia".)
5. Leia a prévia: "12 novos · 7 atualizações · 3 já existentes · 2 conflitos · 1 exclusão", e por item o
   antes → depois de cada campo. Resolva o que precisa de você:
   - **precisa de revisão**: escolha *vincular a X*, *criar novo* ou *ignorar*;
   - **conflito** (você mudou depois): fica a sua versão, a não ser que ligue "usar a do arquivo";
   - **exclusão**: só acontece se você ligar o interruptor daquele item.
6. **Confirmar** → o app guarda uma cópia automática, grava tudo, salva no aparelho e só então diz "Importado ✓".
   Errou? **Desfazer** ali mesmo, ou no histórico de importações, ou restaure a cópia automática.

## O contexto (`marina-os/context@1`)

```json
{
  "schemaVersion": "marina-os/context@1",
  "generatedAt": "2026-10-15T12:00:00.000Z",
  "timezone": "America/Sao_Paulo",
  "today": "2026-10-15",
  "modules": {
    "tasks": [{ "id": "…", "type": "task", "version": "2026-10-14T21:03:11.000Z", "title": "…", "status": "todo", "date": "2026-10-15", "project": "Santander" }]
  },
  "excluded": ["Valores em dinheiro", "…"],
  "instructions": "Você está ajudando a Marina… (regras + campos por tipo + JSON schema)"
}
```

`version` é o `updatedAt` do registro — o ChatGPT devolve como `baseVersion`.

## A resposta (`marina-os/changes@1`)

```json
{
  "schemaVersion": "marina-os/changes@1",
  "generatedAt": "2026-10-15T09:00:00-03:00",
  "source": "ChatGPT",
  "changes": [
    { "op": "complete", "type": "task", "id": "<id>", "baseVersion": "<version>" },
    { "op": "move", "type": "plannedWorkout", "id": "<id>", "baseVersion": "<version>", "fields": { "date": "2026-10-21", "time": "06:00" } },
    { "op": "create", "type": "task", "sourceKey": "chatgpt-2026-10-15-orcamento", "fields": { "title": "Revisar orçamento", "date": "2026-10-16" } }
  ]
}
```

- `op`: `create` · `update` · `complete` · `move` · `archive` · `delete`
- `type` (cada um é o registro que já existe no app — nada é achatado em "tarefa"):
  `task`, `waiting`, `backlog`, `recurring` (só vincula), `plannedWorkout`, `completedWorkout`, `plannedMeal`,
  `consumedMeal`, `expectedRevenue`, `receivedRevenue` (receitas = o modelo de recebíveis de Dinheiro),
  `expense`, `ugcProspect` (marca + oportunidade), `ugcDeal`, `project`, `routine` (aceita `habit`).
- Identidade, nesta ordem: `id` → `sourceKey`/`externalRef` de uma importação anterior → `match`
  (`title`, `project`, `date` — o mesmo casamento do Daily Briefing, ex.: B.O. abrir/verificar/regularizar é
  uma obrigação só) → se houver mais de um candidato, **precisa de revisão**.
- Datas `AAAA-MM-DD`, horas `HH:MM`, dinheiro em centavos (`amountCents`; `amount` em reais também é aceito).

## Regras que o importador garante

- Prévia não grava nada. Confirmar grava num **lote** (ImportBatch) com origem, resultado por item e desfazer.
- Campos não enviados ficam como estão.
- Registro que você mudou depois de `baseVersion` (ou de `generatedAt`) → **conflito**; a sua versão vence.
- Nunca reabre o que está feito, nunca ressuscita cancelado/arquivado, nunca apaga sem o seu sim por item.
- Áreas trancadas (dinheiro / carreira) → **bloqueado** até destrancar.
- Mesmo JSON duas (ou dez) vezes → nenhuma mudança nova.
- Salva no aparelho antes de mostrar sucesso.
- Tipo que o app ainda não tem → "não suportado ainda" (nunca finge).

O Daily Briefing JSON também pode ser colado na mesma Central — vai para o importador do briefing.

## Limitações conhecidas

- `recurring` só reconhece recorrências existentes; criar recorrência é no app.
- `project` não tem `archive` (use `complete` → concluído); `expense` não tem `archive`.
- `ugcProspect` não cria contatos (e-mails/telefones nunca entram nem saem por aqui).
- O ChatGPT não sabe a hora real: se ele inventar um `generatedAt` antigo, mais coisas aparecem como
  conflito (lado seguro). Prefira que ele use `baseVersion`.
