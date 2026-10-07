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

## Biblioteca de modelos

- `/projetos`: projetos, uploads explícitos, seleção e composições salvas.
- `/api/models/*`: criação, metadados, envio/download por streaming e manifests.
- `model_projects`, `model_files`, `model_federations`, `model_federation_items`: migração aditiva, sem alterar tabelas anteriores.
- R2: conteúdo original em chaves geradas no servidor; D1: índices, estado e proprietário. O acesso é verificado no servidor em cada operação.
- `public/bim-viewer/federated.*`: cena Three.js com processamento sequencial, cores e visibilidade por arquivo, inspeção de identidade, limite de 20 arquivos e limite de geometria.

Uploads validados por tamanho e assinatura IFC STEP, com estados pending/uploading/ready/failed. Apenas ready pode ser baixado ou associado. O R2 recebe um stream de comprimento fixo; o servidor não carrega o IFC inteiro em memória. Um envio interrompido fica indisponível e pode ser reenviado como novo registro. Nesta etapa, a biblioteca não inclui versionamento automático, compartilhamento por equipe, exclusão de arquivos, clash detection ou vínculo 4D automático entre composições e cronogramas.

A federação conserva o posicionamento por uma origem única, conforme a opção de não recentralizar cada arquivo no [Web-IFC](https://github.com/ThatOpen/engine_web-ifc/blob/main/src/ts/web-ifc-api.ts). Os dados enviados pelo usuário ficam no armazenamento privado; o repositório GitHub continua contendo somente aplicação e esquemas.
