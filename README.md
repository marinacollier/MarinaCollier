# MARINA OS

> em constante movimento: corpo, mente e vida.

Meu sistema operacional pessoal: rotina, treinos, alimentação, dinheiro, trabalho, estudos,
livros, viagens, conteúdo, Luna e tudo que ocupa espaço mental — num app só, pensado para o iPhone.

**Regra de produto:** abrir o MARINA OS deve deixar a vida mais simples, não mais burocrática.

## Rodar

```bash
npm install
npm run dev          # http://localhost:5173
```

Qualidade:

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm test             # Vitest
npm run build        # build de produção + service worker (PWA)
npm run check        # tudo acima
```

## Instalar no iPhone (PWA)

1. Publique o build (`npm run build` → pasta `dist/`) em qualquer host HTTPS estático
   (Vercel, Netlify, Cloudflare Pages; configure fallback de rotas para `index.html`).
2. No iPhone, abra a URL no **Safari**.
3. Toque em **Compartilhar** → **Adicionar à Tela de Início** → **Adicionar**.
4. Abra pelo ícone: o app roda em tela cheia, funciona offline e guarda os dados no aparelho.

Para testar na rede local: `npm run build && npx vite preview --host` e abra o IP do computador
no Safari (a instalação completa como PWA com service worker exige HTTPS).

## Onde ficam os dados

Local-first: tudo fica no **IndexedDB do próprio aparelho** (banco `marina-os`, chave `db`).
Não há servidor obrigatório. Faça backup em **Mais → Meus dados → Exportar backup (JSON)** e
restaure pelo mesmo lugar. A camada de persistência (`src/data/storage.ts`) é um adapter, pronta
para ganhar sincronização (Supabase) sem mudar as telas.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — contratos, pastas, regras de dados e de UI
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — calendários, Outlook/Teams, Organizze, Toki, segurança e sync
