/**
 * Laboratório Criativo — the exercise list from her spec, as static prompts. No daily obligation, no streak.
 * Starting one creates a work with origin 'exercicio' (status rascunho); what she learned is kept on the work.
 */
export interface Exercise {
  id: string
  title: string
  prompt: string
}

export const EXERCISES: Exercise[] = [
  { id: 'cena-sem-metaforas', title: 'Cena sem metáforas', prompt: 'Escreva uma cena usando só o que se vê, se ouve e se toca. Nenhuma metáfora.' },
  { id: 'objeto-cotidiano', title: 'Poema a partir de um objeto cotidiano', prompt: 'Escolha um objeto comum por perto e deixe que ele conduza o poema.' },
  { id: 'prosa-poetica', title: 'Reescrever em prosa poética', prompt: 'Pegue um texto seu em versos e reescreva em prosa poética, sem perder o ritmo.' },
  { id: 'tensao-sem-nomear', title: 'Tensão sem nomear emoções', prompt: 'Crie tensão sem dizer o nome de nenhum sentimento.' },
  { id: 'ironia', title: 'Ironia', prompt: 'Escreva um texto em que a ironia carregue o sentido.' },
  { id: 'dialogos', title: 'Diálogos', prompt: 'Construa um texto a partir de um diálogo — o que se diz e o que fica de fora.' },
  { id: 'cortar-30', title: 'Cortar 30% preservando a força', prompt: 'Escolha um texto seu e corte cerca de 30% das palavras sem perder a força.' },
  { id: 'tres-encerramentos', title: 'Três encerramentos distintos', prompt: 'Escreva três finais diferentes para o mesmo texto.' },
  { id: 'alegria-sem-luz', title: 'Alegria sem imagens de luz', prompt: 'Escreva sobre alegria sem usar sol, luz, brilho ou claridade.' },
  { id: 'desejo-subtexto', title: 'Desejo e sensualidade com subtexto', prompt: 'Escreva sobre desejo deixando quase tudo no subtexto.' },
]

export const exerciseById = (id: string | undefined) => EXERCISES.find((e) => e.id === id)
