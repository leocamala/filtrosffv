// A foto de teste de quem usa o editor, dividida entre o Criar filtros e o Montar o sistema. Fica guardada so neste
// navegador (IndexedDB "x10-criador", reduzida a 1440 px em JPEG). Quando uma pagina troca a foto, grava um aviso no
// localStorage e as outras paginas abertas (outra aba, ou outro quadro do programa portatil) mostram a nova na hora.
// Se o navegador nao deixar guardar, tudo segue funcionando, so sem lembrar a foto.
(function () {
  "use strict";
  const BANCO = "x10-criador", AVISO = "x10-foto";

  function banco(op, valor) {
    return new Promise((ok) => {
      try {
        const req = indexedDB.open(BANCO, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("fotos");
        req.onerror = () => ok(null);
        req.onsuccess = () => {
          try {
            const st = req.result.transaction("fotos", op === "ler" ? "readonly" : "readwrite").objectStore("fotos");
            const r = op === "ler" ? st.get("ultima") : st.put(valor, "ultima");
            r.onsuccess = () => ok(r.result ?? null); r.onerror = () => ok(null);
          } catch (e) { ok(null); }
        };
      } catch (e) { ok(null); }
    });
  }

  // abre um arquivo de imagem; rejeita com uma frase pronta para mostrar
  function abrir(arq) {
    return new Promise((ok, falha) => {
      if (!arq) return falha(new Error("nenhum arquivo"));
      if (arq.type && !arq.type.startsWith("image/")) return falha(new Error(`${arq.name} não é uma foto.`));
      const url = URL.createObjectURL(arq);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(url); falha(new Error(`Não consegui abrir ${arq.name}. Use uma foto JPG, PNG ou WebP.`)); };
      im.src = url;
    });
  }

  async function guardar(im) {
    const escala = Math.min(1, 1440 / Math.max(im.width, im.height));
    const c = document.createElement("canvas"); c.width = Math.round(im.width * escala); c.height = Math.round(im.height * escala);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    await banco("gravar", c.toDataURL("image/jpeg", 0.9));
    try { localStorage.setItem(AVISO, String(Date.now())); } catch (e) { /* sem aviso as outras paginas so veem na proxima vez */ }
  }

  // a foto guardada, ja como imagem, ou null
  async function ler() {
    const url = await banco("ler");
    if (!url) return null;
    return new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = url; });
  }

  function aoTrocar(f) { window.addEventListener("storage", (ev) => { if (ev.key === AVISO) f(); }); }

  window.FotoGuardada = { abrir, guardar, ler, aoTrocar };
})();
