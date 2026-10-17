# Tranquilo Partner Hub

Protótipo responsivo da Central do Franqueado Tranquilo, com dados demonstrativos locais e sem integrações com sistemas reais.

## Executar

```bash
npm install
npm run dev
```

O servidor Vite usa a porta `3000`. Para validar o build de produção:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## Conteúdo

O dashboard encaminha à jornada principal de preparação de evento. As páginas de conhecimento, marketing, vendas e briefing usam dados fictícios fornecidos por um adaptador local. O progresso, a seleção do evento e os briefings persistem em `localStorage` no navegador atual. Esta versão oferece dois eventos e duas praças fictícios para demonstrar relações e isolamento por ID; não implementa conta, autenticação ou autorização real. A seção de oportunidades artísticas é somente um espaço de navegação preparado.

Leia [a documentação de arquitetura](docs/architecture.md) para componentes, mapa de telas, separação entre UI/dados/serviços e limitações; e [a auditoria de evolução](docs/evolution-audit.md) para a matriz de lacunas, plano incremental, divisão entre dois desenvolvedores e critérios de teste. [TODO.md](TODO.md) preserva os critérios entregues e as pendências deliberadas da próxima fase.

A biblioteca de marketing oferece um link geral do Canva e materiais da página pública do [Kit de Marca](https://tranquilomusica.com.br/kit-de-marca). Não acessa a conta do franqueado nem abre/cria designs Canva específicos.

## Publicação estática

O app usa `HashRouter` e `base: './'` no Vite para funcionar em qualquer hospedagem estática (por exemplo, GitHub Pages em subpasta), sem regras de reescrita no servidor. As rotas ficam no formato `/#/eventos/preparar`. Ao integrar com um servidor próprio, é possível voltar ao `BrowserRouter`.
