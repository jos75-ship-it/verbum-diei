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

  // Página “Liturgia Diária” (pt-BR) — sem expor no UI
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

    // converte <br> e fechamentos de parágrafo em quebras
    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/<\/p>/gi, "\n\n");
    html = html.replace(/<\/h\d>/gi, "\n\n");
    html = html.replace(/<\/li>/gi, "\n");
    html = html.replace(/<\/div>/gi, "\n");

    // remove tags restantes
    html = html.replace(/<[^>]+>/g, "");

    // decodifica entidades comuns
    html = html
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    return normalizeSpaces(html);
  }

  function extractGospel(text) {
    // Procurar a âncora do Evangelho
    // Ex: "Evangelho (Mc 1,14-20)"
    const mRef = text.match(/Evangelho\s*\(([^)]+)\)/i);
    if (!mRef) throw new Error("Não encontrei a seção do Evangelho.");

    const ref = mRef[1].trim();

    // Cortar do Evangelho até "Palavra da Salvação"
    const startIdx = text.search(/Evangelho\s*\([^)]+\)/i);
    let chunk = text.slice(startIdx);

    // fim
    const endMatch = chunk.search(/Palavra da Salvação/i);
    if (endMatch !== -1) chunk = chunk.slice(0, endMatch);

    // Remover cabeçalhos litúrgicos desnecessários
    // Mantemos apenas o texto do Evangelho, de preferência iniciando no primeiro versículo.
    // Normalmente aparece "Proclamação do Evangelho..." e depois "-Glória..."
    const gloryIdx = chunk.search(/Gl[oó]ria a v[oó]s,\s*Senhor/i);
    if (gloryIdx !== -1) {
      chunk = chunk.slice(gloryIdx);
      // corta a linha do "Glória..." para começar no texto
      const afterLine = chunk.indexOf("\n");
      if (afterLine !== -1) chunk = chunk.slice(afterLine + 1);
    } else {
      // se não achou, tenta cortar após a linha "Proclamação..."
      const proclIdx = chunk.search(/Proclama[cç][aã]o do Evangelho/i);
      if (proclIdx !== -1) {
        chunk = chunk.slice(proclIdx);
        const afterLine = chunk.indexOf("\n");
        if (afterLine !== -1) chunk = chunk.slice(afterLine + 1);
      }
    }

    // Limpeza final: remove linhas muito “rubrica”
    // (Aleluia, Louvai, Coragem etc. ficam se estiverem no texto; só tiramos rubricas padrão)
    chunk = chunk
      .replace(/^-?\s*Gl[oó]ria a v[oó]s,\s*Senhor\.?\s*$/gim, "")
      .replace(/^-?\s*Palavra do Senhor\.?\s*$/gim, "")
      .replace(/^-?\s*Gra[cç]as a Deus\.?\s*$/gim, "")
      .trim();

    // Se ficar vazio, falhar
    if (!chunk || chunk.length < 20) throw new Error("Texto do Evangelho vazio.");

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

        // alguns proxys podem “prefixar” conteúdo; tentamos achar o começo do HTML
        const htmlStart = raw.search(/<!doctype html|<html/i);
        const html = htmlStart !== -1 ? raw.slice(htmlStart) : raw;

        const text = stripTagsToText(html);
        const { ref, gospel } = extractGospel(text);

        refEl.textContent = ref;
        textEl.textContent = gospel;
        statusEl.textContent = "Atualiza diariamente.";
        return;
      } catch (e) {
        // tenta o próximo endpoint
      }
    }

    // se todos falharem:
    refEl.textContent = "Indisponível no momento";
    textEl.textContent = "Não foi possível carregar o Evangelho do dia. Tente recarregar mais tarde.";
    statusEl.textContent = "Falha de rede/CORS.";
  }

  run();
})();
