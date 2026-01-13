(function () {
  const refEl = document.getElementById("ref");
  const textEl = document.getElementById("text");
  const statusEl = document.getElementById("status");
  const todayEl = document.getElementById("today");

  // Cabeçalho com data (pt-BR)
  try {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    todayEl.textContent = fmt.format(d);
  } catch {
    todayEl.textContent = new Date().toLocaleDateString("pt-BR");
  }

  // === CONFIG ===
  // Se você quer "apenas texto corrido" (mais aesthetic): true
  // Se você quer manter números de versículo: false
  const REMOVE_VERSE_NUMBERS = true;

  // Página “Liturgia Diária” (pt-BR)
  const LITURGIA_URL = "https://liturgia.cancaonova.com/pb/";

  // Proxys para contornar CORS em embeds
  const endpoints = [
    "https://r.jina.ai/" + LITURGIA_URL,
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(LITURGIA_URL),
  ];

  function normalizeSpaces(s) {
    return s
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripTagsToText(html) {
    // remove scripts/styles
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<style[\s\S]*?<\/style>/gi, "");

    // converte <br> e fechamentos em quebras
    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/<\/p>/gi, "\n\n");
    html = html.replace(/<\/h\d>/gi, "\n\n");
    html = html.replace(/<\/li>/gi, "\n");
    html = html.replace(/<\/div>/gi, "\n");

    // remove tags restantes
    html = html.replace(/<[^>]+>/g, "");

    // entidades comuns
    html = html
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    return normalizeSpaces(html);
  }

  // Remove resíduos tipo markdown: **texto**, ****, __, etc.
  function removeMarkdownArtifacts(s) {
    return s
      // remove marcas de negrito/itálico
      .replace(/\*\*\*/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/__/g, "")
      .replace(/_/g, "")
      // limpa sobras estranhas no início de linha
      .replace(/^\s*[-•]\s*/gm, "")
      .trim();
  }

  // Remove números de versículo no meio do texto (21, 21b, 22…)
  // Mantém datas/anos e números que façam parte de palavras não isoladas.
  function removeVerseNumbers(s) {
    // troca " 21 " / " 21b " / " 21a " quando aparecem como tokens
    // também remove quando aparecem logo após quebra de linha
    let out = s
      .replace(/(^|\s)(\d{1,3})([ab])(?=\s)/g, "$1")   // 21b
      .replace(/(^|\s)(\d{1,3})(?=\s)/g, "$1");        // 21

    // corrige espaços duplos gerados
    out = out.replace(/[ \t]{2,}/g, " ");
    return out.trim();
  }

  function extractGospel(text) {
    // Ex: "Evangelho (Mc 1,21b-28)"
    const mRef = text.match(/Evangelho\s*\(([^)]+)\)/i);
    if (!mRef) throw new Error("Não encontrei a seção do Evangelho.");

    const ref = mRef[1].trim();

    // Cortar do Evangelho até "Palavra da Salvação"
    const startIdx = text.search(/Evangelho\s*\([^)]+\)/i);
    let chunk = text.slice(startIdx);

    const endIdx = chunk.search(/Palavra da Salvação/i);
    if (endIdx === -1) throw new Error("Não encontrei 'Palavra da Salvação' para delimitar o Evangelho.");
    chunk = chunk.slice(0, endIdx);

    // Preferir começar após "Glória a vós, Senhor" (quando existe)
    const gloryIdx = chunk.search(/Gl[oó]ria a v[oó]s,\s*Senhor/i);
    if (gloryIdx !== -1) {
      chunk = chunk.slice(gloryIdx);
      const afterLine = chunk.indexOf("\n");
      if (afterLine !== -1) chunk = chunk.slice(afterLine + 1);
    } else {
      // fallback: após "Proclamação do Evangelho"
      const proclIdx = chunk.search(/Proclama[cç][aã]o do Evangelho/i);
      if (proclIdx !== -1) {
        chunk = chunk.slice(proclIdx);
        const afterLine = chunk.indexOf("\n");
        if (afterLine !== -1) chunk = chunk.slice(afterLine + 1);
      }
    }

    chunk = chunk
      .replace(/^-?\s*Gl[oó]ria a v[oó]s,\s*Senhor\.?\s*$/gim, "")
      .replace(/^-?\s*Palavra do Senhor\.?\s*$/gim, "")
      .replace(/^-?\s*Gra[cç]as a Deus\.?\s*$/gim, "")
      .trim();

    // Limpeza de artefatos
    chunk = removeMarkdownArtifacts(chunk);

    if (REMOVE_VERSE_NUMBERS) {
      chunk = removeVerseNumbers(chunk);
    }

    // Se ficar vazio, falhar
    if (!chunk || chunk.length < 40) throw new Error("Texto do Evangelho vazio/curto demais após limpeza.");

    return { ref, gospel: normalizeSpaces(chunk) };
  }

  async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function run() {
    statusEl.textContent = "Carregando…";
    refEl.textContent = "Carregando…";
    textEl.textContent = "Carregando o Evangelho do dia…";

    for (const url of endpoints) {
      try {
        const raw = await fetchWithTimeout(url, 9000);

        const htmlStart = raw.search(/<!doctype html|<html/i);
        const html = htmlStart !== -1 ? raw.slice(htmlStart) : raw;

        const text = stripTagsToText(html);
        const { ref, gospel } = extractGospel(text);

        // ref vinha com "****" no seu print — isso resolve:
        refEl.textContent = removeMarkdownArtifacts(ref);

        textEl.textContent = gospel;
        statusEl.textContent = "Atualiza diariamente.";
        return;
      } catch (e) {
        // tenta o próximo endpoint
      }
    }

    refEl.textContent = "Indisponível no momento";
    textEl.textContent = "Não foi possível carregar o Evangelho do dia. Tente recarregar mais tarde.";
    statusEl.textContent = "Falha de rede/CORS.";
  }

  run();
})();
