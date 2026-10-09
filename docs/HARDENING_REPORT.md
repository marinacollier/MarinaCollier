# MARINA OS — Hardening / Pré-produção (relatório)

Rodada sem features novas: só confiabilidade, persistência, integração, UX mobile, testes de vida real,
regressão e correção de inconsistências. Nada foi publicado em produção.

Base: branch `claude/marina-os-life-app-ix1zvv`. 82 arquivos de teste, 929 testes passando, typecheck e lint limpos.
Mas o critério desta rodada foram **fluxos reais**: o app rodando no navegador (Chromium, iPhone 13, IndexedDB e
service worker reais) e as frases dela passando pela Lumos, com o estado conferido **depois de reabrir o app**.

---

## PASSOU (fluxos realmente testados)

**Persistência / restart (navegador real, `e2e/restart.mjs`)**
Sessão 1 pela Lumos e por toques: corrida feita · tarefa criada e concluída · refeição (YoPRO, estimativa) ·
Santander recebido · livro terminado · 30 min de inglês · follow-up da Fran · win · FashionFinder prioridade ·
Fisioterapia 12h → 13h · pedal domingo → sábado · Fashion Finder recebido R$ 18.500 (previsto R$ 10.000 preservado) ·
2 itens do Milagre da Manhã. Depois, banco do aparelho comparado (estrutura completa):
- fechar o navegador por completo e reabrir → **idêntico**
- recarregar → **idêntico**
- nova aba → **idêntico**
- reiniciar o PWA **offline** (servido pelo service worker) → **idêntico**
- Home mostra FashionFinder em Hoje importa; Agenda (nova aba) mostra Fisioterapia às 13:00.

**Lumos só confirma depois de gravar** — todas as mutações (respostas diretas, confirmações, opções, ajustes de
dia/treino, comida, pular refeição, propostas/trocas de comida e todo "Desfazer"): escreve → salva → **lê de volta
do aparelho** → só então "feito". Testado com um aparelho que recusa gravação e com um que "perde" a gravação:
a Lumos diz que **não salvou**, desfaz em memória e no aparelho, e oferece "Tentar de novo".

**Lumos como usuária real** (`lumos-real-life.test.ts`, cada frase → grava → reabre → confere):
agenda/treino (natação 6h45 · corrida sexta→sábado com template intacto · hoje não vou nadar · pedal 3h30),
rotina (amanhã acordo 5h30 · já fiz yoga hoje · amanhã cancelei meu inglês), trabalho (Fran ficou de me responder
sexta, sem duplicar ao repetir · FashionFinder é prioridade hoje · essa tarefa já fiz / pergunta quando não há
contexto), carreira (30 min inglês · vaga Head of Product · falei com Ana · essa vaga não faz mais sentido),
dinheiro (recebi o Santander · Fashion Finder ainda não pagou · quanto tenho previsto), vida (terminei meu livro ·
adiciona comprar ração da Luna · faz minha lista de compras).

**Valores**: 18 mil · 18.000 · 18000 · 18 mil e 500 · 18.500 · R$ 18.500 · R$18.500,00 · 18,5 mil · 18k ·
dezoito mil (e quinhentos). Datas/horários nunca viram valor. Ambíguo ("recebi 18", "18,500", dois valores) →
pergunta com opções. Valor diferente do previsto → confirma antes de gravar.

**Recebimentos**: previsto não vira recebido com a data; mesmo registro evolui; previsto 20.000 + recebido 18.500
guardados juntos, observação salva, contrato intocado; receita fora de **todas** as somas de gasto
(totais, comparações, categorias, viagens, busca, Lumos, CSV).

**Contratos**: Santander R$ 20.000 dia 15 · Fashion Finder R$ 10.000 dia 30 · brutos · editáveis · nenhum campo
de imposto/líquido/reajuste/multa/juros.

**Privacidade (código)**: criar (códigos diferentes recusados) → reiniciar começa bloqueado → código errado
recusado → certo desbloqueia → trocar (atual errado recusado; antigo deixa de valer; novo sobrevive ao restart) →
rebloqueio após o tempo em segundo plano → desligar exige código. Código só como hash PBKDF2 com sal.
**Lumos bloqueada** não revela valor, contrato, vaga, empresa nem pessoa — inclusive "quanto vou receber?",
"qual minha renda?", "quem estou entrevistando?", "o que aconteceu essa semana?" e a busca.
**Face ID**: sem autenticador de plataforma o app diz "não disponível" (sem experiência falsa).

**Backup**: criar dados em todas as áreas (inclui contratos, recebimentos, oportunidades, contatos, evidências,
review executiva, sessão de carreira, preferências, trava, memória/estado da Lumos) → exportar → apagar → reabrir →
importar → reabrir → **igualdade estrutural do banco inteiro**. Lixo: ids duplicados (fica o mais novo),
relações órfãs avisadas (inclui recebimento sem contrato, vaga → contato inexistente, sessão → meta),
checksum errado, arquivo cortado, vazio, não-JSON, versão antiga (aceita e atualiza), versão futura (recusada) —
todos com mensagem em português claro.

**Bugs antigos re-testados no seed real** (`old-bugs.test.ts`): identidade do card de treino; mover seg→ter
(some de seg, aparece ter, template igual, base não traz de volta); Yoga já na semana não volta em "trazer da base";
TotalPass (yoga sem pass → sem conflito; natação pass + yoga sem pass → sem conflito; natação + musculação pass →
conflito); dois treinos no mesmo dia não são aviso, só choque real.

**Carreira não polui a Home**: Home em claro/escuro, com dados e vazia — só Lumos, Agora/Depois, Hoje importa,
Restante do dia. Nenhum card fixo de carreira, contrato, recebimento ou backup.

**Planejador**: na semana real dela (Cerâmica seg/qui 18–22h, presencial ter/qua, sessões-chave) não encaixa
carreira à força; em semana com espaço: no máx. 3 sessões, 1 bloco de foco por dia, nunca em presencial/descanso,
nunca a menos de 2h de sessão-chave nem tarde na véspera de uma cedo, 2 noites livres, sem duplicar ao rodar de novo.

**Executive Career Review**: montada dos dados existentes, uma por mês, objeto separado de Meu mês.

**Um dia** e **uma semana** da Marina (`lumos-week.test.ts`) com reabertura no meio; no fim "o que aconteceu essa
semana?" lista natação movida, yoga, Santander, vaga, Fran e o livro — sem "Gasto: Santander".

**Visual (iPhone 13, claro/escuro, com dados/vazio)**: Home, Lumos, Agenda, Espaços, Corpo/Treino, Nutrição,
Dinheiro + Recebimentos, Carreira 2027, Revisão executiva, Dados/backup, Privacidade, sheet de recebimento,
composer com teclado (viewport reduzido). Sem rolagem horizontal, sem erro de página.

---

## CORRIGIDO nesta rodada

1. Lumos dizia "feito" antes de gravar no aparelho → agora só depois de salvar e ler de volta; falha = rollback + aviso.
2. Falha de gravação era só um log → estado `saveFailed` + aviso discreto "Não consegui salvar no aparelho".
3. Gravações podiam chegar fora de ordem → fila serializada.
4. "já fiz yoga" sem yoga no plano marcava **outro treino** do dia (primeiro da lista) → identidade por modalidade.
5. Linha de pré/pós-treino abria o combustível do **primeiro** treino do dia → resolve pelo horário.
6. "Trazer da base" re-propunha treino **movido** de dia → considera a semana inteira (e treinos avulsos).
7. Check-in era só por modalidade (yoga sem TotalPass impossível) → cada treino diz se usa o pass.
8. Receita aparecia como **"Gasto: Santander"** no "o que mudou/semana" e o CSV de gastos rotulava receita como
   "compra planejada" → receita fora de toda soma/lista de gasto.
9. Comparação de instantes como texto (fusos diferentes) no feed → comparação por instante.
10. Campo de valor lia "18.500" como R$ 18,50 → R$ 18.500,00.
11. Botão "Recebi" do recebimento não salvava a observação.
12. "adiciona comprar ração da Luna" perguntava horário → anota sem data inventada.
13. "Fran ficou de me responder sexta", "FashionFinder é prioridade hoje", "essa tarefa já fiz",
    "o que aconteceu essa semana?", "qual minha renda?", "quem estou entrevistando?" não faziam nada útil.
14. Eventos de carreira referenciavam vaga/contato como "tarefa" → tipos corretos.
15. "empresa X" e "X" viravam duas empresas → nome canônico.
16. Vazamento com trava: busca, agente de Finanças e feed de mudanças mostravam valores/vagas → ocultos.
17. Planejador empilhava 4 blocos na sexta à noite → regras acima.
18. Registro de ajuste salvo como "Feito" → descreve o que mudou.
19. Texto redundante "Esperando Fran: Retorno de Fran" → "Esperando Fran: Retorno".
20. Composer da Lumos: texto passava por baixo dos botões.
21. Backup cortado/não-JSON tinha mensagem genérica → mensagens específicas.

---

## LIMITAÇÕES REAIS

- **Daily Briefing import não existe no código** (não há `sourceKey`/`userModifiedAt`/importador de briefing). Criar
  seria feature nova, então não foi feito nem testado. Hoje "importado" = agenda .ics.
- **Dados só neste aparelho** (IndexedDB), sem sincronização. Proteção = backup manual (lembrete mensal da Lumos).
  Se o iOS limpar o armazenamento de um site não instalado, perde-se o que não estiver no backup.
- **A trava é de tela, não criptografia**; sem limite de tentativas no código; o arquivo de backup não é cifrado.
- Com Carreira bloqueada, a **North Star** (meta "Head of Product — 2027") continua visível em Metas.
- O CSV "Gastos" não tem receitas e não há CSV de recebimentos (o backup tem tudo).
- Lumos é determinística: frases fora dos padrões caem na busca. "comi um yopro" pergunta rótulo/estimativa.
- Na semana típica dela o planejador não encaixa sessões de carreira (falta janela boa) — metas ficam flexíveis.
- O Milagre da Manhã aparece em dois blocos na Agenda quando o treino cai no meio da rotina.

## NÃO TESTADO

- **iPhone real** (Safari / PWA instalado): teclado nativo, safe areas do notch, toque, háptica, cold start pela
  tela inicial, política de armazenamento do iOS. (Testado em Chromium com perfil iPhone 13.)
- **Face ID / WebAuthn de verdade** — só o caminho "indisponível, sem fake".
- Strava (não habilitado), Organizze, Google/Microsoft ao vivo, ditado por voz.
- Uso prolongado (meses de dados) e desempenho com banco grande.

## PRODUCTION RISK: **MÉDIO**

Persistência, restart, backup, privacidade lógica e as frases dela foram verificados de ponta a ponta — o risco de
"perdi o que marquei" caiu muito. Fica médio porque (1) nada rodou ainda num iPhone real, onde teclado, PWA e
armazenamento do Safari são os pontos mais frágeis, e (2) os dados vivem num único aparelho sem sync.

## GO / NO-GO

**GO condicionado para uso diário pessoal**, depois de 15 minutos no iPhone dela:
1. instalar na Tela de Início; 2. marcar 3 coisas + 2 frases na Lumos; 3. fechar pelo multitarefa e reabrir;
4. ligar a trava e testar Face ID; 5. gerar o primeiro backup e guardar em Arquivos.
Se esses 5 passarem: GO. Se algum falhar: NO-GO até corrigir. Produção pública/multiusuário: **NO-GO** (não é o escopo).
