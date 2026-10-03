# Marina Collier — identidade "terra & mata"

> em constante movimento: corpo, mente e vida.

Identidade pessoal da Marina, usada no MARINA OS e pensada para os sites
marinacollier.com e marinacollierhub.com.

## Essência

Produto, tecnologia e IA + esporte ao ar livre (corrida, trail, natação, bike/gravel, surf, yoga, circo)
+ viagens e natureza. Feminina sem ser "menininha", esportiva, boho chic, editorial, contemporânea.
Neutros terrosos, verdes e marrons. Calma com energia.

## Paleta

| Token | Nome | Claro | Escuro | Uso |
|---|---|---|---|---|
| bg | Pedra | `#ECEBE4` | `#131611` | fundo |
| surface | Papel de algodão | `#F7F6F1` | `#1B1F18` | cards |
| surface-2 | Pedra úmida | `#E2E0D6` | `#252A21` | campos, chips |
| ink | Mata | `#1D221B` | `#ECEAE1` | texto, botões principais |
| ink-2 | Folha seca | `#41463C` | `#CFCDC1` | texto secundário forte |
| muted | Líquen cinza | `#777A6C` | `#97988A` | legendas |
| line | Trilha | `#D6D3C6` | `#2F342B` | bordas |
| accent | Musgo | `#4D5B2C` | `#A6B97A` | ação, foco, destaque |
| sage | Eucalipto | `#7F957A` | `#A9BCA2` | concluído, calma |
| ocean | Mar frio | `#4A6B68` | `#8FB3AE` | água: natação, surf, viagem |
| sand | Areia | `#A88B62` | `#CDB48C` | sol, "a confirmar", calor |
| plum | Cacau | `#6D4A37` | `#C49C84` | terra, criatividade |

Cada cor tem uma versão `-soft` para fundos. Sem roxo, sem gradientes SaaS, sem creme com terracota.

## Tipografia

- **Bodoni Moda** — títulos e frases editoriais. Peso 500, tracking levemente negativo, itálico em saudações e citações.
- **Barlow Condensed** (600) — rótulos em CAIXA ALTA com tracking aberto (0,16em) e números: horários,
  contagens regressivas, kms. Referência: número de peito de prova e placa de trilha.
- **Figtree** — texto corrido e interface.

## Forma e detalhes

- Cantos médios (cards 18px, botões em pílula), sombras longas e suaves, bordas finas cor "trilha".
- Marca: sol de areia + montanha mata + onda musgo (corpo, mente e vida em movimento).
- Fotografia: luz natural, natureza (mar, montanha, estrada de terra), tons quentes e dessaturados, grão leve.
  Nada de banco de imagens corporativo.
- Ícones: traço fino (1.6–2px), arredondados.
- Voz: pt-BR leve, direta, carinhosa, com energia. Emojis pontuais. Nunca culpa, nunca score.

## Prompt para o Lovable (sites marinacollier.com e marinacollierhub.com)

Copie e cole no Lovable:

```
Quero refazer a identidade visual deste site para a minha identidade pessoal "terra & mata".
Mantenha o conteúdo e a estrutura de páginas; mude o visual de forma consistente em todo o site.

ESSÊNCIA
Sou a Marina Collier: produto, tecnologia e IA + esporte ao ar livre (corrida, trail, natação, bike/gravel,
surf, yoga, circo) + viagens e natureza. O site deve ser feminino sem ser "menininha", esportivo, boho chic,
editorial e contemporâneo. Calmo, com energia. Nada de cara de template SaaS.

CORES (defina como variáveis CSS / tokens do Tailwind e use só elas)
- Fundo "pedra": #ECEBE4 · Cards "papel": #F7F6F1 · Superfície secundária: #E2E0D6
- Texto principal "mata": #1D221B · Texto secundário: #41463C · Legendas: #777A6C · Bordas: #D6D3C6
- Cor de ação "musgo": #4D5B2C (botões principais, links, foco), fundo suave #DCE1CD
- Apoio: eucalipto #7F957A, mar frio #4A6B68, areia #A88B62, cacau #6D4A37 (cada um com versão suave)
- Modo escuro (opcional): fundo #131611, cards #1B1F18, texto #ECEAE1, ação "líquen" #A6B97A
- Proibido: roxo, azul SaaS, gradientes chamativos, creme com terracota, rosa bebê.

TIPOGRAFIA (Google Fonts)
- Títulos: "Bodoni Moda", peso 500, letter-spacing -0.015em; use itálico em frases de destaque.
- Rótulos/eyebrows e números: "Barlow Condensed" 600, CAIXA ALTA, letter-spacing 0.16em
  (estilo número de peito de prova / placa de trilha).
- Texto: "Figtree" 400/500, line-height 1.5.

FORMA
- Cards com cantos 18px, borda 1px #D6D3C6, sombra longa e suave.
- Botões em pílula: primário fundo #1D221B com texto #ECEBE4; secundário fundo #E2E0D6; destaque musgo.
- Muito respiro, grid editorial, títulos grandes, seções com rótulo condensado em caixa alta acima do título.
- Ícones de traço fino e arredondados.

IMAGENS
- Fotografia com luz natural: mar, montanha, estrada de terra, treino ao ar livre, viagem.
  Tons quentes e levemente dessaturados, grão leve. Sem banco de imagens corporativo.

MARCA
- Símbolo: sol cor areia (#A88B62) atrás de uma montanha cor mata (#1D221B), com uma onda musgo
  (#4D5B2C) embaixo. Use como favicon e no rodapé.
- Assinatura: "em constante movimento: corpo, mente e vida."

VOZ
- Português brasileiro, leve, direto, carinhoso e com energia. Emojis pontuais.

Aplique em todas as páginas, nos estados de hover/foco, no rodapé e no favicon, e garanta contraste
acessível (AA) e boa leitura no celular.
```
