# V2M ENGENHARIA

Base independente para gestão integrada de obras, derivada dos módulos OMNIA.

Módulos: planejamento/EAP/Gantt, BIM 4D/5D, quantitativos/orçamento, compras, custos/Curva S, qualidade e diário de obra.

A publicação inicia sem dados de cliente, cronograma, orçamento ou modelo IFC. Cada instalação tem banco e armazenamento próprios. O IFC aberto pelo usuário é processado localmente; o modelo fica no navegador durante a sessão e não é enviado ao servidor.

Importe cronogramas XML MSPDI (exportados do MS Project) ou pacote JSON schema_version 1. Importe orçamento XLSX/XLS/CSV com as colunas Código, Descrição, Unidade, Quantidade e Preço unitário na primeira aba. Conferir datas, GUIDs/WBS, pesos, custos e revisão antes de utilizar indicadores oficiais. Simulação por vínculo no IFC ou pacote JSON; carregar geometria não cria automaticamente vínculos 4D/5D.

Validação: pnpm build, TypeScript sem emissão e teste da base limpa; testes de importação realizados na prévia local.

## Sequência executiva do IFC

A abertura do modelo lê os produtos com geometria, os GUIDs e a contenção em IfcBuildingStorey, incluindo agregações. O gerador sugere fundações e ciclos de pilares, vigas, lajes e liberação por pavimento. Nomes são fallback marcado como premissa; pavimentos e funções não reconhecidos ficam em revisão. As durações padrão são premissas por pacote, não produtividades calculadas. O calendário pode usar dias corridos ou segunda a sexta sem feriados. Datas são editáveis, com propagação opcional às sucessoras e verificação do vínculo término–início. Salvar mantém metadados e datas, sem armazenar o arquivo IFC. Identificadores de atividade incluem a assinatura do modelo para evitar mistura de medições entre modelos.

Validação do gerador: node --test tests/sequence.test.mjs. QA em IFC sintético de fundações, subsolo, térreo e pavimento superior, incluindo edição, persistência e 4D.

## Leitura das informações IFC

A classe nativa é resolvida com IfcAPI.GetNameFromTypeCode. O leitor percorre produtos uma vez por ExpressID, mantém classes, Name/Tag/ObjectType/Description, propriedades de ocorrência e tipo com nomes qualificados, materiais, classificações, unidades e pavimentos. TQS_Padrao.Tipo/Planta/Titulo/Piso e códigos P/PJ, V e L complementam a classificação. Campos Tipo de conjuntos diferentes não são colapsados. Aberturas são preservadas na extração e separadas do escopo produtivo; rampas são reconhecidas. Convenções de projeto são distintas dos princípios de gestão da informação ISO 19650. Nenhum modelo privado ou fixture de cliente integra a publicação.

## Reprodução 4D

O endereço do iframe permanece estável quando a data muda. Datas são sincronizadas por mensagens, com o mesmo modelo e metadados em memória. PLAY usa relógio requestAnimationFrame, data interpolada e intervalo de atualização de 80 ms; a duração total é configurável. O render é solicitado por mudança visual ou câmera. Sombras dinâmicas foram removidas e a resolução de tela limitada a 1,5x. Materiais por tipo/estado são criados uma vez. Elementos futuros ficam ocultos por padrão, com opção de visualização. Tipos usam areia para fundações, verde escuro para pilares, verde médio para vigas e verde claro para lajes. O modo de avanço planejado/real continua disponível.

## Rodar localmente

Requer Node.js 22.13 ou superior e pnpm 11.25.0. Não precisa de Python nem de converter IFC no computador.

```sh
git clone https://github.com/engviniciusmores-web/v2mengenharia.git
cd v2mengenharia
pnpm install --frozen-lockfile
pnpm dev
```

Abra o endereço exibido pelo servidor. O ambiente local emula D1/R2 e guarda seu estado em `.wrangler/`; não acessa os dados da hospedagem. As APIs inicializam as tabelas operacionais necessárias. Para gerar novas migrações do esquema, use `pnpm db:generate` e revise o SQL antes da publicação.

```sh
pnpm run typecheck
pnpm run test:unit
pnpm test
# ou todas as verificações:
pnpm run check
```

`pnpm test` compila a aplicação e verifica a base vazia. `pnpm start` serve a compilação local, após `pnpm build`. D1/R2 são necessários para preservar o funcionamento das APIs.

## GitHub e hospedagem de testes

- Código: [engviniciusmores-web/v2mengenharia](https://github.com/engviniciusmores-web/v2mengenharia).
- Testes privados: [V2M ENGENHARIA](https://v2m-engenharia.engviniciusmores.chatgpt.site).
- [Arquitetura mínima](docs/arquitetura.md).
- [Publicar, iterar e reverter](docs/publicacao.md).
- [Roteiro de testes](docs/testes.md).

A ação do GitHub verifica e gera o build. A publicação no Sites é assistida pelo Codex e mantém o acesso privado. Não há deploy automático configurado entre GitHub e Sites. A estrutura de telas, estilos e funcionalidades existente foi preservada.

## Biblioteca de projetos e IFCs na nuvem

Abra **Projetos e modelos** (`/projetos`), crie um projeto e use **Enviar IFCs**. O arquivo original fica no R2 privado; o D1 guarda nome, tamanho, proprietário, estado e composições. Selecione de 1 a 20 IFCs, dê um nome à composição e clique em **Salvar e abrir juntos**. Uma composição salva pode ser reaberta após trocar de sessão ou dispositivo. Não há limite de 20 arquivos na biblioteca inteira; o limite se aplica a cada composição.

Limites iniciais: 100 MB decimais por arquivo; 20 IFCs por composição; 5 milhões de triângulos na prévia federada. A complexidade real pode atingir a memória do navegador antes desses limites. Arquivos com falha de processamento são identificados; não são substituídos por geometria genérica. O leitor é carregado pelo CDN versionado e requer conexão.

A federação mantém classe IFC, ExpressID, GlobalId e arquivo de origem. A identidade é composta por arquivo + ExpressID, evitando colisões entre disciplinas. As coordenadas usam uma única translação comum para reduzir perda de precisão, sem centralizar cada disciplina separadamente. Não há transformação automática entre sistemas de coordenadas diferentes nem detecção de interferências nesta versão.

**Envio à nuvem é explícito.** Os visualizadores locais existentes continuam processando IFCs no navegador; apenas a ação **Enviar IFCs** armazena o arquivo no servidor. Nenhum IFC ou documento de cliente vai para o GitHub ou para o pacote de publicação. As APIs da biblioteca exigem identidade de usuário e restringem cada projeto ao seu proprietário. O controle externo de acesso do site continua privado.

Para uma instalação local nova, aplique as migrações antes de abrir o servidor:

```sh
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

O comando de migração usa somente o banco local. Em um checkout antigo cujo banco já tenha tabelas criadas em runtime, reconcilie o histórico de migrações antes de aplicá-lo; não apague dados sem cópia de segurança. Na hospedagem, o Sites aplica a migração aditiva `0006_dry_lightspeed.sql`.

A biblioteca é organizada por projeto. Os módulos anteriores de orçamento, planejamento, compras, qualidade e diário mantêm seu escopo existente por instalação; criar um projeto na biblioteca não altera esses dados nem implementa isolamento multiempresa para todos os módulos.

Validação: testes de federação, upload/download e persistência em D1/R2 local, bloqueio de 21 arquivos e acesso entre proprietários; abertura real de conjuntos sintéticos no navegador. Veja também [arquitetura](docs/arquitetura.md).

## Federação no Planejamento e no Gantt

Na biblioteca, abra uma composição salva e clique em **Usar no Planejamento**. Ela passa a aparecer na Visão geral e em Planejamento, com todos os IFCs na mesma cena. Também é possível selecionar outra composição pelo campo **Base do modelo** no Planejamento.

A leitura de classes, propriedades e pavimentos de todos os arquivos permite gerar uma proposta de cronograma para o conjunto. Os vínculos guardam arquivo de origem, ExpressID e GlobalId; identificadores iguais em arquivos distintos não se confundem. Atividades mantêm o arquivo de origem no nome. A proposta segue a ordenação e as durações preliminares do gerador existente, sem inferir frentes paralelas ou aprovar produtividade. Elementos sem geometria suportada, função ou pavimento ficam para revisão.

Cada composição tem seu pacote de cronograma no R2 e suas medições no D1, protegidos pelo proprietário. Salvar uma composição não substitui o cronograma de outra nem o antigo cronograma local da instalação. Datas editadas e a data de status permanecem no pacote salvo. Ao mudar a data, a cena e o Gantt se atualizam sem baixar ou reconstruir os IFCs. Clique em uma atividade para destacar seus elementos; clique em um elemento para consultar a atividade/WBS.

A Visão geral reabre a composição ativa e fornece acesso direto ao seu Gantt. Para voltar ao modo anterior, selecione **IFC local · cronograma da instalação** no Planejamento. Salve o rascunho antes de trocar de composição. As tabelas e os dados de orçamento, compras, custos, qualidade e diário não foram migrados para escopos por composição nesta alteração.
