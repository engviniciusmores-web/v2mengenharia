# Arquitetura mínima

O V2M é uma aplicação React 19 e TypeScript, com rotas no padrão App Router, compilada por Vinext/Vite para um Cloudflare Worker. Não é uma exportação estática: as APIs precisam de execução no servidor, D1 e R2. GitHub Pages ou uma hospedagem apenas de HTML não preservariam suas funcionalidades.

```text
Navegador → páginas React e visualizador IFC
         → /api/* → Worker → DB (D1) / FILES (R2)
GitHub → verificações e build → publicação pelo Sites → aplicação privada
```

## Organização preservada

- `app/`: telas, estilos e APIs de planejamento, orçamento, compras, custos, qualidade e diário.
- `public/bim-viewer/`: geometria Three.js/web-ifc, metadados IFC e gerador de sequência.
- `public/data/` e os JSONs em `app/compras/`: base inicial vazia.
- `db/`: acesso ao banco e esquemas; `drizzle/`: migrações versionadas.
- `worker/`: entrada do servidor; `build/`: empacotamento dos metadados do Sites.
- `.openai/hosting.json`: identidade do site e nomes lógicos `DB` e `FILES`.
- `tests/`: testes existentes de sequência e de ausência de dados privados no pacote.
- `.github/workflows/`: validação de commits e artefato de build.
- `docs/`: operação, publicação e roteiro de testes.

O arquivo IFC aberto é processado no navegador. O cronograma, os vínculos e os metadados salvos podem ir ao R2; medições, registros de compras, custos, qualidade e diário ficam no D1. Fotos e anexos ficam no R2. Não confundir o processamento local do IFC com armazenamento exclusivamente local de todos os dados.

O isolamento atual é por instalação do site, com base de dados compartilhada entre os usuários dessa instalação. Ainda não há isolamento por empresa/obra de uma plataforma SaaS. O controle de acesso atual depende da camada privada do Sites; não abrir o Worker diretamente ao público sem implementar autenticação e autorização nas APIs.

O visualizador mantém dependências versionadas no CDN `unpkg.com`; precisa de conexão para carregá-las. Esta base usa Vinext beta. Antes de uma abertura comercial, avaliar compatibilidade, migrações, cópias de segurança, recuperação de dados e autorização por usuário/obra. Nenhuma monetização foi adicionada.
