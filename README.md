# Criar filtros da ALT

Página para criar filtros `.flt` para as câmeras ALT 1.0 e 2.1. Tudo roda no navegador: a prévia faz a mesma conta da
câmera (a matriz de cor e as 8 retas de cada curva) na sua foto ou em 5 fotos de teste, e o filtro sai como um arquivo
`.flt`. A foto escolhida não sai do computador.

Para abrir: `index.html` escolhe a câmera; `criar.html` é a 2.1 e `criar.html?camera=1.0` é a 1.0.

O `.flt` não entra na câmera sozinho: ele vai para uma posição da roda pelo Montar o sistema, no programa ALT.

Estes arquivos são gerados. Não edite aqui: a fonte fica no projeto CAMERA_X10 (`editor_x10`), e a pasta é refeita
com `node _scripts/montar_site_criador.js`.

## Créditos

Fotos de teste (Wikimedia Commons):

- Retrato: Brooke Cagle, CC0 — https://commons.wikimedia.org/wiki/File:Laughing_woman_in_jean_jacket_(Unsplash).jpg
- Rua: Mike Petrucci, CC0 — https://commons.wikimedia.org/wiki/File:People_crossing_street_(Unsplash).jpg
- Céu e verde: Jace Grandinetti, CC0 — https://commons.wikimedia.org/wiki/File:Green_wedge_(Unsplash).jpg
- Cores fortes: ja ma, CC0 — https://commons.wikimedia.org/wiki/File:Green_shop_(Unsplash).jpg
- Noite: Kevin Lee, CC0 — https://commons.wikimedia.org/wiki/File:Date_night_(Unsplash).jpg

Fonte: Atkinson Hyperlegible Next, © The Atkinson Hyperlegible Next Project Authors, pela SIL Open Font License 1.1
(`fontes/OFL.txt`).
