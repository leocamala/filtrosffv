// Salvar um arquivo (firmware ou .flt) sempre perguntando onde, com a janela "Salvar como" do Windows (pedido de
// 23/10/2026). Usado pelos botoes Baixar e Exportar das paginas.
// - No programa ALT: a ponte (programa_x10/fonte/programa.js) abre a janela do Windows, confere o nome da camera, nao
//   grava por cima de um original, grava num arquivo temporario, le de volta e so entao poe o nome escolhido. Ela
//   devolve o resultado, e cada pagina o mostra no seu proprio aviso.
// - Num navegador com a janela de salvar (Chrome, Edge): showSaveFilePicker, com as mesmas regras (revisao de
//   26/10/2026). Antes, um erro de gravacao virava "Baixado... Conferido" e o firmware ia para Downloads, enquanto o
//   arquivo escolhido ficava vazio no cartao (um X10*.BIN de 0 bytes apaga o chip, ver analise_alt21/ACHADOS.md).
// - Sem ela (Firefox, Safari): o download comum do navegador, que pergunta so se ele estiver configurado assim.
"use strict";
(function () {
  const noPrograma = () => { try { return window.parent !== window && !!window.parent.programa; } catch (e) { return false; } };

  // De qual camera e um firmware, pelo conteudo (o mesmo teste do X10.cameraDoFirmware do nucleo.js), e os originais de
  // fabrica (os mesmos SHA do nucleo.js e do nucleo10.js): repetidos aqui porque o salvar.js nao depende do nucleo
  const PREFIXO = { "2.1": "X10", "1.0": "T501" };
  const TAMANHOS = [1345024, 1282304];
  const ORIGINAIS = { a773afc026b5509bd869daeaa11cfbda3c235f67f74a9a32aaa752359512809d: "o firmware original da 2.1",
    "6d083d6dd7867c218ca5016a590c625623759f0526d3242255b638e3d8c2f3a6": "o firmware original da 1.0" };
  function cameraDoFirmware(buf) {
    const tem = (o, s) => [...s].every((c, i) => buf[o + i] === c.charCodeAt(0));
    if (buf.length === 1345024 && tem(0x78960, "X10\0")) return "2.1";
    if (buf.length === 1282304 && tem(0x79860, "T501\0")) return "1.0";
    return null;
  }
  async function sha256(buf) {
    try {
      const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
      return [...h].map((v) => v.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return window.X10 && window.X10.sha256Puro ? window.X10.sha256Puro(buf) : null;
    }
  }
  // o arquivo que ja esta la e um original de fabrica? Sem conseguir conferir, um arquivo do tamanho de um original conta
  // como original: nao gravar por cima e o lado seguro
  async function qualOriginal(buf) {
    if (!TAMANHOS.includes(buf.length)) return null;
    const h = await sha256(buf);
    return h === null ? "talvez um firmware original (não deu para conferir)" : ORIGINAIS[h] || null;
  }
  const iguais = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const bytesDe = async (arquivo) => new Uint8Array(await arquivo.arrayBuffer());
  const motivo = (e) => (e && (e.message || e.name)) || String(e);

  // O nome que a pessoa escolheu para um firmware: a 2.1 so le X10*.BIN e a 1.0 so T501*.BIN. Com o comeco da outra,
  // a outra camera tentaria gravar um sistema que nao e dela. Devolve o aviso, ou "" se o nome serve.
  function avisoDoNome(nome, camera) {
    const outra = camera === "1.0" ? "2.1" : "1.0", n = String(nome).toUpperCase();
    if (n.startsWith(PREFIXO[outra]))
      return `Atenção: com o nome começando com ${PREFIXO[outra]}, a câmera ${outra} tentaria gravar este firmware da ${camera}. Renomeie o arquivo para começar com ${PREFIXO[camera]}.`;
    if (!n.startsWith(PREFIXO[camera]) || !n.endsWith(".BIN"))
      return `Atenção: a câmera só lê o arquivo se o nome começar com ${PREFIXO[camera]} e terminar em .bin.`;
    return "";
  }

  // Um arquivo que a janela criou vazio (nome novo) e que nao vai ser gravado: sai do cartao. Um X10*.BIN ou T501*.BIN
  // vazio apaga o chip da camera que o ler. Devolve o que dizer.
  async function tirarVazio(arquivo) {
    try {
      const f = await arquivo.getFile();
      if (f.size !== 0) return "";
    } catch (e) { return ""; }
    try {
      if (typeof arquivo.remove === "function") { await arquivo.remove(); return ` O arquivo vazio que a janela criou (${arquivo.name}) foi apagado.`; }
    } catch (e) { /* segue para o aviso */ }
    return ` Ficou um arquivo vazio chamado ${arquivo.name} onde você escolheu: apague-o antes de pôr o cartão numa câmera (um firmware vazio apaga a câmera).`;
  }

  // devolve { como, nome, texto, tipo }:
  // - como: "salvo" (gravado e conferido), "baixado" (download comum, sem conferir), "cancelado", "recusado" (as regras
  //   nao deixaram), "erro" (a gravacao falhou) ou "ocupado" (ja ha uma janela de salvar aberta);
  // - texto: o que mostrar na pagina; tipo: "ok", "erro" ou "" (neutro)
  let ocupado = false;
  async function salvar(nome, blob) {
    if (ocupado) return { como: "ocupado", nome, texto: "Já há uma janela de salvar aberta: termine ou cancele aquela primeiro.", tipo: "erro" };
    ocupado = true;
    try {
      if (noPrograma()) return await window.parent.programa.salvar(nome, blob);
      if (typeof window.showSaveFilePicker === "function") {
        const r = await comJanela(nome, blob);
        if (r) return r;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { como: "baixado", nome, texto: `Baixado: ${nome}, na pasta de downloads do navegador (sem conferir).`, tipo: "ok" };
    } finally {
      ocupado = false;
    }
  }

  // a janela de salvar do navegador; null = a janela nao abriu (sem permissao, por exemplo): fica o download comum
  async function comJanela(nome, blob) {
    const ext = (nome.match(/\.([A-Za-z0-9]+)$/) || [])[1];
    const tipo = ext === "flt" ? { description: "Filtro .flt", accept: { "text/plain": [".flt"] } }
      : ext ? { description: `Arquivo .${ext}`, accept: { "application/octet-stream": [`.${ext}`] } } : null;
    let arquivo;
    try {
      arquivo = await window.showSaveFilePicker({ suggestedName: nome, ...(tipo ? { types: [tipo] } : {}) });
    } catch (e) {
      if (e && e.name === "AbortError") return { como: "cancelado", nome, texto: "Nada foi salvo.", tipo: "" };
      return null;
    }
    const escolhido = arquivo.name, dados = await bytesDe(blob);
    // as regras, antes de escrever qualquer coisa: o nome da outra camera e um original de fabrica nunca
    const camera = cameraDoFirmware(dados), outra = camera === "1.0" ? "2.1" : camera === "2.1" ? "1.0" : null;
    if (outra && escolhido.toUpperCase().startsWith(PREFIXO[outra])) {
      const texto = `Não salvei: este firmware é da câmera ${camera}, e com o nome começando com ${PREFIXO[outra]} a câmera ${outra} o gravaria. Salve de novo com um nome começando com ${PREFIXO[camera]}.`;
      return { como: "recusado", nome: escolhido, texto: texto + (await tirarVazio(arquivo)), tipo: "erro" };
    }
    let antes = null;
    try { antes = await bytesDe(await arquivo.getFile()); } catch (e) { antes = null; }
    if (antes && antes.length && !iguais(antes, dados)) {
      const original = await qualOriginal(antes);
      if (original) return { como: "recusado", nome: escolhido, texto: `Não salvei: ${escolhido} já existe e é ${original}, de fábrica. Ele ficou intacto; salve de novo com outro nome.`, tipo: "erro" };
    }
    // grava (o navegador escreve num rascunho e so troca o arquivo no close) e le de volta
    try {
      const escrita = await arquivo.createWritable();
      await escrita.write(blob);
      await escrita.close();
    } catch (e) {
      let depois = null;
      try { depois = await bytesDe(await arquivo.getFile()); } catch (e2) { depois = null; }
      const intacto = antes && antes.length && depois && iguais(depois, antes);
      const texto = `Não salvei ${escolhido}: ${motivo(e)}. O cartão saiu, encheu ou está travado?`
        + (intacto ? " O arquivo que já estava lá ficou como estava."
          : depois && depois.length === 0 ? await tirarVazio(arquivo)
            : ` O arquivo ${escolhido} pode ter ficado incompleto: apague-o antes de pôr o cartão numa câmera.`);
      return { como: "erro", nome: escolhido, texto, tipo: "erro" };
    }
    let lido = null;
    try { lido = await bytesDe(await arquivo.getFile()); } catch (e) { lido = null; }
    if (!lido) return { como: "erro", nome: escolhido, texto: `Gravei ${escolhido}, mas não consegui ler de volta para conferir. Confira o arquivo antes de usar, ou salve de novo.`, tipo: "erro" };
    if (!iguais(lido, dados)) return { como: "erro", nome: escolhido, texto: `O arquivo ${escolhido} não ficou igual ao montado. Apague-o e salve de novo.`, tipo: "erro" };
    const aviso = camera ? avisoDoNome(escolhido, camera) : "";
    return { como: "salvo", nome: escolhido, texto: `Salvo e conferido: ${escolhido}.${aviso ? ` ${aviso}` : ""}`, tipo: aviso ? "erro" : "ok" };
  }

  window.SalvarArquivo = { salvar, avisoDoNome };
})();
