# Roteiro de testes

Use um IFC sintético ou autorizado e dados fictícios. Não trate uma sequência sugerida como planejamento aprovado: durações, produtividade, vínculos, pesos e custos exigem revisão.

1. Abra as telas Início, Planejamento, Compras, Qualidade e Diário; confira a marca V2M e a navegação.
2. Abra um IFC no Planejamento, confira classes, pavimentos, propriedades e GlobalIds. Revise elementos pendentes.
3. Gere a sequência, edite uma data, confira sucessoras e salve. Recarregue e confirme a persistência.
4. Reproduza o 4D e altere a data; o modelo deve permanecer carregado. Confira o modo de elementos futuros.
5. Importe orçamento e cronograma de teste. Confira unidades, quantidades, custos e origem antes de usar indicadores.
6. Registre uma medição, pedido, inspeção e diário de teste; salve e recarregue. Confira os anexos de teste.
7. Faça o mesmo em uma tela estreita. Registre módulo, passos, resultado esperado, resultado obtido e versão.

Automação existente: seis testes do gerador, TypeScript, compilação e teste de base vazia. Esses testes não equivalem a uma validação completa das operações no navegador, nem comprovam conformidade contratual ou isolamento multiempresa.
