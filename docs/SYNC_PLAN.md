# Sincronização automática — auditoria e plano (P0, 09/11/2026)

## Uma fonte de verdade (já funciona)

Cada coisa é guardada **uma vez** no banco do app. A Home e a Agenda leem a mesma projeção (`src/data/calendar/universal.ts`), sem cópias:

| Registro | Onde vive | Aparece em |
|---|---|---|
| Evento | `events` | Home, Agenda |
| Treino (planejado ou feito) | `workouts` (+ semana modelo, fora do modo viagem) | Home, Agenda, Treinos |
| Reserva / passeio / transporte | `tripItems` | Home, Agenda, Viagem |
| Tarefa com hora | `tasks` | Home, Agenda, Tarefas |
| Tarefa do dia sem hora · prazo · cobrança | `tasks` | Home ("Sem horário"), Tarefas |
| Aula do intercâmbio | `trips.expedition.school` | Home, Agenda |

Concluir um treino muda o registro: a Home e a página de Treinos mostram o mesmo status, e ele continua lá depois de recarregar.

## O que sincroniza hoje

- **Entre os aparelhos dela:** sim. O banco do artifact (`src/data/sync/artifact-db.ts`) usa versão por registro, e um registro apagado vira tombstone.
- **Importador JSON (`marina-os/changes@1`, Ajustes → Importar):** sim.
  - Valida o arquivo e mostra uma prévia.
  - Reconhece o que já existe por `id`, `sourceKey` ou `externalRef`.
  - Importar o mesmo arquivo duas vezes dá "unchanged".
  - Tipos aceitos: task, waiting, backlog, plannedWorkout, completedWorkout, tripItem, event, studySession, project, routine, expense, receita.
  - Não precisa de IA.
- **Lumos:** grava pelos mesmos registros, então não duplica.
- **Google Calendar, Gmail, Garmin:** **não sincronizam sozinhos.**
  - O artifact não tem servidor nem token OAuth guardado, e as regras proíbem token no `localStorage`.
  - Nada no app diz que está sincronizando com eles.

## Plano (em ordem, cada passo só leitura + aprovação)

1. **Mais tipos no importador — FEITO (09/11):**
   - `event`, identificado pelo id externo (`externalId`) ou por título + dia;
   - `studySession`, identificada por dia + área + título (os minutos nunca contam duas vezes);
   - `tripItem` identificado primeiro pelo nº de confirmação. Agora aceita hora, fornecedor, status da reserva e próximo passo.

   Com isso, o JSON do Daily Briefing ou do ChatGPT cobre a semana inteira.
2. **Google Calendar só leitura dentro do app:**
   - usa a capacidade `mcp` do artifact com o conector Google Calendar dela, chamado com as credenciais dela. Nenhum token entra no app;
   - um adaptador (`CalendarSourceAdapter`) busca os eventos e o reconciliador gera uma **prévia de mudanças**, igual à do importador;
   - nada é escrito sem ela aprovar.
3. **Gmail (reservas, remarcações e cancelamentos):**
   - lê só os remetentes que ela autorizar (operadoras, companhias aéreas, hotéis);
   - extrai o número de confirmação, a nova data e o valor;
   - sugere a atualização do `tripItem` correspondente e mostra o impacto na Agenda e os conflitos;
   - nunca cancela, paga, remarca ou responde sozinho.
4. **Escrever no Google Calendar:** só com autorização explícita para cada mudança.
5. **Garmin/Strava:** importa arquivos (.fit/.gpx/.csv) até existir uma integração oficial autorizada.

### Regras de reconciliação (valem para todos os adaptadores)

A ordem de prioridade abaixo é uma diretriz. Na hora de decidir, também contam a data, a origem e quem tem autoridade sobre o registro.

1. Mudança explícita e mais recente dela (`updatedAt` + `provenance: user`).
2. Confirmação ou remarcação oficial mais recente (e-mail do fornecedor com data).
3. Estado atual do calendário.
4. Planejamento cadastrado.
5. Seed ou dados históricos (nunca sobrescreve 1–4).

Identidade de cada tipo:

| Tipo | Identificado por |
|---|---|
| Reserva | número de confirmação + fornecedor |
| Evento | id externo estável |
| Treino | id da ocorrência |
| Tarefa | id ou `sourceKey` |

Nunca deduplicar só pelo título. Um e-mail antigo nunca desfaz uma decisão manual mais nova.
