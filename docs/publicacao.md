# Alteração → GitHub → publicação

Repositório: https://github.com/engviniciusmores-web/v2mengenharia

Aplicação de testes privada: https://v2m-engenharia.engviniciusmores.chatgpt.site

## Trabalho diário

```sh
git switch -c melhoria/descricao
pnpm install --frozen-lockfile
pnpm dev
pnpm run check
git add app public db drizzle docs package.json pnpm-lock.yaml
git commit -m "Descrever a alteração"
git push -u origin melhoria/descricao
```

Abra um pull request e confira a ação `Validar V2M`. Após incorporar a alteração à `main`, publique essa revisão no Sites. O GitHub verifica e gera o pacote automaticamente; **o deploy no Sites é uma etapa assistida pelo Codex**, não um deploy automático a cada push.

## Publicar pelo Codex com o plugin Sites

Solicitação reutilizável:

> Publique a revisão atual de main de engviniciusmores-web/v2mengenharia no site V2M ENGENHARIA, appgprj_6ac52a8f4fc08191b5c12131b31a5692. Preserve acesso privado, identidade, DB e FILES. Sincronize a origem do Sites, execute as verificações pendentes, envie o código e publique o pacote correspondente ao commit. Informe o SHA do GitHub, o SHA da origem Sites, a versão e o resultado da publicação.

O Codex deve abrir a origem Sites antes de editar e reconciliar diferenças com GitHub. A origem gerenciada do Sites e o GitHub são dois repositórios; seus SHAs podem diferir. O conteúdo publicado deve corresponder à revisão aprovada, sem substituir cegamente mudanças remotas.

O fluxo oficial do plugin obtém credencial temporária, abre/sincroniza o checkout com `site-workflow.mjs`, executa os comandos de validação/build, envia o código à origem Sites e empacota `dist`. Depois chama `save_version_and_deploy_private` e verifica o resultado. Credenciais temporárias ficam apenas em memória/stdin. Nunca colocar tokens no código, nos comandos, no README ou no GitHub.

O Sites provisiona os recursos reais do D1/R2; o manifest usa nomes lógicos. Não executar `wrangler deploy` contra uma conta aleatória: isso não reproduz o acesso privado nem a infraestrutura deste site. Uma futura mudança de hospedagem exigirá provisionar banco, bucket e autenticação equivalentes.

## Reversão

Para código, use `git revert <commit>` em uma branch e valide novamente. Para a publicação, republique uma versão salva anterior pelo Sites. Reverter código não reverte dados ou migrações; antes de alterações destrutivas de esquema, defina cópia de segurança e recuperação separadamente.

## Acesso

O repositório atualmente é público; somente código e base vazia são enviados. A aplicação continua privada e não tem visitantes externos configurados. Convites para testadores e mudança de público são decisões separadas. Arquivos de obras, credenciais e dados de runtime não entram no histórico Git.
