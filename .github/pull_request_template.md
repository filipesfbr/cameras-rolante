## O que muda

<!-- bullets, foco no porquê e não no "o quê" -->

## Como testar

- [ ] `npm ci && npm run typecheck && npm test && npm run build`

## Checklist

- [ ] Nenhum secret/credencial no diff
- [ ] Teste cobrindo a mudança (ou justificativa de por que não precisa)
- [ ] PR pra `main` (release): a versão em `develop` já é a que deve sair? Para
      minor/major, rode o `bump.yml` com `kind` antes de abrir
