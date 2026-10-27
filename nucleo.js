// Nucleo do editor do firmware X10 (ALT 2.1): le e grava os nomes da tela e os sons de ligar/desligar.
// So mexe em areas de dados conhecidas; nenhum byte de codigo. Funciona no navegador (window.X10) e no Node.
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.X10 = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SHA_ALT21 = "a773afc026b5509bd869daeaa11cfbda3c235f67f74a9a32aaa752359512809d";
  const NOME_BASE = 0x95376;        // 9 desenhos contiguos (ACHADOS.md)
  const NOME_LARGURA = 67;
  const NOME_ALTURA = 27;
  const NOME_PAGINAS = 4;
  const NOME_TAM = NOME_LARGURA * NOME_PAGINAS;   // 268
  const NOME_BASE_LINHA = 25;       // linha de baixo das letras nos nomes originais
  const NOMES = ["ALT500", "ALTBW2", "ALTBW", "ALT50", "ALT", "ALT800", "GALEANO", "GRAINO", "RETRO"];
  const RODA = { 1: 4, 2: 3, 3: 0, 4: 5, 5: 2, 6: 1, 7: 6, 8: 7 };   // posicao -> desenho (visto na camera)
  const FONTE = 0x948A3;            // fonte 6x8 da camera, do espaco (0x20) ao 'z' (os 4 seguintes ja sao a 8x16)
  const FONTE16 = 0x94ACA;          // fonte serifada 8x16 (ALTbyFFV)
  const SONS_EDITAVEIS = ["poweron.wav", "poweroff.wav"];
  // Cores (banco 5): matriz 3x3 x1024 em 0x3EACD + id*18 e curva de 8 segmentos (96 B) por filtro
  const ID_POR_POSICAO = { 1: 0x28, 2: 0x29, 3: 0x27, 4: 0x02, 5: 0x2c, 6: 0x2b, 7: 0x01, 8: 0x2a };
  const ID_SENSOR = 0x27;           // ALT500: a matriz e a do sensor de fabrica (referencia neutra)
  const MATRIZ_BASE = 0x3eacd;
  const CURVA_POR_ID = { 0x02: 0x3edf7, 0x27: 0x3ee57, 0x28: 0x3eeb7, 0x29: 0x3ef17, 0x01: 0x3ef77, 0x2a: 0x3efd7, 0x2b: 0x3f037, 0x2c: 0x3f097 };
  const LIMITE_MATRIZ = 4095;
  // Mensagem de ligar/desligar: MOV R3,#letra / MOV R7,#x. A 1a letra e comum as duas telas (rotina B9EC)
  const MSG_PRIMEIRA = { letra: 0x9acf3, x: 0x9acf7 };
  const MSG_LIGAR = Array.from({ length: 7 }, (_, i) => ({ letra: 0x9cd7b + 15 * i, x: 0x9cd7f + 15 * i }));
  const MSG_DESLIGAR = Array.from({ length: 7 }, (_, i) => ({ letra: 0x9cd0c + 15 * i, x: 0x9cd10 + 15 * i }));
  // Nome das fotos (banco em 0x6A600, CPU 0xD3F7): switch em XDATA 41DB (posicao da roda) e sprintf(formato, prefixo,
  // contador). O contador e um so para todos os filtros. ALT 2.1: "%3s%05u" com F10..F80 -> F1000123.JPG; o firmware
  // de fabrica grava DSCF0123.JPG. Cada caso carrega o prefixo com MOV R2,#45h; MOV R1,#lo; "DSCF" ja esta no arquivo.
  const FOTO_FORMATO = 0x6eb35;
  const FOTO_CASOS = [0x77a29, 0x77a3c, 0x77a4e, 0x77a60, 0x77a72, 0x77a84, 0x77a96, 0x77aa8];   // o byte lo de cada caso
  const FOTO_DSCF = 0x6eb5d;
  // Nitidez: o ajuste "Sharpness" do kit, byte +0x1E da tabela de ajustes padrao ($CfG, banco 9). A camera escala com
  // ele o realce de bordas e a reducao de ruido do ISP (analise_alt21/revisao_21-10/E_nitidez_flash.md). 0 forte, 1 normal,
  // 2 suave. O ALT 2.1 sempre apaga o chip inteiro ao atualizar, entao este padrao passa a valer depois de gravar.
  const CFG_PADRAO = 0x6451a;
  const NITIDEZ = CFG_PADRAO + 0x1e;
  const NIVEIS_NITIDEZ = ["forte", "normal", "suave"];
  // Reducao de ruido: filtro bilateral da pagina 0x32 (mesmo relatorio). 47 registros de 11 B, um por nivel de ganho;
  // o byte [9] escolhe a tabela de 16 pesos (29 tabelas) e o [10] o nucleo 9x9 (17 nucleos). "minima" = todos os niveis
  // na tabela 0 (15,1,0...) e no nucleo 0 (3x3), mais fraco que a camera usa em boa luz; "desligada" = isso e a tabela 0
  // so com o pixel do centro (15,0,0...); "maxima" = todos os niveis no mais forte que a camera usa no escuro (tabela 27 e
  // nucleo 7, 9x9). Nao mexe no bloco Bayer da pagina 0x31 (papel desconhecido).
  const RUIDO_REGISTROS = Array.from({ length: 47 }, (_, z) => 0x3db85 + 11 * z);
  const RUIDO_TABELA0 = 0x3d9b5;
  const NIVEIS_RUIDO = ["normal", "minima", "desligada", "maxima"];
  const GAMA = [0,64,169,298,446,610,788,978,1179,1390,1611,1842,2080,2327,2581,2843,3112,3388,3670,3974,4260,4545,4826,5105,5382,5657,5930,6200,6468,6734,6998,7260,7520,7778,8034,8289,8542,8793,9042,9289,9535,9780,10023,10264,10504,10743,10980,11216,11450,11683,11915,12145,12375,12601,12826,13047,13266,13483,13698,13910,14120,14328,14533,14737,14939,15138,15336,15532,15726,15918,16109,16298,16485,16671,16855,17037,17218,17397,17575,17752,17927,18101,18273,18444,18614,18782,18950,19116,19280,19444,19606,19767,19928,20087,20244,20401,20557,20712,20865,21018,21170,21320,21470,21619,21767,21914,22060,22205,22349,22493,22635,22777,22918,23058,23197,23335,23473,23610,23746,23881,24016,24150,24283,24415,24547,24678,24808,24938,25067,25195,25322,25449,25576,25701,25826,25951,26074,26198,26320,26442,26563,26684,26804,26924,27043,27162,27280,27397,27514,27630,27746,27861,27976,28090,28204,28317,28430,28542,28654,28765,28876,28987,29096,29206,29315,29423,29531,29639,29746,29853,29959,30065,30170,30275,30379,30484,30587,30691,30793,30896,30998,31100,31201,31302,31402,31502,31602,31702,31801,31899,31997,32095,32193,32290,32387,32483,32579,32675,32770,32865,32960,33055,33149,33242,33336,33429,33521,33614,33706,33798,33889,33980,34071,34162,34252,34342,34431,34521,34610,34698,34787,34875,34963,35050,35137,35224,35311,35397,35483,35569,35655,35740,35825,35910,35994,36078,36162,36246,36329,36413,36496,36578,36661,36743,36825,36906,36988,37069,37150,37230,37311,37391,37471,37550,37630,37709,37788,37867,37945,38023,38101,38179,38257,38334,38411,38488,38565,38641,38718,38794,38869,38945,39020,39096,39171,39245,39320,39394,39468,39542,39616,39689,39763,39836,39909,39981,40054,40126,40198,40270,40342,40413,40485,40556,40627,40698,40768,40838,40909,40979,41048,41118,41188,41257,41326,41395,41464,41532,41600,41669,41737,41804,41872,41940,42007,42074,42141,42208,42274,42341,42407,42473,42539,42605,42671,42736,42801,42866,42931,42996,43061,43125,43190,43254,43318,43382,43445,43509,43572,43636,43699,43761,43824,43887,43949,44012,44074,44136,44198,44259,44321,44382,44444,44505,44566,44626,44687,44748,44808,44868,44928,44988,45048,45108,45167,45227,45286,45345,45404,45463,45522,45580,45639,45697,45755,45813,45871,45929,45987,46044,46102,46159,46216,46273,46330,46386,46443,46500,46556,46612,46668,46724,46780,46836,46891,46947,47002,47057,47112,47167,47222,47277,47331,47386,47440,47494,47549,47603,47656,47710,47764,47817,47871,47924,47977,48030,48083,48136,48189,48241,48294,48346,48398,48451,48503,48554,48606,48658,48709,48761,48812,48864,48915,48966,49017,49067,49118,49169,49219,49269,49320,49370,49420,49470,49520,49569,49619,49669,49718,49767,49816,49866,49915,49963,50012,50061,50110,50158,50206,50255,50303,50351,50399,50447,50495,50542,50590,50637,50685,50732,50779,50826,50873,50920,50967,51013,51060,51107,51153,51199,51245,51292,51338,51384,51429,51475,51521,51566,51612,51657,51702,51748,51793,51838,51882,51927,51972,52017,52061,52106,52150,52194,52238,52282,52326,52370,52414,52458,52501,52545,52588,52632,52675,52718,52761,52804,52847,52890,52933,52976,53018,53061,53103,53145,53188,53230,53272,53314,53356,53397,53439,53481,53522,53564,53605,53647,53688,53729,53770,53811,53852,53893,53933,53974,54014,54055,54095,54136,54176,54216,54256,54296,54336,54376,54416,54455,54495,54534,54574,54613,54652,54692,54731,54770,54809,54848,54886,54925,54964,55002,55041,55079,55118,55156,55194,55232,55270,55308,55346,55384,55422,55459,55497,55534,55572,55609,55646,55683,55721,55758,55795,55832,55868,55905,55942,55978,56015,56051,56088,56124,56160,56196,56232,56269,56304,56340,56376,56412,56447,56483,56519,56554,56589,56625,56660,56695,56730,56765,56800,56835,56870,56904,56939,56974,57008,57043,57077,57111,57146,57180,57214,57248,57282,57316,57349,57383,57417,57451,57484,57518,57551,57584,57618,57651,57684,57717,57750,57783,57816,57848,57881,57914,57946,57979,58011,58044,58076,58108,58141,58173,58205,58237,58269,58300,58332,58364,58396,58427,58459,58490,58522,58553,58584,58615,58646,58677,58708,58739,58770,58801,58832,58862,58893,58924,58954,58984,59015,59045,59075,59105,59136,59166,59196,59225,59255,59285,59315,59344,59374,59403,59433,59462,59492,59521,59550,59579,59608,59637,59666,59695,59724,59753,59781,59810,59839,59867,59895,59924,59952,59980,60009,60037,60065,60093,60121,60149,60176,60204,60232,60259,60287,60314,60342,60369,60397,60424,60451,60478,60505,60532,60559,60586,60613,60640,60666,60693,60720,60746,60773,60799,60825,60852,60878,60904,60930,60956,60982,61008,61034,61059,61085,61111,61136,61162,61187,61213,61238,61264,61289,61314,61339,61364,61389,61414,61439,61464,61488,61513,61538,61562,61587,61611,61636,61660,61684,61708,61733,61757,61781,61805,61828,61852,61876,61900,61923,61947,61971,61994,62017,62041,62064,62087,62111,62134,62157,62180,62203,62225,62248,62271,62294,62316,62339,62361,62384,62406,62429,62451,62473,62495,62517,62539,62561,62583,62605,62627,62648,62670,62692,62713,62735,62756,62777,62799,62820,62841,62862,62883,62904,62925,62946,62967,62988,63008,63029,63049,63070,63090,63111,63131,63151,63171,63191,63212,63232,63251,63271,63291,63311,63331,63350,63370,63389,63409,63428,63447,63467,63486,63505,63524,63543,63562,63581,63599,63618,63637,63655,63674,63692,63711,63729,63748,63766,63784,63802,63820,63838,63856,63874,63891,63909,63927,63944,63962,63979,63997,64014,64031,64048,64065,64082,64099,64116,64133,64150,64167,64183,64200,64216,64233,64249,64265,64282,64298,64314,64330,64346,64362,64377,64393,64409,64424,64440,64455,64471,64486,64501,64516,64531,64546,64561,64576,64591,64606,64620,64635,64649,64664,64678,64692,64706,64721,64735,64748,64762,64776,64790,64803,64817,64830,64844,64857,64870,64884,64897,64910,64922,64935,64948,64961,64973,64986,64998,65010,65022,65035,65047,65059,65070,65082,65094,65105,65117,65128,65139,65151,65162,65173,65183,65194,65205,65215,65226,65236,65247,65257,65267,65277,65286,65296,65306,65315,65324,65334,65343,65352,65361,65369,65378,65386,65395,65403,65411,65419,65426,65434,65441,65448,65455,65462,65469,65475,65482,65488,65494,65499,65505,65510,65515,65519,65523,65527,65530,65533]   // gamma_table do site do fabricante (referencia_site);

  function lerNome(buf, k) {
    const ini = NOME_BASE + NOME_TAM * k;
    const bits = [];
    for (let y = 0; y < NOME_ALTURA; y++) {
      const linha = new Array(NOME_LARGURA);
      const p = y >> 3, r = y & 7;
      for (let x = 0; x < NOME_LARGURA; x++) linha[x] = (buf[ini + p * NOME_LARGURA + x] >> r) & 1;
      bits.push(linha);
    }
    return bits;
  }

  function gravarNome(buf, k, bits) {
    const ini = NOME_BASE + NOME_TAM * k;
    for (let p = 0; p < NOME_PAGINAS; p++) {
      for (let x = 0; x < NOME_LARGURA; x++) {
        const i = ini + p * NOME_LARGURA + x;
        let byte = buf[i];
        for (let r = 0; r < 8; r++) {
          const y = p * 8 + r;
          if (y >= NOME_ALTURA) break;           // linhas 27-31 ficam como estao
          byte = (byte & ~(1 << r)) | ((bits[y][x] ? 1 : 0) << r);
        }
        buf[i] = byte;
      }
    }
  }

  function fonteDaCamera(buf) {
    const glifos = {};
    for (let c = 0x20; c <= 0x7a; c++) glifos[String.fromCharCode(c)] = buf.slice(FONTE + 6 * (c - 0x20), FONTE + 6 * (c - 0x1f));
    let base = 0;                                // linha de baixo das maiusculas
    for (const ch of "AEHILT") for (const col of glifos[ch]) for (let r = 0; r < 8; r++) if ((col >> r) & 1) base = Math.max(base, r);
    return { largura: 6, altura: 8, glifos, base };
  }

  function textoParaBits(texto, fonte, escala) {
    const chars = [...texto].map((c) => (fonte.glifos[c] ? c : "?"));
    const largura = chars.length * fonte.largura * escala;
    const altura = fonte.altura * escala;
    const bits = Array.from({ length: altura }, () => new Array(largura).fill(0));
    chars.forEach((c, n) => {
      const g = fonte.glifos[c];
      for (let x = 0; x < fonte.largura; x++)
        for (let r = 0; r < fonte.altura; r++)
          if ((g[x] >> r) & 1)
            for (let dy = 0; dy < escala; dy++)
              for (let dx = 0; dx < escala; dx++) bits[r * escala + dy][(n * fonte.largura + x) * escala + dx] = 1;
    });
    const baseLinha = fonte.base * escala + (escala - 1);
    return { bits, largura, altura, baseLinha, cabe: largura <= NOME_LARGURA - 1 && altura <= NOME_ALTURA };
  }

  function montarNome(t, margem = 1) {
    const out = Array.from({ length: NOME_ALTURA }, () => new Array(NOME_LARGURA).fill(0));
    const topo = Math.max(0, Math.min(NOME_BASE_LINHA - t.baseLinha, NOME_ALTURA - t.altura));
    for (let y = 0; y < t.altura; y++)
      for (let x = 0; x < t.largura; x++) {
        const yy = topo + y, xx = margem + x;
        if (yy < NOME_ALTURA && xx < NOME_LARGURA && t.bits[y][x]) out[yy][xx] = 1;
      }
    return out;
  }

  // Fonte serifada 8x16 do firmware (a do ALTbyFFV): 16 bytes por caractere ASCII, 2 paginas de 8 colunas
  function glifo8x16(buf, ch, ini = FONTE16) {
    const o = ini + (ch.charCodeAt(0) - 0x20) * 16;
    const g = [];
    for (let y = 0; y < 16; y++) {
      const l = [];
      for (let x = 0; x < 8; x++) l.push((buf[o + (y >> 3) * 8 + x] >> (y & 7)) & 1);
      g.push(l);
    }
    return g;
  }

  // Fonte serifada dos nomes: as letras recortadas dos 9 nomes (identicas a fonte 8x16, com 1 coluna entre letras)
  // e, para o resto do ASCII, a propria fonte 8x16 recortada do mesmo jeito (linha 3 do glifo = linha 15 do nome)
  function glifosDa8x16(buf, ini) {
    const glifos = {};
    for (let c = 0x21; c <= 0x7e; c++) {
      const ch = String.fromCharCode(c);
      const g = glifo8x16(buf, ch, ini);
      const cols = [...Array(8).keys()].filter((x) => g.some((l) => l[x]));
      if (!cols.length) continue;
      const a = cols[0], b = cols[cols.length - 1];
      // o nome tem 27 linhas e a letra comeca na 12: so cabem 15 das 16 linhas da 8x16. A ultima linha do nome junta as
      // duas ultimas da letra, senao o "_" (que so tem a linha 15) some e o J, g, y... perdem o fundo (revisao de 22/10)
      glifos[ch] = Array.from({ length: NOME_ALTURA }, (_, y) => {
        const gy = y - 12;
        if (gy === 14) return g[14].map((v, x) => v | g[15][x]).slice(a, b + 1);
        return gy >= 0 && gy < 16 ? g[gy].slice(a, b + 1) : new Array(b - a + 1).fill(0);
      });
    }
    return glifos;
  }
  function fonteSerifa(buf) {
    const glifos = glifosDa8x16(buf, FONTE16);
    const vistos = new Set();
    NOMES.forEach((nome, k) => {
      const bits = lerNome(buf, k);
      const usada = Array.from({ length: NOME_LARGURA }, (_, x) => bits.some((l) => l[x]));
      const pedacos = [];
      for (let x = 0; x < NOME_LARGURA; x++) {
        if (usada[x] && (x === 0 || !usada[x - 1])) pedacos.push([x, x]);
        if (usada[x]) pedacos[pedacos.length - 1][1] = x;
      }
      if (pedacos.length !== nome.length) return;          // recorte ambiguo: ignora esse nome
      [...nome].forEach((ch, i) => {
        if (vistos.has(ch)) return;                        // a letra do nome substitui a da 8x16 (2, 5 e W diferem)
        vistos.add(ch);
        const [a, b] = pedacos[i];
        glifos[ch] = bits.map((l) => l.slice(a, b + 1));
      });
    });
    return { glifos, espacoEntreLetras: 1, larguraDoEspaco: 4 };
  }
  // A mesma fonte sem precisar dos 9 desenhos de nome da ALT 2.1: so 2, 5 e W dos nomes diferem da 8x16 (conferido no
  // teste), e vao aqui como estao nos nomes (linhas 15 a 25 do desenho). Serve para a 1.0, que tem a mesma 8x16 em
  // outro lugar: os nomes escritos nas duas cameras saem iguais.
  const LETRAS_DOS_NOMES = {
    2: ["011110", "100001", "100001", "100001", "000001", "000010", "000100", "001000", "010000", "100001", "111111"],
    5: ["111111", "100000", "100000", "100000", "111100", "100010", "000001", "000001", "100001", "100010", "011100"],
    W: ["1101011", "0101010", "0101010", "0101010", "0101010", "0101010", "0110110", "0010100", "0010100", "0010100", "0010100"],
  };
  function fonteSerifaFixa(buf, ini) {
    const glifos = glifosDa8x16(buf, ini);
    for (const [ch, linhas] of Object.entries(LETRAS_DOS_NOMES))
      glifos[ch] = Array.from({ length: NOME_ALTURA }, (_, y) => (y >= 15 && y < 26 ? [...linhas[y - 15]].map(Number) : new Array(linhas[0].length).fill(0)));
    return { glifos, espacoEntreLetras: 1, larguraDoEspaco: 4 };
  }

  function textoSerifa(texto, fonte, margem = 0) {
    const out = Array.from({ length: NOME_ALTURA }, () => new Array(NOME_LARGURA).fill(0));
    const faltando = [];
    let x = margem, largura = 0;
    [...texto].forEach((ch, i) => {
      if (i > 0) x += fonte.espacoEntreLetras;
      if (ch === " ") { x += fonte.larguraDoEspaco; return; }
      const g = fonte.glifos[ch];
      if (!g) { if (!faltando.includes(ch)) faltando.push(ch); return; }
      for (let y = 0; y < NOME_ALTURA; y++)
        for (let dx = 0; dx < g[y].length; dx++) if (g[y][dx] && x + dx < NOME_LARGURA) out[y][x + dx] = 1;
      x += g[0].length;
      largura = x;
    });
    return { bits: out, largura, faltando, cabe: largura <= NOME_LARGURA };
  }

  // O caminho de volta: le o texto de um nome desenhado por textoSerifa (a partir da coluna 0, 1 coluna entre as letras).
  // Tenta letra por letra (maiusculas e numeros primeiro) e so aceita se o texto redesenhado for identico. Devolve null
  // para desenho a mao ou de outra fonte: quem chama mostra o desenho como esta.
  function lerTextoDoNome(bits, fonte) {
    const prioridade = (ch) => (/[A-Z]/.test(ch) ? 0 : /[0-9]/.test(ch) ? 1 : /[a-z]/.test(ch) ? 3 : 2);
    const ordem = Object.entries(fonte.glifos).sort((p, q) => prioridade(p[0]) - prioridade(q[0]) || (p[0] < q[0] ? -1 : 1));
    const usada = Array.from({ length: NOME_LARGURA }, (_, x) => bits.some((l) => l[x]));
    const vazioDesde = (x) => usada.slice(Math.max(0, x)).every((u) => !u);
    const encaixa = (g, x) => {
      if (x + g[0].length > NOME_LARGURA) return false;
      for (let y = 0; y < NOME_ALTURA; y++) for (let dx = 0; dx < g[y].length; dx++) if ((g[y][dx] ? 1 : 0) !== (bits[y][x + dx] ? 1 : 0)) return false;
      return true;
    };
    function buscar(x, texto) {                                  // x = coluna logo depois da ultima letra
      if (vazioDesde(x)) return texto;
      if (texto.length >= 16) return null;
      const ini = texto.length ? x + fonte.espacoEntreLetras : x;
      for (const [ch, g] of ordem) {
        if (!encaixa(g, ini)) continue;
        const r = buscar(ini + g[0].length, texto + ch);
        if (r !== null) return r;
      }
      if (texto.length && !texto.endsWith(" ")) return buscar(ini + fonte.larguraDoEspaco, texto + " ");
      return null;
    }
    const texto = buscar(0, "");
    if (texto === null) return null;
    const volta = textoSerifa(texto, fonte).bits;
    return volta.every((l, y) => l.every((v, x) => v === (bits[y][x] ? 1 : 0))) ? texto : null;
  }

  // A leitura com folga, para os nomes de outras versoes: a mesma fonte, mas com as letras mais juntas (sem a coluna
  // entre elas, as vezes encostadas). Cada letra entra na primeira coluna que ainda tem tinta sem dona; ela so pode
  // pintar onde o desenho tem tinta, e no fim as letras juntas tem de cobrir o desenho inteiro. Tenta antes a letra que
  // cobre mais. Serve so para dar nome (o desenho continua o de la); null = nao parece texto nessa fonte.
  function lerTextoDoNomeSolto(bits, fonte) {
    const tinta = bits.map((l) => l.map((v) => (v ? 1 : 0)));
    const glifos = Object.entries(fonte.glifos).filter(([ch]) => /[A-Z0-9]/.test(ch)).map(([ch, g]) => {
      const pontos = [];
      g.forEach((l, y) => l.forEach((v, x) => { if (v) pontos.push([y, x]); }));
      return { ch, pontos, esq: Math.min(...pontos.map(([, x]) => x)) };
    }).filter((g) => g.pontos.length);
    const dono = tinta.map((l) => l.map(() => 0));       // quantas letras pintam cada ponto
    let passos = 0;
    function buscar(texto, fimAnterior) {
      if (++passos > 20000) return null;
      let col = -1;
      for (let x = 0; x < NOME_LARGURA && col < 0; x++) for (let y = 0; y < NOME_ALTURA; y++) if (tinta[y][x] && !dono[y][x]) { col = x; break; }
      if (col < 0) return texto.length ? texto : null;  // tudo coberto
      if (texto.length >= 12) return null;
      const espaco = texto.length && col - fimAnterior >= 4 ? " " : "";   // vao largo entre letras = espaco
      const candidatos = [];
      for (const g of glifos) {
        const x0 = col - g.esq;
        if (x0 < -1) continue;
        if (!g.pontos.every(([y, x]) => x0 + x >= 0 && x0 + x < NOME_LARGURA && tinta[y][x0 + x])) continue;
        const novos = g.pontos.filter(([y, x]) => !dono[y][x0 + x]).length;
        if (!g.pontos.some(([y, x]) => x0 + x === col && !dono[y][col])) continue;   // tem de pegar a coluna da vez
        candidatos.push({ g, x0, novos });
      }
      candidatos.sort((p, q) => q.novos - p.novos);
      for (const { g, x0 } of candidatos) {
        g.pontos.forEach(([y, x]) => { dono[y][x0 + x]++; });
        const r = buscar(texto + espaco + g.ch, Math.max(fimAnterior, x0 + Math.max(...g.pontos.map(([, x]) => x)) + 1));
        g.pontos.forEach(([y, x]) => { dono[y][x0 + x]--; });
        if (r !== null) return r;
      }
      return null;
    }
    return buscar("", 0);
  }

  // Nomes ja conhecidos de outras versoes, pela impressao do desenho (FNV-1a dos 67x27 pontos). A ALT V2 desenha os
  // nomes com uma variante da fonte (o U sem serifa, outros numeros), que nenhuma das leituras acima entende; os 8 nomes
  // dela vem da extracao de 20/10/2026 (filtros/FILTROS ORIGINAIS/ALT V2). Versao desconhecida: o desenho fica como esta.
  const NOMES_CONHECIDOS = { "1a7f94c4": "ALT800", "50c0ff59": "ALT400", "7ea60de7": "ALTFILM", "ce4392f5": "CHROME",
    "f8d7aaff": "NATURAL", "f71fbcdd": "ALT100", "bb46201b": "MONO", "b16afa2d": "PB100" };
  function impressaoDoDesenho(bits) {
    let h = 0x811c9dc5;
    for (const l of bits) for (const v of l) { h ^= v ? 1 : 0; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  const nomeConhecido = (bits) => NOMES_CONHECIDOS[impressaoDoDesenho(bits)] || null;

  // Regras de nome e mensagem num lugar so (as tres paginas e o montador): o que a camera nao desenharia fica bloqueado
  // com o motivo. As larguras bastam para medir um nome; o Criar filtros, que nao abre o firmware, usa as mesmas
  // larguras guardadas em fonte_nomes.js (gerado por _scripts/gerar_fonte_nomes.js).
  function metricaDosNomes(fonte) {
    return { larguras: Object.fromEntries(Object.entries(fonte.glifos).map(([ch, g]) => [ch, g[0].length])),
      espacoEntreLetras: fonte.espacoEntreLetras, larguraDoEspaco: fonte.larguraDoEspaco };
  }
  function medirNome(texto, metrica) {                          // a mesma conta de textoSerifa, so com as larguras
    let x = 0, largura = 0;
    const faltando = [];
    [...texto].forEach((ch, i) => {
      if (i > 0) x += metrica.espacoEntreLetras;
      if (ch === " ") { x += metrica.larguraDoEspaco; return; }
      const w = metrica.larguras[ch];
      if (w === undefined) { if (!faltando.includes(ch)) faltando.push(ch); return; }
      x += w;
      largura = x;
    });
    return { largura, faltando, cabe: largura <= NOME_LARGURA };
  }
  const listaDeLetras = (letras) => letras.map((ch) => `“${ch}”`).join(", ");
  function problemaDoNome(texto, metrica) {
    // so espacos deixa a tela vazia (vazio de verdade e outra coisa: o desenho de fabrica, que fica)
    if (String(texto).length && !String(texto).trim()) return "o nome só tem espaços: escreva pelo menos uma letra";
    const m = medirNome(texto, metrica);
    if (m.faltando.length) return `a câmera não tem desenho para ${listaDeLetras(m.faltando)} (use letras sem acento)`;
    if (!m.cabe) return `não cabe na tela (${m.largura} de ${NOME_LARGURA} pontos)`;
    return "";
  }
  function problemaDaMensagem(texto) {
    const t = String(texto).replace(/\s+$/, "");
    if (!t.trim().length) return "escreva pelo menos 1 caractere";
    if (t.length > 8) return "a mensagem tem no máximo 8 caracteres";
    const ruins = [...new Set([...t].filter((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) > 0x7e))];
    if (ruins.length) return `a câmera não tem desenho para ${listaDeLetras(ruins)} (use letras sem acento)`;
    return "";
  }

  function diretorio(buf) {
    const marca = [0x20, 0x4a, 0x4c, 0x32, 0x30, 0x30, 0x37, 0x42];   // " JL2007B"
    let base = -1;
    for (let i = 0; i < buf.length - 8 && base < 0; i++) if (marca.every((v, j) => buf[i + j] === v)) base = i;
    if (base < 0) throw new Error("diretorio de recursos nao encontrado");
    const n = buf[base + 12] | (buf[base + 13] << 8);
    const itens = {};
    for (let k = 1; k <= n; k++) {
      const e = base + 16 * k;
      const nome = String.fromCharCode(...buf.slice(e, e + 12)).trim();
      const bloco = buf[e + 12] | (buf[e + 13] << 8);
      const qtd = buf[e + 14] | (buf[e + 15] << 8);
      itens[nome] = { inicio: base + bloco * 512, tamanho: qtd * 512 };
    }
    return itens;
  }

  function espacoDoSom(buf, nome) {
    const s = diretorio(buf)[nome];
    if (!s) throw new Error("som nao encontrado: " + nome);
    return s;
  }

  function wavParaEspaco(canais, taxa, capacidade, alvo = 16000) {
    const n = canais[0].length;
    const mono = new Float32Array(n);
    for (const c of canais) for (let i = 0; i < n; i++) mono[i] += c[i] / canais.length;
    // o tocador da camera le a partir do byte 48 e arredonda o tamanho para multiplo de 8 (4 amostras)
    const maxAmostras = Math.floor((capacidade - 48) / 8) * 4;
    const total = Math.min(maxAmostras, Math.floor((n * alvo) / taxa / 4) * 4);
    const pcm = new Int16Array(total);
    const fade = Math.min(total, Math.round(alvo * 0.01));   // 10 ms no fim, sem estalo ao cortar
    for (let i = 0; i < total; i++) {
      const pos = (i * taxa) / alvo, i0 = Math.floor(pos), f = pos - i0;
      let v = mono[i0] * (1 - f) + (i0 + 1 < n ? mono[i0 + 1] : 0) * f;
      if (i >= total - fade) v *= (total - i) / fade;
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    }
    const out = new Uint8Array(capacidade);
    const dv = new DataView(out.buffer);
    const txt = (o, s) => [...s].forEach((ch, j) => (out[o + j] = ch.charCodeAt(0)));
    const dados = total * 2;
    txt(0, "RIFF"); dv.setUint32(4, 36 + dados, true); txt(8, "WAVE");
    txt(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, alvo, true); dv.setUint32(28, alvo * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    txt(36, "data"); dv.setUint32(40, dados, true);
    for (let i = 0; i < total; i++) dv.setInt16(44 + 2 * i, pcm[i], true);
    return out;
  }

  const i16 = (buf, o) => { const v = (buf[o] << 8) | buf[o + 1]; return v >= 0x8000 ? v - 0x10000 : v; };
  const p16 = (buf, o, v) => { const u = v & 0xffff; buf[o] = u >> 8; buf[o + 1] = u & 0xff; };

  function lerMatriz(buf, id) {
    return Array.from({ length: 9 }, (_, i) => i16(buf, MATRIZ_BASE + id * 18 + 2 * i));
  }

  function gravarMatriz(buf, id, m) {
    m.forEach((v, i) => p16(buf, MATRIZ_BASE + id * 18 + 2 * i, v));
  }

  function lerSegmentos(buf, id) {
    const o = CURVA_POR_ID[id];
    const a = [], b = [];
    for (let c = 0; c < 3; c++) {
      a.push(Array.from({ length: 8 }, (_, s) => i16(buf, o + 32 * c + 2 * s)));
      b.push(Array.from({ length: 8 }, (_, s) => i16(buf, o + 32 * c + 16 + 2 * s)));
    }
    return { a, b };
  }

  function gravarSegmentos(buf, id, seg) {
    const o = CURVA_POR_ID[id];
    for (let c = 0; c < 3; c++)
      for (let s = 0; s < 8; s++) { p16(buf, o + 32 * c + 2 * s, seg.a[c][s]); p16(buf, o + 32 * c + 16 + 2 * s, seg.b[c][s]); }
  }

  // A camera monta a LUT assim: LUT[x] = limita((x * a[x>>5]) >> 7) + b[x>>5]  (>> com sinal = piso)
  function segmentosParaLut(seg) {
    return [0, 1, 2].map((c) => Array.from({ length: 256 }, (_, x) => {
      const s = x >> 5;
      return Math.max(0, Math.min(255, Math.floor((x * seg.a[c][s]) / 128) + seg.b[c][s]));
    }));
  }

  // Aproxima uma LUT de 256 pontos por 8 retas (uma a cada 32 niveis), como a camera guarda
  // ordem lexicografica: p vem antes de q?
  const antes = (p, q) => {
    const i = p.findIndex((v, j) => v !== q[j]);
    return i >= 0 && p[i] < q[i];
  };

  function lutParaSegmentos(lut) {
    const a = [[], [], []], b = [[], [], []];
    let erroMax = 0;
    for (let c = 0; c < 3; c++) {
      for (let s = 0; s < 8; s++) {
        const xs = Array.from({ length: 32 }, (_, i) => 32 * s + i);
        const ys = xs.map((x) => lut[c][x]);
        // a camera corta em 0 e 255 depois da reta: ajusta so pelos pontos que nao estao no corte
        let ix = xs.map((_, i) => i).filter((i) => ys[i] > 0 && ys[i] < 255);
        if (ix.length < 2) ix = xs.map((_, i) => i);
        const mx = ix.reduce((p, i) => p + xs[i], 0) / ix.length, my = ix.reduce((p, i) => p + ys[i], 0) / ix.length;
        let num = 0, den = 0;
        ix.forEach((i) => { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; });
        const base = den ? Math.round((128 * num) / den) : 0;
        // procura a reta de menor erro MAXIMO (nao medio): em curva ingreme no escuro isso divide o erro por 2;
        // empate -> menor soma dos quadrados
        // a reta de menor erro maximo fica perto da media OU da reta entre as pontas: busca em volta das duas
        const i0 = ix[0], i1 = ix[ix.length - 1];
        const corda = xs[i1] > xs[i0] ? Math.round((128 * (ys[i1] - ys[i0])) / (xs[i1] - xs[i0])) : base;
        const inclinacoes = new Set();
        for (const centro of [base, corda]) for (let da = -64; da <= 64; da++) inclinacoes.add(Math.max(-32768, Math.min(32767, centro + da)));
        let melhor = null;
        for (const aa of inclinacoes) {
          const res = ix.map((i) => ys[i] - Math.floor((xs[i] * aa) / 128));
          const bb0 = Math.round((Math.max(...res) + Math.min(...res)) / 2);
          for (let db = -2; db <= 2; db++) {
            // a camera guarda o b em 16 bits com sinal: um degrau brusco pede um b maior, e cortado aqui o erro sai
            // honesto em vez de o numero dar a volta na gravacao (revisao de 22/10)
            const bb = Math.max(-32768, Math.min(32767, bb0 + db));
            const d = xs.map((x, i) => Math.max(0, Math.min(255, Math.floor((x * aa) / 128) + bb)) - ys[i]);
            const e = Math.max(...d.map(Math.abs)), q = d.reduce((p, v) => p + v * v, 0);
            // empate: a reta mais perto da media e o menor ajuste, para um trecho constante sair com inclinacao 0
            // (sem depender do corte em 0..255 da camera)
            const k = [e, q, Math.abs(aa - base), Math.abs(db)];
            if (!melhor || antes(k, melhor.k)) melhor = { aa, bb, e, k };
          }
        }
        a[c].push(melhor.aa); b[c].push(melhor.bb);
        erroMax = Math.max(erroMax, melhor.e);
      }
    }
    return { seg: { a, b }, erroMax };
  }

  // .flt do site do fabricante / do conversor de presets: 9 + 768 + 1 numeros antes de "brightness:"
  function lerFlt(texto) {
    const linhas = texto.split("\n").map((l) => l.trim()).filter((l) => l);
    const fim = linhas.findIndex((l) => l.startsWith("brightness:"));
    const vals = (fim < 0 ? linhas : linhas.slice(0, fim)).flatMap((l) => l.split(",")).map((v) => v.trim()).filter((v) => v);
    if (vals.length !== 778) throw new Error(`.flt invalido: ${vals.length} numeros, o esperado e 778`);
    const n = vals.map(Number);
    if (n.some((v) => !Number.isFinite(v))) throw new Error(".flt invalido: ha valores que nao sao numeros");
    const flt = { matriz: n.slice(0, 9).map(Math.round), curvas: [n.slice(9, 265), n.slice(265, 521), n.slice(521, 777)], grao: n[777] };
    const linhaReceita = fim < 0 ? null : linhas.slice(fim).find((l) => l.startsWith("criador:"));
    if (linhaReceita) {
      try { flt.receita = JSON.parse(linhaReceita.slice("criador:".length)); } catch (e) { flt.receitaEstragada = true; }   // abre sem receita, e o criador diz por que
    }
    const linhaCamera = fim < 0 ? null : linhas.slice(fim).find((l) => l.startsWith("camera:"));
    if (linhaCamera) {
      try { flt.camera = JSON.parse(linhaCamera.slice("camera:".length)); } catch (e) { /* estragada: vale a conta de sempre */ }
    }
    if (fim >= 0) flt.site = lerLinhasDoSite(linhas.slice(fim));
    return flt;
  }

  // ---------- ajustes do JL Camera Tool (o site do fabricante) ----------
  // O site grava, depois das tabelas, os controles que as fizeram (brightness: ... effect:). Ao ler, faz como o
  // parseFilterData dele (JL_CAM_Tool.js:382): linha que falta fica no padrao, valor que nao e numero vira 0.
  const SITE_PADRAO = { brightness: 0, contrast: 1, saturation: 1, hue: 0, gammaR: 1, gammaG: 1, gammaB: 1, grain: 0, effect: "custom" };
  function lerLinhasDoSite(linhas) {
    const site = { ...SITE_PADRAO };
    for (const l of linhas) {
      const i = l.indexOf(":"), k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
      if (i < 0 || !tem(SITE_PADRAO, k)) continue;
      if (k === "effect") site.effect = v;
      else { const n = parseFloat(v); site[k] = Number.isNaN(n) ? 0 : n; }
    }
    return site;
  }

  // As tabelas que o site grava para esses controles: makeCCMatrix e makeSegDLookupTable (JL_CAM_Tool_filters.js:188
  // e :228) e o arredondamento do Save Filter (JL_CAM_Tool.js:168): a tabela da tela tem 2 casas (toFixed), a matriz
  // sai x1024 e as curvas inteiras. O efeito nao entra: o Save Filter refaz as tabelas so pelos controles.
  function fltDoSite(c) {
    const faixa = (v, a, b) => Math.min(Math.max(v, a), b);
    const v = (k) => (tem(c, k) ? Number(c[k]) : SITE_PADRAO[k]);
    const s = faixa(v("saturation"), 0, 4), h = faixa(v("hue"), 0, 360) * Math.PI / 180;
    const cs = Math.cos(h), sn = Math.sin(h), Lr = 0.299, Lg = 0.587, Lb = 0.114;
    const S = [[Lr * (1 - s) + s, Lg * (1 - s), Lb * (1 - s)], [Lr * (1 - s), Lg * (1 - s) + s, Lb * (1 - s)], [Lr * (1 - s), Lg * (1 - s), Lb * (1 - s) + s]];
    const H = [[0.299 + 0.701 * cs + 0.168 * sn, 0.587 - 0.587 * cs + 0.330 * sn, 0.114 - 0.114 * cs - 0.497 * sn],
      [0.299 - 0.299 * cs - 0.328 * sn, 0.587 + 0.413 * cs + 0.035 * sn, 0.114 - 0.114 * cs + 0.292 * sn],
      [0.299 - 0.3 * cs + 1.25 * sn, 0.587 - 0.588 * cs - 1.05 * sn, 0.114 + 0.886 * cs - 0.203 * sn]];
    const matriz = Array.from({ length: 9 }, (_, k) => {
      const i = Math.floor(k / 3), j = k % 3;
      let m = 0;
      for (let t = 0; t < 3; t++) m += S[i][t] * H[t][j];
      return Math.round(parseFloat(m.toFixed(2)) * 1024) || 0;     // || 0: sem -0 (no arquivo os dois sao "0")
    });
    const b = faixa(v("brightness"), -255, 255), ct = faixa(v("contrast"), 0, 2);
    const curvas = ["gammaR", "gammaG", "gammaB"].map((k) => {
      const g = 1 / faixa(v(k), 0.1, 2);
      return Array.from({ length: 256 }, (_, i) => {
        const x = faixa((faixa(i + b, 0, 255) - 128) * ct + 128, 0, 255);
        return Math.round(parseFloat((Math.pow(x / 255, g) * 255).toFixed(2)));
      });
    });
    return { matriz, curvas, grao: faixa(Math.round(v("grain")), 0, 64) };
  }

  // Os ajustes do site guardados num .flt lido, so se refazem exatamente as tabelas dele (o filtro nao foi mudado
  // depois, fora do site); senao null. Os .flt destas ferramentas gravam as linhas do site no padrao: com os 7
  // controles no padrao nao ha ajuste a mostrar (e o filtro neutro, de onde quer que venha), entao tambem null.
  function ajustesDoSite(lido) {
    if (!lido.site) return null;
    if (["brightness", "contrast", "saturation", "hue", "gammaR", "gammaG", "gammaB"].every((k) => lido.site[k] === SITE_PADRAO[k])) return null;
    const f = fltDoSite(lido.site);
    const igual = f.matriz.every((v, i) => v === lido.matriz[i]) && f.curvas.every((c, j) => c.every((v, i) => v === Math.round(lido.curvas[j][i])));
    return igual ? lido.site : null;
  }

  const mul3 = (p, q) => Array.from({ length: 9 }, (_, k) => {
    const i = Math.floor(k / 3), j = k % 3;
    return p[3 * i] * q[j] + p[3 * i + 1] * q[3 + j] + p[3 * i + 2] * q[6 + j];
  });

  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  }

  // O .flt descreve o "visual" sobre as cores ja corrigidas; na camera a matriz do filtro substitui a do sensor,
  // entao a matriz gravada = matriz do .flt . matriz do sensor
  function fltParaFirmware(flt, mSensor) {
    const m = mul3(flt.matriz.map((v) => v / 1024), mSensor.map((v) => v / 1024)).map((v) => Math.round(v * 1024));
    const cortados = m.filter((v) => Math.abs(v) > LIMITE_MATRIZ).length;
    const r = lutParaSegmentos(flt.curvas.map((c) => c.map((v) => Math.max(0, Math.min(255, Math.round(v))))));
    const matriz = m.map((v) => Math.max(-LIMITE_MATRIZ, Math.min(LIMITE_MATRIZ, v)));
    if (exatoDaCamera(flt.camera, mSensor, matriz, r.seg))   // exportado desta camera e nao mexido: os numeros dela
      return { matriz: flt.camera.matriz.slice(), seg: { a: flt.camera.seg.a.map((c) => c.slice()), b: flt.camera.seg.b.map((c) => c.slice()) },
        erroMax: r.erroMax, cortados: 0, grao: flt.grao, exato: true };
    return { matriz, seg: r.seg, erroMax: r.erroMax, cortados, grao: flt.grao };
  }

  // Exportar o filtro de uma posicao (os botoes "Exportar .flt"): o .flt de sempre (corParaFlt) mais a linha
  // "camera:", com a matriz e as 8 retas gravadas e a matriz do sensor. A conta .flt -> camera arredonda, e em alguns
  // filtros de fabrica (ALT800, ALTFILM, CHROME e PB800 da 1.0; ALT50 e ALT800 da 2.1) a matriz voltaria 1 ponto (de
  // 1024) diferente. Com a linha, o filtro volta identico, mas so na mesma camera (mesmo sensor) e se os 778 numeros
  // ainda derem a mesma cor (ate 3 pontos na matriz, a mesma curva): mexido depois, vale a conta de sempre.
  function fltDaCamera(matriz, seg, mSensor) {
    return { ...corParaFlt(matriz, segmentosParaLut(seg), mSensor),
      camera: { versao: 1, sensor: mSensor.slice(), matriz: matriz.slice(), seg: { a: seg.a.map((c) => c.slice()), b: seg.b.map((c) => c.slice()) } } };
  }
  function exatoDaCamera(c, mSensor, matriz, seg) {
    const inteiros = (l, n, lim) => Array.isArray(l) && l.length === n && l.every((v) => Number.isInteger(v) && Math.abs(v) <= lim);
    const retas = (l) => Array.isArray(l) && l.length === 3 && l.every((k) => inteiros(k, 8, 0xffff));
    if (!c || typeof c !== "object" || c.versao !== 1 || !inteiros(c.sensor, 9, 0x7fff) || !inteiros(c.matriz, 9, LIMITE_MATRIZ)) return false;
    if (!c.seg || !retas(c.seg.a) || !retas(c.seg.b)) return false;
    if (!c.sensor.every((v, i) => v === mSensor[i])) return false;
    if (!c.matriz.every((v, i) => Math.abs(v - matriz[i]) <= 3)) return false;
    return JSON.stringify(segmentosParaLut(c.seg)) === JSON.stringify(segmentosParaLut(seg));
  }

  // Caminho inverso (backup): cor gravada no firmware -> .flt. Matriz do .flt = matriz gravada . inversa da do sensor,
  // escolhendo os inteiros que, importados de volta por fltParaFirmware, devolvem exatamente a matriz gravada.
  // O grao nao esta nessas tabelas (fica com a posicao da roda): sai 0.
  // mSensor: a matriz do sensor do firmware ORIGINAL; o padrao (o F3 de buf) so vale se o F3 nao foi trocado.
  function firmwareParaFlt(buf, id, mSensor = lerMatriz(buf, ID_SENSOR)) {
    return corParaFlt(lerMatriz(buf, id), segmentosParaLut(lerSegmentos(buf, id)), mSensor);
  }

  // O mesmo, a partir da matriz gravada e da LUT ja calculada (para firmwares com outra tabela, ex. o ALT V2)
  function corParaFlt(alvo, curvas, mSensor) {
    const s = mSensor.map((v) => v / 1024), si = inv3(s);
    const matriz = [];
    for (let r = 0; r < 3; r++) {
      const linha = alvo.slice(3 * r, 3 * r + 3);
      const real = [0, 1, 2].map((j) => linha[0] * si[j] + linha[1] * si[3 + j] + linha[2] * si[6 + j]);
      let melhor = null;
      for (let d0 = -3; d0 <= 3; d0++) for (let d1 = -3; d1 <= 3; d1++) for (let d2 = -3; d2 <= 3; d2++) {
        const f = [Math.round(real[0]) + d0, Math.round(real[1]) + d1, Math.round(real[2]) + d2];
        const p = f.map((v) => v / 1024);   // mesma conta, na mesma ordem, de mul3 em fltParaFirmware
        const e = Math.max(...[0, 1, 2].map((j) => Math.abs(Math.round((p[0] * s[j] + p[1] * s[3 + j] + p[2] * s[6 + j]) * 1024) - linha[j])));
        const dist = f.reduce((q, v, j) => q + (v - real[j]) ** 2, 0);
        if (!melhor || e < melhor.e || (e === melhor.e && dist < melhor.dist)) melhor = { f, e, dist };
      }
      matriz.push(...melhor.f);
    }
    return { matriz, curvas, grao: 0 };
  }

  // Mesmo texto que o site grava: 2 linhas vazias, matriz, curvas R/G/B, grao e os controles (neutros) do site.
  // flt.receita (opcional): os controles do criador, numa linha "criador:" no fim. O site so le as chaves que conhece
  // depois de "brightness:", e a camera e os nossos leitores so os 778 numeros; a linha so serve para o criador.
  function escreverFlt(flt) {
    const m = flt.matriz.map(Math.round);
    const matriz = [0, 1, 2].map((i) => m.slice(3 * i, 3 * i + 3).join(", ")).join(", \n");
    const curvas = flt.curvas.map((c) => c.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(", ")).join("\n");
    const g = Math.max(0, Math.min(64, Math.round(flt.grao || 0)));
    const receita = flt.receita ? `\ncriador:${JSON.stringify(flt.receita)}` : "";
    const camera = flt.camera ? `\ncamera:${JSON.stringify(flt.camera)}` : "";   // fltDaCamera: os numeros exatos da camera
    const s = { ...SITE_PADRAO, ...(flt.site || {}) };          // flt.site: os ajustes do site, para ele reabrir com os controles
    const site = ["brightness", "contrast", "saturation", "hue", "gammaR", "gammaG", "gammaB"].map((k) => `${k}:${Number(s[k])}`).join("\n");
    return `\n\n${matriz}\n${curvas}\n${g}\n${site}\ngrain:${g}\neffect:custom${receita}${camera}`;
  }

  // Ajuste por cor: a camera so tem a matriz 3x3, entao as cores nao sao independentes. Acha a matriz H que leva
  // cada amostra (RGB linear) o mais perto do seu alvo (minimos quadrados com peso), com H.[1,1,1] = [1,1,1]
  // para o cinza nao mudar: cada linha e a identidade + p.(1,0,-1) + q.(0,1,-1), 6 numeros livres no total.
  function matrizPorCor(amostras, alvos, pesos) {
    const H = [];
    for (let r = 0; r < 3; r++) {
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      amostras.forEach((s, i) => {
        const u = s[0] - s[2], v = s[1] - s[2], y = alvos[i][r] - s[r], w = pesos[i];
        a11 += w * u * u; a12 += w * u * v; a22 += w * v * v; b1 += w * u * y; b2 += w * v * y;
      });
      const det = a11 * a22 - a12 * a12;
      const p = det ? (b1 * a22 - b2 * a12) / det : 0, q = det ? (a11 * b2 - a12 * b1) / det : 0;
      const linha = [p, q, -p - q];
      linha[r] += 1;
      H.push(...linha);
    }
    return H;
  }

  function lerMensagem(buf) {
    return [MSG_PRIMEIRA, ...MSG_LIGAR].map((p) => String.fromCharCode(buf[p.letra])).join("").replace(/\s+$/, "");
  }

  function posicoesDaMensagem(buf) {
    return { ligar: [MSG_PRIMEIRA, ...MSG_LIGAR].map((p) => buf[p.x]), desligar: [MSG_PRIMEIRA, ...MSG_DESLIGAR].map((p) => buf[p.x]) };
  }

  function gravarMensagem(buf, texto) {
    const t = String(texto).replace(/\s+$/, "");
    const problema = problemaDaMensagem(t);
    if (problema) throw new Error(`mensagem: ${problema}`);
    const todas = [MSG_PRIMEIRA, ...MSG_LIGAR, ...MSG_DESLIGAR];
    if (todas.some((p) => buf[p.letra - 1] !== 0x7b || buf[p.x - 1] !== 0x7f)) throw new Error("o codigo da mensagem nao e o esperado");
    const x0 = 64 - 4 * t.length;
    const letras = t.padEnd(8, " ");
    for (const lista of [[MSG_PRIMEIRA, ...MSG_LIGAR], [MSG_PRIMEIRA, ...MSG_DESLIGAR]])
      lista.forEach((p, i) => { buf[p.letra] = letras.charCodeAt(i); buf[p.x] = x0 + 8 * i; });
  }

  const texto0 = (buf, ini) => { let t = ""; for (let i = ini; buf[i] && t.length < 16; i++) t += String.fromCharCode(buf[i]); return t; };
  function lerFotos(buf) {
    const formato = texto0(buf, FOTO_FORMATO), los = FOTO_CASOS.map((p) => buf[p]);
    if (formato === "%3s%05u" && los.every((lo, i) => lo === 0x3d + 4 * i)) return "por filtro";
    if (formato === "%4s%04u" && los.every((lo) => lo === 0x5d)) return "DSCF";
    return "?";
  }

  function gravarFotosDSCF(buf) {
    const codigoOk = FOTO_CASOS.every((p) => buf[p - 3] === 0x7a && buf[p - 2] === 0x45 && buf[p - 1] === 0x79)
      && buf[0x77ab7] === 0x7a && buf[0x77ab8] === 0x45 && buf[0x77ab9] === 0x79 && buf[0x77aba] === 0x5d   // caso padrao: DSCF
      && texto0(buf, FOTO_DSCF) === "DSCF" && buf[FOTO_DSCF + 4] === 0;
    if (!codigoOk || lerFotos(buf) === "?") throw new Error("o codigo do nome das fotos nao e o esperado");
    buf[FOTO_FORMATO + 1] = 0x34;                     // %3s -> %4s
    buf[FOTO_FORMATO + 5] = 0x34;                     // %05u -> %04u
    for (const p of FOTO_CASOS) buf[p] = 0x5d;        // os 8 casos apontam para "DSCF"
  }

  // O prefixo das fotos em sequencia (o "DSCF" de DSCF0001.JPG). A camera grava nomes curtos (FAT 8.3, padrao DCF):
  // 4 caracteres A-Z, 0-9 ou _ e o numero de 4 digitos. O texto so e usado pelo nome das fotos (caso padrao do switch).
  function prefixoFotos(buf) {
    return texto0(buf, FOTO_DSCF);
  }

  const tabelaDeAjustesOk = (buf) => texto0(buf, CFG_PADRAO).startsWith("$CfG");
  function lerNitidez(buf) {
    return tabelaDeAjustesOk(buf) ? NIVEIS_NITIDEZ[buf[NITIDEZ]] || "?" : "?";
  }

  function gravarNitidez(buf, nivel) {
    const v = NIVEIS_NITIDEZ.indexOf(nivel);
    if (v < 0) throw new Error(`nitidez "${nivel}": use ${NIVEIS_NITIDEZ.join(", ")}`);
    if (!tabelaDeAjustesOk(buf) || lerNitidez(buf) === "?") throw new Error("nitidez: a tabela de ajustes nao esta onde deveria");
    buf[NITIDEZ] = v;
  }

  const ruidoNoLugar = (buf) => buf[RUIDO_TABELA0] === 15
    && RUIDO_REGISTROS.every((r) => buf[r + 7] === 8 && buf[r + 9] <= 28 && buf[r + 10] <= 16);
  function lerRuido(buf) {
    if (!ruidoNoLugar(buf)) return "?";
    if (RUIDO_REGISTROS.every((r) => buf[r + 9] === 27 && buf[r + 10] === 7)) return "maxima";
    if (!RUIDO_REGISTROS.every((r) => buf[r + 9] === 0 && buf[r + 10] === 0)) return "normal";
    return buf[RUIDO_TABELA0 + 1] === 0 ? "desligada" : "minima";
  }

  function gravarRuido(buf, nivel) {
    if (!NIVEIS_RUIDO.includes(nivel)) throw new Error(`reducao de ruido "${nivel}": use ${NIVEIS_RUIDO.join(", ")}`);
    if (!ruidoNoLugar(buf)) throw new Error("reducao de ruido: as tabelas nao estao onde deveriam");
    if (nivel === "normal") return;
    const [tabela, nucleo] = nivel === "maxima" ? [27, 7] : [0, 0];
    for (const r of RUIDO_REGISTROS) { buf[r + 9] = tabela; buf[r + 10] = nucleo; }
    if (nivel === "desligada") buf[RUIDO_TABELA0 + 1] = 0;
  }

  // Ajustes achados na revisao de 21/10/2026 (analise_alt21/revisao_21-10: G_opcoes_do_sistema, F_flash_revisao e
  // I_jl_slave_JL2380). Cada ajuste tem os lugares que muda e, por opcao, os bytes desses lugares. A assinatura sao bytes
  // vizinhos (a instrucao em volta do imediato) que tem de estar como no ALT 2.1; os da CFG pedem a tabela $CfG no lugar.
  const cfgAjuste = (desl, opcoes) => ({ cfg: true, lugares: [CFG_PADRAO + desl], opcoes: opcoes.map(([id, v]) => [id, [v]]), assinatura: [] });
  // Reducao de ruido extra (o "Multi-NR" do JL_SLAVE): linha do nivel de ganho L em 0x3CA19 + 16*L; [4] = passadas extras
  // do filtro 9x9 da pagina 0x32, [5..] = registro de ruido de cada passada ([2] = L, o do proprio nivel). Pouca luz = L
  // 15-22 (conjunto A) e 38-46 (conjunto B, caso a foto use o outro modo do sensor). A camera so roda isso em fotos de
  // 4192x3112 ou maiores (limite em 0x46FA4 e 0x46FB7, que fica como esta).
  const LINHA_NIVEL = (L) => 0x3ca19 + 16 * L;
  const NIVEIS_EXTRA = [15, 16, 17, 18, 19, 20, 21, 22, 38, 39, 40, 41, 42, 43, 44, 45, 46];
  const passadas = (n) => NIVEIS_EXTRA.flatMap((L) => [n, n >= 1 ? L : 0, n >= 2 ? L : 0]);
  const AJUSTES_DEF = {
    rede: cfgAjuste(0x0c, [["50hz", 0x02], ["60hz", 0x01]]),
    exposicao: cfgAjuste(0x18, [["-1", 0xf6], ["-0.5", 0xfb], ["0", 0x00], ["+0.5", 0x05], ["+1", 0x0a]]),   // decimos de EV
    branco: cfgAjuste(0x17, [["auto", 0], ["luz-do-dia", 1], ["nublado", 2], ["fluorescente", 3], ["tungstenio", 4]]),
    resolucao: cfgAjuste(0x16, [["4000x3000", 0x11], ["4192x3112", 0x3a], ["3264x2448", 0x0e], ["2592x1944", 0x0a], ["1920x1080", 0x07]]),
    qualidade: cfgAjuste(0x14, [["super-fina", 0], ["fina", 1], ["normal", 2]]),
    data: cfgAjuste(0x11, [["aaaa/mm/dd", 0], ["mm/dd/aaaa", 1], ["dd/mm/aaaa", 2]]),
    telinha: {   // contraste do OLED (SSD1306): MOV R7,#81h; LCALL EBF7h; CLR A; MOV R5,A; MOV R7,#valor; LCALL EBF7h
      lugares: [0x9b5f1], opcoes: [["fraca", [0x20]], ["media", [0x80]], ["forte", [0xcf]]],
      assinatura: [[0x9b5e9, [0x7f, 0x81, 0x12, 0xeb, 0xf7, 0xe4, 0xfd, 0x7f]], [0x9b5f2, [0x12, 0xeb, 0xf7]]] },
    desligar: {   // segundos parada ate desligar: MOV R7,#baixo; MOV R6,#alto; LCALL 125Eh
      lugares: [0x84695, 0x84697], opcoes: [["2min", [0x78, 0x00]], ["5min", [0x2c, 0x01]], ["10min", [0x58, 0x02]], ["30min", [0x08, 0x07]]],
      assinatura: [[0x84694, [0x7f]], [0x84696, [0x7e]], [0x84698, [0x12, 0x12, 0x5e]]] },
    flash: {   // chave em ON e cena clara: 02 = pulso antes da foto (fabrica), 00 = nao dispara. Modo 1 (sem uso) junto
      lugares: [0x4f830, 0x4f83f], opcoes: [["sempre", [0x02, 0x02]], ["so-no-escuro", [0x00, 0x00]]],
      assinatura: [[0x4f82a, [0xc3, 0x94, 0x2d, 0x50, 0x03, 0x7f]], [0x4f831, [0x22, 0x7f, 0x01, 0x22]],
        [0x4f839, [0xc3, 0x94, 0x2d, 0x50, 0x03, 0x7f]], [0x4f840, [0x22, 0x7f, 0x01, 0x22]]] },
    exposicaoFlash: {   // indice da tabela de exposicao com flash: desconto de 3 entradas (03, FD) e teto (14 = 20)
      lugares: [0x45d6f, 0x45d7c, 0x45d93, 0x45d9a],
      opcoes: [["fabrica", [0x03, 0xfd, 0x14, 0x14]], ["mais-clara", [0x00, 0x00, 0x14, 0x14]], ["bem-mais-clara", [0x00, 0x00, 0x20, 0x20]]],
      assinatura: [[0x45d6d, [0xc3, 0x94]], [0x45d70, [0x74, 0x80, 0x94, 0x80, 0x50, 0x04]], [0x45d7a, [0xef, 0x24]], [0x45d7d, [0x90, 0x35, 0x12, 0xf0]],
        [0x45d90, [0xef, 0xd3, 0x94]], [0x45d94, [0x40, 0x06, 0x90, 0x35, 0x12, 0x74]], [0x45d9b, [0xf0]]] },
    pulsoFlash: {   // largura do pulso de disparo (pagina 0x17, A5), no disparo e no boot: MOV A5h,#valor; MOV A6h,A
      lugares: [0x26f27, 0x274dc], opcoes: [["normal", [0xc8, 0xc8]], ["longo", [0xff, 0xff]]],
      assinatura: [[0x26f25, [0x75, 0xa5]], [0x26f28, [0xf5, 0xa6, 0x75, 0xa7, 0x01]], [0x274da, [0x75, 0xa5]], [0x274dd, [0xf5, 0xa6, 0x75, 0xa7, 0x01]]] },
    ruidoExtra: {
      lugares: NIVEIS_EXTRA.flatMap((L) => [LINHA_NIVEL(L) + 4, LINHA_NIVEL(L) + 5, LINHA_NIVEL(L) + 6]),
      opcoes: [["desligada", passadas(0)], ["pouca-luz", passadas(1)], ["pouca-luz-forte", passadas(2)]],
      assinatura: [[0x46fa4, [0x7f, 0x60, 0x7e, 0x10]], [0x46fb7, [0x7f, 0x28, 0x7e, 0x0c]],
        ...NIVEIS_EXTRA.flatMap((L) => [[LINHA_NIVEL(L) + 2, [L, L]], [LINHA_NIVEL(L) + 7, new Array(9).fill(0)]])] },
  };
  const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // so as chaves do proprio objeto (nao "toString")
  const AJUSTES = Object.fromEntries(Object.entries(AJUSTES_DEF).map(([nome, a]) => [nome, a.opcoes.map(([id]) => id)]));

  function lerAjuste(buf, nome) {
    const a = tem(AJUSTES_DEF, nome) ? AJUSTES_DEF[nome] : null;
    if (!a) throw new Error(`ajuste "${nome}" nao existe: use ${Object.keys(AJUSTES_DEF).join(", ")}`);
    if (a.cfg && !tabelaDeAjustesOk(buf)) return "?";
    if (a.assinatura.some(([p, bytes]) => bytes.some((v, i) => buf[p + i] !== v))) return "?";
    const op = a.opcoes.find(([, bytes]) => bytes.every((v, i) => buf[a.lugares[i]] === v));
    return op ? op[0] : "?";
  }

  const lerAjustes = (buf) => Object.fromEntries(Object.keys(AJUSTES_DEF).map((nome) => [nome, lerAjuste(buf, nome)]));

  function gravarAjuste(buf, nome, id) {
    const a = tem(AJUSTES_DEF, nome) ? AJUSTES_DEF[nome] : null;
    if (!a) throw new Error(`ajuste "${nome}" nao existe: use ${Object.keys(AJUSTES_DEF).join(", ")}`);
    const op = a.opcoes.find(([i]) => i === id);
    if (!op) throw new Error(`${nome} "${id}": use ${AJUSTES[nome].join(", ")}`);
    if (lerAjuste(buf, nome) === "?") throw new Error(`${nome}: os bytes nao estao como no ALT 2.1`);
    a.lugares.forEach((p, i) => { buf[p] = op[1][i]; });
  }

  function gravarPrefixoFotos(buf, prefixo) {
    if (!/^[A-Z0-9_]{4}$/.test(prefixo)) throw new Error(`prefixo das fotos "${prefixo}": use 4 caracteres A-Z, 0-9 ou _`);
    if (lerFotos(buf) !== "DSCF") throw new Error("prefixo das fotos: so vale com as fotos em sequencia (fotosDSCF)");
    if (prefixoFotos(buf).length !== 4 || buf[FOTO_DSCF + 4] !== 0) throw new Error("prefixo das fotos: o texto DSCF nao esta onde deveria");
    for (let i = 0; i < 4; i++) buf[FOTO_DSCF + i] = prefixo.charCodeAt(i);
  }

  // Previa aproximada: desfaz a gama do kit, aplica (matriz do filtro . inversa da do sensor), refaz a gama e a curva
  const GAMA_F = GAMA.map((v) => v / 256);
  function interp(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
  }
  const IDX = Array.from({ length: 1024 }, (_, i) => i);
  const LINEAR = Array.from({ length: 256 }, (_, v) => interp(v, GAMA_F, IDX));

  function simularFiltro(pix, filtro, mSensor) {
    const look = mul3(filtro.matriz.map((v) => v / 1024), inv3(mSensor.map((v) => v / 1024)));
    const out = new Uint8ClampedArray(pix.length);
    for (let i = 0; i < pix.length; i += 4) {
      const l = [LINEAR[pix[i]], LINEAR[pix[i + 1]], LINEAR[pix[i + 2]]];
      for (let c = 0; c < 3; c++) {
        const v = Math.max(0, Math.min(1023, look[3 * c] * l[0] + look[3 * c + 1] * l[1] + look[3 * c + 2] * l[2]));
        const g = interp(v, IDX, GAMA_F);
        const g0 = Math.min(254, Math.floor(g)), f = g - g0;
        out[i + c] = filtro.lut[c][g0] * (1 - f) + filtro.lut[c][g0 + 1] * f;
      }
      out[i + 3] = pix[i + 3];
    }
    return out;
  }

  // ---------- limites do filtro na camera ----------
  // O que costuma estragar a foto, medido pela mesma conta da simularFiltro. Calibrado em 23/10/2026 contra os 8 filtros
  // de fabrica da ALT 2.1 (ruido ate 2,7x no ALT50; ALT50 e ALT800 chapam as cores muito vivas; nenhum chapa pele, ceu
  // ou cor comum). cor = { matriz: a gravada (x1024, ja com o sensor), lut: 3 x 256 }.
  // - ruido: quanto o ruido do sensor sai maior que sem filtro (o pior ponto entre cinzas, cores, pele e ceu);
  // - cores chapadas: a cor passa de 0 ou de 1023 no linear, antes da gama, e perde o detalhe;
  // - branco: o cinza (0..255) em que algum canal chega a 254 (256 = nunca); preto: ate que cinza tudo fica <= 3.
  const hsv255 = (h, s, v) => {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5), f(3), f(1)].map((x) => x * 255);
  };
  const MATIZES = [0, 30, 60, 120, 180, 210, 240, 300];
  const SONDAS = {
    cinzas: [16, 30, 60, 100, 140, 180, 220].map((v) => [v, v, v]),
    medias: MATIZES.map((h) => hsv255(h, 0.55, 0.75)),     // cores comuns: roupas, folhas, objetos
    fortes: MATIZES.map((h) => hsv255(h, 0.9, 0.85)),      // cores muito vivas: flores, neon
    pele: [[224, 172, 140], [198, 134, 102], [141, 85, 56]],
    ceu: [[90, 140, 210], [150, 190, 235]],
  };
  const IDENTIDADE_LUT = [0, 1, 2].map(() => Array.from({ length: 256 }, (_, i) => i));
  function medirFiltro(cor, mSensor) {
    const SI = inv3(mSensor.map((v) => v / 1024));
    const lin = (v) => { const t = Math.max(0, Math.min(255, v)), i = Math.min(254, Math.floor(t)); return LINEAR[i] + (LINEAR[i + 1] - LINEAR[i]) * (t - i); };
    const bruto = (rgb) => { const l = rgb.map(lin); return [0, 1, 2].map((r) => SI[3 * r] * l[0] + SI[3 * r + 1] * l[1] + SI[3 * r + 2] * l[2]); };
    const conta = (c) => {
      const M = c.matriz.map((v) => v / 1024);
      const linear = (raw) => [0, 1, 2].map((k) => M[3 * k] * raw[0] + M[3 * k + 1] * raw[1] + M[3 * k + 2] * raw[2]);
      const saida = (raw) => linear(raw).map((v, k) => {
        v = Math.max(0, Math.min(1023, v));
        const i = Math.min(1022, Math.floor(v)), g = GAMA_F[i] + (GAMA_F[i + 1] - GAMA_F[i]) * (v - i);
        const g0 = Math.min(254, Math.floor(g)), f = g - g0;
        return c.lut[k][g0] * (1 - f) + c.lut[k][g0 + 1] * f;
      });
      return { linear, saida };
    };
    const filtro = conta(cor), neutro = conta({ matriz: mSensor, lut: IDENTIDADE_LUT });
    const ruidoEm = (cc, rgb) => {                       // cada canal do sensor 6 de 1023 acima: quanto a saida anda
      const r0 = bruto(rgb), s0 = cc.saida(r0);
      let soma = 0;
      for (let k = 0; k < 3; k++) { const r = r0.slice(); r[k] += 6; soma += cc.saida(r).reduce((p, v, c) => p + (v - s0[c]) ** 2, 0); }
      return Math.sqrt(soma);
    };
    const todas = [].concat(...Object.values(SONDAS));
    const ruido = Math.max(...todas.map((s) => ruidoEm(filtro, s) / Math.max(1e-6, ruidoEm(neutro, s))));
    const chapadas = (lista) => lista.filter((rgb) => filtro.linear(bruto(rgb)).some((v) => v < -2 || v > 1025)).length;
    let branco = 256, preto = -1;
    for (let v = 0; v < 256; v++) {
      const s = filtro.saida(bruto([v, v, v]));
      if (branco === 256 && s.some((x) => x >= 254)) branco = v;
      if (s.every((x) => x <= 3)) preto = v;
    }
    const pb = [3, 6].every((o) => [0, 1, 2].every((j) => Math.abs(cor.matriz[o + j] - cor.matriz[j]) < 20));   // linhas iguais
    return { ruido: Math.round(ruido * 100) / 100, pb, branco, preto,
      medias: chapadas(SONDAS.medias), fortes: chapadas(SONDAS.fortes), pele: chapadas(SONDAS.pele), ceu: chapadas(SONDAS.ceu) };
  }

  // Os avisos da medida, com os limites: ruido 2,2x nos coloridos (2,7x = o pior de fabrica) e 1,4x no preto e branco;
  // cores comuns (2 de 8), pele ou ceu chapados = aviso; so as muito vivas (4 de 8) = nota, porque o ALT50 faz isso;
  // branco que estoura antes do cinza 230; preto que engole acima do cinza 40.
  const LIMITES = { ruidoCor: 2.2, ruidoFabrica: 2.7, ruidoPb: 1.4, medias: 2, fortes: 4, branco: 230, preto: 40 };
  // O filtro de fabrica de cada camera que mais faz ruido (e que tambem chapa as cores muito vivas), pela mesma medida:
  // na 2.1 o ALT50 (2,69x), na 1.0 o ALT800 (1,75x, abaixo do recomendado; la nenhum de fabrica passa dele).
  const PIOR_DE_FABRICA = { "2.1": { nome: "ALT50", ruido: LIMITES.ruidoFabrica }, "1.0": { nome: "ALT800", ruido: 1.75 } };
  // Cada aviso tem o texto inteiro e um curto (para a tela do celular, onde a previa presa no alto tem pouco espaco).
  function avisosDoFiltro(m, camera = "2.1") {
    const num = (x) => String(x).replace(".", ","), avisos = [];
    const granulado = "Em pouca luz fica granulado.", fab = PIOR_DE_FABRICA[camera] || PIOR_DE_FABRICA["2.1"];
    if (m.pb && m.ruido > LIMITES.ruidoPb) avisos.push({ nivel: "aviso", texto: `Ruído ${num(m.ruido)}× o da câmera sem filtro: acima do recomendado para preto e branco (1,4×). ${granulado}`, curto: `Ruído ${num(m.ruido)}× (P&B: até 1,4×)` });
    else if (!m.pb && fab.ruido >= LIMITES.ruidoCor && m.ruido > fab.ruido) avisos.push({ nivel: "aviso", texto: `Ruído ${num(m.ruido)}×: mais que o pior filtro de fábrica (${fab.nome}, ${num(fab.ruido)}×). ${granulado}`, curto: `Ruído ${num(m.ruido)}× (fábrica: até ${num(fab.ruido)}×)` });
    else if (!m.pb && m.ruido > LIMITES.ruidoCor) avisos.push({ nivel: "aviso", texto: `Ruído ${num(m.ruido)}× o da câmera sem filtro: acima do recomendado (2,2×); o pior de fábrica, o ${fab.nome}, tem ${num(fab.ruido)}×. ${granulado}`, curto: `Ruído ${num(m.ruido)}× (bom: até 2,2×)` });
    const comuns = [m.medias >= LIMITES.medias && ["as cores comuns (roupas, folhas)", "cores comuns"], m.pele > 0 && ["a pele", "pele"], m.ceu > 0 && ["o céu azul", "céu"]].filter(Boolean);
    const vivas = m.fortes >= LIMITES.fortes;
    const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}` : l[0]);
    if (comuns.length) {
      avisos.push({ nivel: "aviso", texto: `Ficam chapadas (perdem o detalhe): ${juntar(comuns.map((c) => c[0]))}${vivas ? ", além das cores muito vivas" : ""}.`,
        curto: `Chapam: ${juntar(comuns.map((c) => c[1]))}` });
    } else if (vivas) {
      avisos.push({ nivel: "nota", texto: `Cores muito vivas (flores, neon) ficam chapadas: ${m.fortes} de 8. O ${fab.nome} de fábrica também faz isso.`, curto: `Cores muito vivas chapam (${m.fortes} de 8)` });
    }
    if (m.branco < LIMITES.branco) avisos.push({ nivel: "aviso", texto: `O branco estoura cedo: tudo acima do cinza ${m.branco} (de 255) vira branco.`, curto: `Branco estoura no cinza ${m.branco}` });
    if (m.preto > LIMITES.preto) avisos.push({ nivel: "aviso", texto: `As sombras somem: tudo abaixo do cinza ${m.preto} (de 255) vira preto.`, curto: `Preto engole até o cinza ${m.preto}` });
    return avisos;
  }

  // Os 2 ultimos bytes do .bin sao a soma de 16 bits (big-endian) de todos os outros
  function somaFinal(buf) {
    let s = 0;
    for (let i = 0; i < buf.length - 2; i++) s = (s + buf[i]) & 0xffff;
    return s;
  }

  function areasPermitidas(buf) {
    const areas = [[NOME_BASE, NOME_BASE + NOME_TAM * NOMES.length], [buf.length - 2, buf.length]];
    for (const id of Object.values(ID_POR_POSICAO)) {
      areas.push([MATRIZ_BASE + id * 18, MATRIZ_BASE + id * 18 + 18]);
      areas.push([CURVA_POR_ID[id], CURVA_POR_ID[id] + 96]);
    }
    for (const p of [MSG_PRIMEIRA, ...MSG_LIGAR, ...MSG_DESLIGAR]) areas.push([p.letra, p.letra + 1], [p.x, p.x + 1]);
    areas.push([FOTO_FORMATO + 1, FOTO_FORMATO + 2], [FOTO_FORMATO + 5, FOTO_FORMATO + 6], ...FOTO_CASOS.map((p) => [p, p + 1]),
      [FOTO_DSCF, FOTO_DSCF + 4], [NITIDEZ, NITIDEZ + 1],
      ...RUIDO_REGISTROS.map((r) => [r + 9, r + 11]), [RUIDO_TABELA0 + 1, RUIDO_TABELA0 + 2],
      ...Object.values(AJUSTES_DEF).flatMap((a) => a.lugares.map((p) => [p, p + 1])));
    for (const s of SONS_EDITAVEIS) {
      const e = espacoDoSom(buf, s);
      areas.push([e.inicio, e.inicio + e.tamanho]);
    }
    // junta areas que se encostam (ex.: matrizes vizinhas), senao uma mudanca que atravessa as duas parece "fora"
    areas.sort((p, q) => p[0] - q[0]);
    const juntas = [];
    for (const a of areas) {
      if (juntas.length && a[0] <= juntas[juntas.length - 1][1]) juntas[juntas.length - 1][1] = Math.max(juntas[juntas.length - 1][1], a[1]);
      else juntas.push([...a]);
    }
    return juntas;
  }

  // confere o que vai ser gravado antes de gravar (revisao de 22/10): cada numero tem de caber onde a camera le
  const inteiro16 = (v) => Number.isInteger(v) && v >= -32768 && v <= 32767;
  function conferirCor(pos, cor) {
    if (!Array.isArray(cor.matriz) || cor.matriz.length !== 9) throw new Error(`F${pos}: a matriz precisa de 9 numeros`);
    if (cor.matriz.some((v) => !Number.isInteger(v) || Math.abs(v) > LIMITE_MATRIZ)) throw new Error(`F${pos}: matriz fora da faixa`);
    const forma = (m) => Array.isArray(m) && m.length === 3 && m.every((l) => Array.isArray(l) && l.length === 8 && l.every(inteiro16));
    if (!cor.seg || !forma(cor.seg.a) || !forma(cor.seg.b)) throw new Error(`F${pos}: curva fora do formato da camera (3 canais x 8 retas, numeros inteiros de 16 bits)`);
  }
  function conferirDesenho(k, bits) {
    if (!Number.isInteger(k) || k < 0 || k >= NOMES.length) throw new Error(`desenho de nome ${k} nao existe (0 a ${NOMES.length - 1})`);
    if (!Array.isArray(bits) || bits.length !== NOME_ALTURA || bits.some((l) => !Array.isArray(l) || l.length !== NOME_LARGURA))
      throw new Error(`desenho de nome ${k}: precisa de ${NOME_ALTURA} linhas de ${NOME_LARGURA} pontos`);
  }

  function aplicar(original, edicoes) {
    const buf = new Uint8Array(original);
    for (const [k, bits] of Object.entries(edicoes.nomes || {})) { conferirDesenho(Number(k), bits); gravarNome(buf, Number(k), bits); }
    for (const [nome, dados] of Object.entries(edicoes.sons || {})) {
      if (!SONS_EDITAVEIS.includes(nome)) throw new Error("som nao editavel: " + nome);
      const e = espacoDoSom(buf, nome);
      if (dados.length !== e.tamanho) throw new Error(`${nome}: ${dados.length} bytes, o espaco tem ${e.tamanho}`);
      buf.set(dados, e.inicio);
    }
    for (const [pos, cor] of Object.entries(edicoes.cores || {})) {
      if (!tem(ID_POR_POSICAO, pos)) throw new Error("posicao invalida: " + pos);
      const id = ID_POR_POSICAO[pos];
      conferirCor(pos, cor);
      gravarMatriz(buf, id, cor.matriz);
      gravarSegmentos(buf, id, cor.seg);
    }
    if (edicoes.mensagem !== undefined && edicoes.mensagem !== null) gravarMensagem(buf, edicoes.mensagem);
    if (edicoes.fotosDSCF) gravarFotosDSCF(buf);
    if (edicoes.prefixoFotos !== undefined) gravarPrefixoFotos(buf, edicoes.prefixoFotos);
    if (edicoes.nitidez !== undefined) gravarNitidez(buf, edicoes.nitidez);
    if (edicoes.ruido !== undefined) gravarRuido(buf, edicoes.ruido);
    for (const [nome, id] of Object.entries(edicoes.ajustes || {})) gravarAjuste(buf, nome, id);
    const extra = lerAjuste(buf, "ruidoExtra");
    if (extra !== "desligada" && extra !== "?" && lerAjuste(buf, "resolucao") !== "4192x3112")
      throw new Error("a reducao de ruido extra so roda em fotos de 4192x3112 ou maiores: use a resolucao 4192x3112");
    const s = somaFinal(buf);
    buf[buf.length - 2] = s >> 8;
    buf[buf.length - 1] = s & 0xff;
    return buf;
  }

  function faixasAlteradas(a, b) {
    const faixas = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (faixas.length && faixas[faixas.length - 1][1] === i) faixas[faixas.length - 1][1] = i + 1;
      else faixas.push([i, i + 1]);
    }
    return faixas;
  }

  function foraDasAreasPermitidas(faixas, buf) {
    const areas = areasPermitidas(buf);
    return faixas.filter(([i, f]) => !areas.some(([a, b]) => i >= a && f <= b));
  }

  // ---------- outras versoes do sistema: so leitura ----------
  // Le a roda, os nomes, as cores, o grao e os ajustes de um firmware da X10 de outra versao (ex.: a ALT V2,
  // X10_IMX258_BX), pelo padrao dos bytes do proprio codigo, sem enderecos fixos e sem mudar nada no arquivo. E o caminho
  // do _scripts/extrair_filtros_originais.js (os comentarios la explicam cada padrao): bancos pelo cabecalho $CBFS, a
  // roda no banco 12, o desenho do nome por ?C?CCASE sobre 4DD9, as matrizes e as curvas (switch sobre 4DDC) no banco 5.
  // Serve para versoes com a estrutura da ALT 2.1; outra geracao (como o firmware de teste do fabricante, que nem usa
  // essas variaveis) e recusada com o motivo. fonte: a fonte serifada da ALT 2.1, para ler o texto dos nomes.
  // referencia: a matriz do sensor que vale para o .flt (a da ALT 2.1, em quem vai usar o filtro nela): assim o filtro
  // importado na ALT 2.1 grava exatamente a mesma cor que ele tem na outra versao. Sem ela, a padrao da propria versao.
  const F_DO_N = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5, 8: 6, 7: 7, 6: 8 };   // n gravado em 4E8E -> posicao fisica da roda
  function acharTodos(buf, padrao, ini = 0, fim = buf.length, maximo = Infinity) {   // padrao: bytes, null = qualquer
    const r = [], k = padrao.findIndex((v) => v !== null);
    for (let i = ini; i + padrao.length <= fim && r.length < maximo; i++) {
      if (buf[i + k] !== padrao[k]) continue;
      let ok = true;
      for (let j = 0; j < padrao.length; j++) if (padrao[j] !== null && buf[i + j] !== padrao[j]) { ok = false; break; }
      if (ok) r.push(i);
    }
    return r;
  }
  const bytesDe = (s) => [...s].map((c) => c.charCodeAt(0));
  function bitsEm(buf, ini) {                           // um desenho de nome 67x27 (paginas de 8 linhas) a partir de ini
    return Array.from({ length: NOME_ALTURA }, (_, y) => Array.from({ length: NOME_LARGURA }, (_, x) => (buf[ini + (y >> 3) * NOME_LARGURA + x] >> (y & 7)) & 1));
  }
  function lerOutraVersao(buf, fonte, referencia) {
    try { return lerOutraVersaoOuFalhar(buf, fonte, referencia); } catch (e) { return { ok: false, erro: e.message }; }
  }
  function lerOutraVersaoOuFalhar(buf, fonte, referencia) {
    if (buf.length < 0x80000 || String.fromCharCode(...buf.subarray(0x400, 0x405)) !== "$CBFS")
      throw new Error("não parece um firmware da X10 (falta o cabeçalho $CBFS)");
    if (somaFinal(buf) !== ((buf[buf.length - 2] << 8) | buf[buf.length - 1])) throw new Error("a soma final não confere: o arquivo está corrompido ou incompleto");
    const delta = [];
    for (let k = 0, ini = 0x6000; k < 16; k++) { delta.push(ini - 0x4000); ini += buf[0x40a + k] * 256; }
    const arq = (banco, cpu) => (cpu < 0x4000 ? cpu + 0x2000 : cpu + delta[banco]);
    const faixa = (banco) => [arq(banco, 0x4000), arq(banco, 0x4000) + buf[0x40a + banco] * 256];
    const u16 = (o) => (buf[o] << 8) | buf[o + 1];
    const i16 = (o) => { const v = u16(o); return v >= 0x8000 ? v - 0x10000 : v; };
    const so1 = (lista, oque) => { if (lista.length !== 1) throw new Error(`não reconheci ${oque} desta versão (esperava 1, achei ${lista.length})`); return lista[0]; };
    function ccase(xdata, banco) {                      // ?C?CCASE (CPU 0x27A3) logo depois de ler a variavel XDATA
      const [i0, i1] = faixa(banco);
      const o = so1(acharTodos(buf, [0x90, xdata >> 8, xdata & 0xff, 0xe0, 0x12, 0x27, 0xa3], i0, i1), `a escolha em ${xdata.toString(16)}`);
      const casos = new Map();
      let i = o + 7;
      while (!(buf[i] === 0 && buf[i + 1] === 0) && i < i1) { casos.set(buf[i + 2], u16(i)); i += 3; }
      return { casos, padrao: u16(i + 2) };
    }
    // 1. Roda (banco 12): cada posicao grava a cena em 4DD9, chama CP_Set_Tone_Effect(id) (077E) e grava n em 4E8E
    const [r0, r1] = faixa(12), posicoes = [];
    for (const o of acharTodos(buf, [0x90, 0x4d, 0xd9, 0x74, null, 0xf0], r0, r1)) {
      const n4e8e = acharTodos(buf, [0x90, 0x4e, 0x8e, 0x74, null, 0xf0], o, o + 0x60, 1);
      if (!n4e8e.length) continue;                       // a leitura ao ligar nao grava 4E8E
      const cena = buf[o + 4], p = o + 6;
      let id;
      if (buf[p] === 0x7f && buf[p + 2] === 0x12 && u16(p + 3) === 0x077e) id = buf[p + 1];
      else if (buf[p] === 0xff && buf[p + 1] === 0x12 && u16(p + 2) === 0x077e) id = cena;
      else if (buf[p] === 0xe4 && buf[p + 1] === 0xff && buf[p + 2] === 0x12 && u16(p + 3) === 0x077e) id = 0;
      else throw new Error("não reconheci a roda desta versão (a escolha do efeito de uma posição é diferente)");
      const n = buf[n4e8e[0] + 4];
      const f41 = acharTodos(buf, [0x90, 0x41, 0xdb, 0x74, null, 0xf0], n4e8e[0], n4e8e[0] + 0x30, 1)[0];
      const f41a = acharTodos(buf, [0x90, 0x41, 0xdb, 0xf0], n4e8e[0], n4e8e[0] + 0x30, 1)[0];
      const fDoCodigo = f41 !== undefined ? buf[f41 + 4] : f41a !== undefined ? n : null;
      posicoes.push({ n, cena, id, F: F_DO_N[n], fDoCodigo });
    }
    if (posicoes.length !== 8 || new Set(posicoes.map((p) => p.F)).size !== 8 || posicoes.some((p) => !p.F))
      throw new Error(`não reconheci a roda desta versão (achei ${posicoes.length} de 8 posições): ela é de outra geração do sistema`);
    for (const p of posicoes) if (p.fDoCodigo !== null && p.fDoCodigo !== p.F) throw new Error("não reconheci a ordem da roda desta versão");
    // 2. Desenho do nome: escolha sobre a cena (banco 12) -> ponte na area comum -> funcao que passa o desenho em R2:R1
    const nomes = ccase(0x4dd9, 12);
    function desenhoDaCena(cena) {
      let alvo = arq(12, nomes.casos.has(cena) ? nomes.casos.get(cena) : nomes.padrao);
      if (buf[alvo] === 0x80) alvo += 2 + ((buf[alvo + 1] ^ 0x80) - 0x80);   // SJMP
      if (buf[alvo] !== 0x12) throw new Error("não reconheci o desenho dos nomes desta versão");
      const ponte = arq(0, u16(alvo + 1));
      if (buf[ponte] !== 0x90 || buf[ponte + 3] !== 0x02) throw new Error("não reconheci o desenho dos nomes desta versão");
      const banco = (u16(ponte + 4) - 0x032c) / 0x1a, f = arq(banco, u16(ponte + 1));
      const o = acharTodos(buf, [0x7b, 0xff, 0x7a, null, 0x79, null], f, f + 0x20, 1)[0];
      if (o === undefined) throw new Error("não reconheci o desenho dos nomes desta versão");
      return arq(banco, (buf[o + 3] << 8) | buf[o + 5]);
    }
    // 3. Matrizes (banco 5): base + id*18; o id 0 usa a matriz padrao do sensor
    const [c0, c1] = faixa(5);
    const om = so1(acharTodos(buf, [0xff, 0xd3, 0x94, 0x00, 0x40, null, 0xef, 0x75, 0xf0, 0x12, 0xa4, 0x24, null, 0xf9, 0x74, null,
      0x35, 0xf0, 0xfa, 0x7b, 0xff, 0x78, 0xc4, 0x7c, 0x4d], c0, c1), "a tabela de cores") + 7;
    const baseMatriz = arq(5, (buf[om + 8] << 8) | buf[om + 5]);
    const op = acharTodos(buf, [0x7b, 0xff, 0x7a, null, 0x79, null], om, om + 0x30, 1)[0];
    if (op === undefined) throw new Error("não reconheci a matriz do sensor desta versão");
    const padraoMatriz = arq(5, (buf[op + 3] << 8) | buf[op + 5]);
    const matrizEm = (o) => Array.from({ length: 9 }, (_, i) => i16(o + 2 * i));
    // 4. Curvas (banco 5): escolha sobre o id em 4DDC -> tabela de 96 B das 8 retas (com o grao no fim da rotina) ou,
    //    sem tabela, a curva calculada do brilho (4DE2) e do contraste (4E0E) iniciais
    const curvas = ccase(0x4ddc, 5);
    function graoDesde(o) {
      if (buf[o] === 0x7e && buf[o + 2] === 0x7f) {
        let i = o + 4;
        if (buf[i] === 0x80) i += 2 + ((buf[i + 1] ^ 0x80) - 0x80);
        if (buf[i] === 0x12 && buf[i + 4] === 0x3e && buf[i + 5] === 0x22) return buf[i + 3] === 0xd2;
      }
      for (let i = o; i < o + 0x220; i++) if (buf[i + 1] === 0x3e && buf[i + 2] === 0x22 && (buf[i] === 0xd2 || buf[i] === 0xc2)) return buf[i] === 0xd2;
      return null;                                       // nao achei: grao desconhecido
    }
    const brilho0 = [...new Set(acharTodos(buf, [0x90, 0x4d, 0xe2, 0x74, null, 0xf0], c0, c1).map((o) => buf[o + 4]))];
    const contraste0 = [...new Set(acharTodos(buf, [0x90, 0x4e, 0x0e, 0x74, null, 0xf0], c0, c1).map((o) => buf[o + 4]))];
    function curvaDoId(id) {
      if (!curvas.casos.has(id)) throw new Error("não reconheci a curva de uma posição desta versão");
      const o = arq(5, curvas.casos.get(id));
      if (buf[o] === 0x7e && buf[o + 2] === 0x7f) {
        const t = arq(5, (buf[o + 1] << 8) | buf[o + 3]);
        const seg = { a: [0, 1, 2].map((c) => Array.from({ length: 8 }, (_, s) => i16(t + 32 * c + 2 * s))),
          b: [0, 1, 2].map((c) => Array.from({ length: 8 }, (_, s) => i16(t + 32 * c + 16 + 2 * s))) };
        return { curva: "8 retas", lut: segmentosParaLut(seg), grao: graoDesde(o) };
      }
      if (brilho0.length === 1 && contraste0.length === 1 && acharTodos(buf, [0x90, 0x4e, 0x0e], o, o + 0x60, 1).length) {
        const b = brilho0[0], c = contraste0[0];
        const um = Array.from({ length: 256 }, (_, x) => Math.max(0, Math.min(255, (((x - 128) * c + 32) >> 6) + b)));
        return { curva: "calculada", lut: [um, [...um], [...um]], grao: graoDesde(o) };
      }
      throw new Error("não reconheci a curva de uma posição desta versão");
    }
    // 5. Cada posicao: cor (a matriz gravada ja vem com o sensor), o .flt e a conferencia de volta
    const sensor = matrizEm(padraoMatriz), ref = referencia || sensor, saida = {};
    for (const p of posicoes) {
      const matriz = matrizEm(p.id > 0 ? baseMatriz + 18 * p.id : padraoMatriz);
      const cv = curvaDoId(p.id), bits = bitsEm(buf, desenhoDaCena(p.cena));
      const flt = corParaFlt(matriz, cv.lut, ref);
      const volta = fltParaFirmware(lerFlt(escreverFlt(flt)), ref);
      saida[p.F] = { nome: (fonte ? lerTextoDoNome(bits, fonte) ?? lerTextoDoNomeSolto(bits, fonte) : null) ?? nomeConhecido(bits), bits, matriz, lut: cv.lut, curva: cv.curva, grao: cv.grao, id: p.id, flt,
        volta: volta.matriz.every((v, i) => Math.abs(v - matriz[i]) <= 1) && JSON.stringify(segmentosParaLut(volta.seg)) === JSON.stringify(cv.lut) };
    }
    const rev = acharTodos(buf, bytesDe("$Rev: "), 0, buf.length, 1)[0];
    const revTexto = rev === undefined ? null : (String.fromCharCode(...buf.subarray(rev + 6, rev + 16)).match(/^\d+/) || [null])[0];
    const sw = acharTodos(buf, bytesDe("X10.0"), 0, buf.length, 4).map((o) => String.fromCharCode(...buf.subarray(o, o + 9))).find((t) => /^X10\.\d\d\.\d\d$/.test(t)) || null;
    return { ok: true, rev: revTexto, software: sw, sensor, posicoes: saida, ajustes: ajustesDeOutraVersao(buf) };
  }
  // Os ajustes de outra versao: os da tabela $CfG pelo lugar da tabela; os de codigo pelos bytes vizinhos (a mesma
  // assinatura da ALT 2.1), no lugar dela ou achados uma vez so no arquivo. O que nao se acha com certeza fica "?".
  function ajustesDeOutraVersao(buf) {
    const cfgs = acharTodos(buf, bytesDe("$CfG"), 0, buf.length, 3);
    const cfg = cfgs.length === 1 ? cfgs[0] : cfgs.includes(CFG_PADRAO) ? CFG_PADRAO : -1;
    const r = { nitidez: cfg >= 0 ? NIVEIS_NITIDEZ[buf[cfg + 0x1e]] || "?" : "?", ruido: lerRuido(buf) };
    for (const [nome, a] of Object.entries(AJUSTES_DEF)) {
      let d = null;
      if (a.cfg) d = cfg >= 0 ? cfg - CFG_PADRAO : null;
      else if (a.assinatura.every(([p, bytes]) => bytes.every((v, i) => buf[p + i] === v))) d = 0;   // no lugar da ALT 2.1
      else {
        const pedacos = [...a.assinatura, ...a.lugares.map((p) => [p, [null]])];
        const ini = Math.min(...pedacos.map(([p]) => p)), fim = Math.max(...pedacos.map(([p, b]) => p + b.length));
        if (fim - ini <= 96) {                           // so os ajustes que ficam num trecho so
          const padrao = new Array(fim - ini).fill(null);
          for (const [p, bytes] of a.assinatura) bytes.forEach((v, i) => { padrao[p - ini + i] = v; });
          const achados = acharTodos(buf, padrao, 0, buf.length, 2);
          if (achados.length === 1) d = achados[0] - ini;
        }
      }
      const op = d === null ? null : a.opcoes.find(([, bytes]) => bytes.every((v, i) => buf[a.lugares[i] + d] === v));
      r[nome] = op ? op[0] : "?";
    }
    return r;
  }

  // Abre um sistema ja montado: um .bin que e o ALT 2.1 original mudado so nas areas que estas ferramentas mexem.
  // Devolve o que esta nele (nome e cor de cada posicao, mensagem, fotos, nitidez, ruido, ajustes e sons trocados) e
  // as edicoes que, aplicadas sobre o original, remontam o mesmo arquivo. Um valor que nao se reconhece vem como "?"
  // e fica fora das edicoes.
  function lerSistema(original, sis) {
    if (sis.length !== original.length) return { ok: false, erro: "o arquivo tem outro tamanho: não é um sistema montado a partir do ALT 2.1" };
    if (somaFinal(sis) !== ((sis[sis.length - 2] << 8) | sis[sis.length - 1])) return { ok: false, erro: "a soma final não confere: o arquivo está corrompido ou incompleto" };
    const fora = foraDasAreasPermitidas(faixasAlteradas(original, sis), original);
    if (fora.length) return { ok: false, erro: `tem ${fora.length} trecho(s) mudado(s) fora das áreas que estas ferramentas mexem: não foi montado a partir do ALT 2.1 por elas` };
    const igual = (a, b) => { for (let i = a; i < b; i++) if (sis[i] !== original[i]) return false; return true; };
    const fonte = fonteSerifa(original);
    const posicoes = {}, nomes = {}, cores = {}, sons = {};
    for (let p = 1; p <= 8; p++) {
      const k = RODA[p], id = ID_POR_POSICAO[p];
      const bits = lerNome(sis, k);
      const cor = { matriz: lerMatriz(sis, id), seg: lerSegmentos(sis, id) };
      const corIgualFabrica = igual(MATRIZ_BASE + id * 18, MATRIZ_BASE + id * 18 + 18) && igual(CURVA_POR_ID[id], CURVA_POR_ID[id] + 96);
      posicoes[p] = { bits, nome: lerTextoDoNome(bits, fonte), cor, corIgualFabrica };
      nomes[k] = bits;
      if (!corIgualFabrica) cores[p] = cor;
    }
    for (const s of SONS_EDITAVEIS) {
      const e = espacoDoSom(original, s);
      if (!igual(e.inicio, e.inicio + e.tamanho)) sons[s] = sis.slice(e.inicio, e.inicio + e.tamanho);
    }
    const modo = lerFotos(sis), prefixo = modo === "DSCF" ? prefixoFotos(sis) : null;
    const leitura = { ok: true, posicoes, sons, mensagem: lerMensagem(sis), fotos: prefixo || modo,
      nitidez: lerNitidez(sis), ruido: lerRuido(sis), ajustes: lerAjustes(sis) };
    leitura.edicoes = { nomes, cores, sons, mensagem: leitura.mensagem, fotosDSCF: modo === "DSCF",
      prefixoFotos: prefixo && prefixo !== "DSCF" ? prefixo : undefined,
      nitidez: leitura.nitidez === "?" ? undefined : leitura.nitidez, ruido: leitura.ruido === "?" ? undefined : leitura.ruido,
      ajustes: Object.fromEntries(Object.entries(leitura.ajustes).filter(([, v]) => v !== "?")) };
    // remonta aqui mesmo: o que nao voltar igual e o que estas ferramentas nao reconhecem (revisao de 22/10). Quem
    // baixar a partir dele volta esses pontos para os de fabrica, entao a pagina precisa saber quais sao.
    let remontado;
    try { remontado = aplicar(original, leitura.edicoes); }
    catch (e) { return { ok: false, erro: `tem valores que estas ferramentas não sabem regravar (${e.message})` }; }
    const perdas = new Set();
    for (let i = 0; i < sis.length - 2; i++) if (remontado[i] !== sis[i]) perdas.add(areaDoByte(original, i));
    leitura.perdas = [...perdas];
    leitura.identico = !perdas.size;
    if (perdas.has("ruido")) leitura.ruido = "?";
    return leitura;
  }

  // a que parte do sistema um byte pertence (para dizer o que um sistema aberto tem de diferente)
  function areaDoByte(buf, i) {
    if (i >= NOME_BASE && i < NOME_BASE + NOME_TAM * NOMES.length) return "nomes";
    for (const id of Object.values(ID_POR_POSICAO))
      if ((i >= MATRIZ_BASE + id * 18 && i < MATRIZ_BASE + id * 18 + 18) || (i >= CURVA_POR_ID[id] && i < CURVA_POR_ID[id] + 96)) return "cores";
    if ([MSG_PRIMEIRA, ...MSG_LIGAR, ...MSG_DESLIGAR].some((p) => i === p.letra || i === p.x)) return "mensagem";
    if (i === FOTO_FORMATO + 1 || i === FOTO_FORMATO + 5 || FOTO_CASOS.includes(i) || (i >= FOTO_DSCF && i < FOTO_DSCF + 4)) return "fotos";
    if (i === NITIDEZ) return "nitidez";
    if (i === RUIDO_TABELA0 + 1 || RUIDO_REGISTROS.some((r) => i === r + 9 || i === r + 10)) return "ruido";
    for (const [nome, a] of Object.entries(AJUSTES_DEF)) if (a.lugares.includes(i)) return `ajuste:${nome}`;
    for (const s of SONS_EDITAVEIS) { const e = espacoDoSom(buf, s); if (i >= e.inicio && i < e.inicio + e.tamanho) return "sons"; }
    return "outro";
  }

  // SHA-256 simples, para quando a pagina aberta do disco nao tem crypto.subtle
  function sha256Puro(dados) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
      0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
      0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const n = dados.length, total = Math.ceil((n + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(dados);
    m[n] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(n / 0x20000000), false);
    dv.setUint32(total - 4, (n << 3) >>> 0, false);
    const w = new Uint32Array(64);
    const rot = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return [...H].map((v) => v.toString(16).padStart(8, "0")).join("");
  }

  async function sha256Navegador(buf) {
    if (typeof crypto === "undefined" || !crypto.subtle) return sha256Puro(buf);
    const h = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(h)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  async function validarFirmware(buf, shaFn = sha256Navegador) {
    return (await shaFn(buf)) === SHA_ALT21;
  }

  // De qual camera e um firmware: a 2.1 (1.345.024 B, a atualizacao procura X10*.BIN, tabela em 0x78960) ou a 1.0
  // (1.282.304 B, T501*.BIN, tabela em 0x79860). Vale para o original e para os sistemas montados aqui (nenhuma
  // ferramenta mexe nessa tabela). null = nenhuma das duas (outra versao, como a ALT V2, ou outro arquivo).
  function cameraDoFirmware(buf) {
    const tem = (o, s) => [...s].every((c, i) => buf[o + i] === c.charCodeAt(0));
    if (buf.length === 1345024 && tem(0x78960, "X10\0")) return "2.1";
    if (buf.length === 1282304 && tem(0x79860, "T501\0")) return "1.0";
    return null;
  }

  function nomeDoArquivo(rotulo) {
    const limpo = String(rotulo || "editado").normalize("NFD").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    return `X10_${limpo || "editado"}.bin`;
  }

  return {
    SHA_ALT21, NOME_BASE, NOME_LARGURA, NOME_ALTURA, NOME_TAM, NOMES, RODA, SONS_EDITAVEIS,
    lerNome, gravarNome, fonteDaCamera, textoParaBits, montarNome, fonteSerifa, fonteSerifaFixa, FONTE16, textoSerifa, lerTextoDoNome, lerTextoDoNomeSolto, lerSistema, lerOutraVersao, metricaDosNomes, medirNome, problemaDoNome, problemaDaMensagem, diretorio, espacoDoSom, wavParaEspaco,
    areasPermitidas, aplicar, faixasAlteradas, foraDasAreasPermitidas, validarFirmware, cameraDoFirmware, nomeDoArquivo, sha256Puro,
    somaFinal, fltDaCamera, ID_POR_POSICAO, ID_SENSOR, lerMatriz, gravarMatriz, lerSegmentos, gravarSegmentos, segmentosParaLut,
    lutParaSegmentos, lerFlt, fltDoSite, ajustesDoSite, fltParaFirmware, firmwareParaFlt, corParaFlt, escreverFlt, matrizPorCor, lerFotos, prefixoFotos, gravarPrefixoFotos, lerNitidez, gravarNitidez, NIVEIS_NITIDEZ, lerRuido, gravarRuido, NIVEIS_RUIDO, AJUSTES, lerAjuste, lerAjustes, gravarAjuste, lerMensagem, posicoesDaMensagem, gravarMensagem, simularFiltro, medirFiltro, avisosDoFiltro, glifo8x16,
    GAMA, LIMITE_MATRIZ,
  };
});
