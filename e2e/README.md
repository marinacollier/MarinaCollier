# E2E no navegador (iPhone 13, Chromium)

Pré-requisito: `npm run build && npx vite preview --port 4310 --strictPort`.

- `node e2e/restart.mjs` — sessão 1 real (Lumos + toques), depois fecha o navegador por completo e
  compara o banco do aparelho (IndexedDB) em: reabrir, recarregar, nova aba e reinício offline do PWA.
- `node e2e/visual.mjs && node e2e/sheets.mjs` — capturas de todas as telas (claro/escuro, com dados e
  vazio), checagem de rolagem horizontal e erros de página; folhas de contato em `e2e/`.

Não use relógio falso do Playwright nas capturas: ele congela as animações de entrada.
