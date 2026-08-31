# Câmeras Rolante

Página de visualização das câmeras de monitoramento de rios de Rolante/RS.

O projeto apenas exibe as imagens; os links das câmeras são obtidos a partir do portal
[alerta.rolante.ifrs.edu.br](https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios),
e os streams são carregados direto das páginas das câmeras em `rolante.solutti.net`.

## Deploy

Publicado via GitHub Pages:
https://filipesfbr.github.io/cameras-rolante/

## Como usar

Abra o `index.html` em um navegador. As câmeras carregam automaticamente em HLS;
clique em um vídeo para ampliar e no botão de recarregar para reiniciar um stream.

## Tech

- HTML/CSS/JS puro (sem build)
- [hls.js](https://github.com/video-dev/hls.js) para reprodução de HLS no navegador