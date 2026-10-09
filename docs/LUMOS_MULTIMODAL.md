# Lumos multimodal — texto, voz, print, PDF

Uma Lumos só. Todo canal termina nas mesmas ações (`src/features/assistant/act/capabilities.ts`):

| Canal | Como entra | Onde termina |
|---|---|---|
| Texto | composer | handlers da Lumos (`act/respond.ts`) |
| Voz | **ditado do próprio iPhone** (reconhecimento do navegador, pt-BR) → texto | o mesmo pipeline do texto |
| Print / foto / PDF | função `lumos-read` (Claude, chave no servidor) → leitura estruturada + a frase dela | os mesmos handlers (`calendar`, `attachment`, …) |

Exemplo: “aniversário da Ana sábado 20h” (texto), “coloca aniversário da Ana sábado às oito” (voz) e o
print do convite terminam todos em `create_calendar_event` (`src/data/calendar/events.ts`).

## Voz (decisão: ditado do iPhone, sem servidor)

- 🎙 → `● 00:08` com as palavras aparecendo · **Cancelar** · **Enviar** (envia sozinho após uma pausa).
- Nenhum áudio passa pelos servidores do MARINA OS.
- Confiança baixa (quando o navegador informa) → “Entendi: “…” — confere” no composer, sem executar.
- Sem reconhecimento no navegador, ou o sistema recusando (comum no app instalado na Tela de Início),
  → o 🎙 **some** (fica lembrado naquele aparelho) e a Lumos sugere o 🎙 do teclado do iPhone, que ela
  entende igual. Nenhum botão morto.

## Prints e PDFs (decisão: Claude via Supabase)

O 📎 só aparece quando a leitura pode acontecer: servidor configurado **e** login disponível. Sem login,
tocar no 📎 e enviar diz “entra na sua conta” com o atalho para entrar.

### O que configurar (uma vez)

1. Projeto Supabase com as funções deste repositório (`supabase functions deploy lumos-read`).
2. Segredos da função (Supabase → Edge Functions → Secrets):
   - `ANTHROPIC_API_KEY` — chave da API do Claude (nunca vai para o app);
   - `ALLOWED_EMAILS` — seu e-mail (só ele pode usar a leitura);
   - `APP_ORIGIN` — a URL do app (CORS);
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — já usados pelas outras funções.
3. Auth → Providers → Email: ativo; modelo do e-mail com `{{ .Token }}` (código de 6 dígitos);
   crie seu usuário (Auth → Users) — o app não cria contas.
4. Build do app com `VITE_MARINA_API_URL=https://<ref>.supabase.co/functions/v1` e
   `VITE_SUPABASE_ANON_KEY=<anon key>` (chave pública).
5. No app: Ajustes → Integrações → **Conta do MARINA OS** → e-mail → código.

### Política de anexos (attachment memory)

- O arquivo é reduzido no iPhone, enviado uma vez, lido em memória pela função e **descartado**. Não fica
  no aparelho, no backup nem no servidor.
- Fica só o que a Lumos registrou (evento, tarefa, livro…) e, como referência, o **nome** do arquivo
  (“Lido de um print (convite.png)”).
- O texto lido aparece na conversa daquela sessão e some ao fechar; o leitor é instruído a omitir dados
  sensíveis (CPF, cartão, senhas).

### O que a leitura nunca faz

- Inventar campo: sem mês → “17 de qual mês?”; sem horário → dia inteiro, dito em voz alta; data
  malformada → tratada como ausente.
- Executar sozinha um anexo sem pedido: sem frase, a Lumos mostra o que encontrou e pergunta
  (“Encontrei um convite… Adicionar à agenda?”). Com “coloca isso na agenda / salva / anota”, executa
  direto com Desfazer.
- Duplicar: mesmo título no mesmo dia já está na agenda.

### Categorias (camada genérica)

`event` → agenda · `task` → tarefa · `work` → tarefa ou Esperando (quando alguém ficou de fazer) ·
`book` → quero ler · `shopping` → lista de compras · `travel` / `food` / `unknown` → mostra o que leu e
pergunta o que fazer.

## Agenda externa

As integrações de Google/Outlook são só leitura hoje. Eventos criados pela Lumos ficam no calendário
interno “MARINA OS”; a opção “adicionar também ao Google/Outlook” só aparecerá quando a escrita existir
de verdade.
