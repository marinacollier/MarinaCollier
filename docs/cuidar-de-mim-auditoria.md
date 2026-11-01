# Cuidar de Mim — Etapa 0: auditoria de privacidade (01/11/2026)

Objetivo: decidir o que pode ser lançado sem prometer proteção que o app não oferece.

## Onde os dados vivem hoje

| Camada | O que guarda | Proteção real |
|---|---|---|
| Aparelho (IndexedDB) | Todo o banco local | Nenhuma criptografia no app. A proteção é a do iPhone (bloqueio do aparelho). O app do Claude no iOS apaga esse armazenamento com frequência. |
| Banco do artifact (coleção `rec`) | Cópia de todas as coleções, inclusive as privadas do Ateliê (padrão ligado, `profile.privateWritingCloud`) | Regras de acesso: leitura e escrita só da dona. Os dados ficam legíveis no servidor (sem criptografia de ponta a ponta) e o Claude consegue ler pelo ArtifactData quando ela pede. |
| Supabase (opcional) | Coleções não privadas | `PRIVATE_COLLECTIONS` nunca vai para lá. |
| Backup (arquivo) | Inclui as coleções privadas | O arquivo fica em texto aberto, nas mãos dela. |
| LockGate (código PBKDF2 / Face ID WebAuthn) | Esconde a interface | É uma trava de tela, não criptografia. Os dados continuam legíveis no armazenamento. |
| Lumos | Respostas determinísticas, sem IA externa | Nada sai do app. |

## Conclusão

- **Kit de técnicas, mensagens de pausa e plano de apoio** podem ser lançados. São conteúdos de referência e preferências (favoritas, rascunhos que ela copia), não registro íntimo. Ficam fora da Home, exceto uma entrada discreta, e fora das exportações genéricas.
- **O diário íntimo e a preparação para terapia NÃO podem ser lançados ainda.** Hoje o texto ficaria legível no servidor e no backup; anunciar "privado" seria promessa falsa.

## Opções para liberar o diário (decisão da Marina)

1. **Criptografia no aparelho com frase-senha** (AES-GCM com chave derivada por PBKDF2/Web Crypto). A nuvem guarda só texto cifrado. Se ela esquecer a frase, o conteúdo é irrecuperável. Ela já recusou senha para o app; esta seria só para o diário.
2. **Diário só no aparelho, sem nuvem**, com exportação manual. O iOS pode apagar tudo, então há risco real de perda.
3. **Nuvem como está (owner-only) com aviso explícito**: "protegido por acesso de dona, não criptografado". Lançar só se ela aceitar por escrito.

Recomendação: opção 1, com aviso claro de que não há recuperação.

## Regras que valem para todo o módulo

- Logs técnicos nunca carregam texto do usuário.
- Sem IA externa sem consentimento explícito por uso.
- Nada aparece na Home sem autorização.
- Nenhuma mensagem é enviada automaticamente: só copiar ou abrir o app de destino.
- Nenhum rótulo diagnóstico, nenhuma pontuação, nenhuma obrigação diária.
