(function(){
  const refEl = document.getElementById("ref");
  const textEl = document.getElementById("text");
  const statusEl = document.getElementById("status");
  const sourceLink = document.getElementById("sourceLink");
  const todayEl = document.getElementById("today");

  // Se isso não rodar no Notion, a data vai continuar "—"
  try{
    const d = new Date();
    const fmt = new Intl.DateTimeFormat("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
    todayEl.textContent = fmt.format(d);
  }catch(e){
    // fallback simples
    todayEl.textContent = new Date().toLocaleDateString("pt-BR");
  }

  // Proxys (tentamos 2 opções, com timeout)
  const bgJson = "https://www.biblegateway.com/votd/get?format=json&version=DRA";
  const endpoints = [
    "https://r.jina.ai/" + bgJson,
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(bgJson),
  ];

  function stripHtml(html){
    const tmp = document.createElement("div");
    tmp.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
    const t = (tmp.textContent || tmp.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
    return t;
  }

  function extractJson(text){
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("JSON não encontrado");
    return JSON.parse(text.slice(start, end + 1));
  }

  async function fetchWithTimeout(url, ms){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try{
      const res = await fetch(url, { cache:"no-store", signal: controller.signal });
      if(!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(){
    for (let i=0;i<endpoints.length;i++){
      const url = endpoints[i];
      try{
        statusEl.textContent = "Carregando…";
        const raw = await fetchWithTimeout(url, 7000);
        const data = extractJson(raw);

        const reference = data.reference || (data.votd && data.votd.reference) || "Versículo do Dia";
        const htmlText  = data.text || (data.votd && data.votd.text) || "";
        if(!htmlText) throw new Error("sem texto");

        refEl.textContent = reference;
        textEl.textContent = stripHtml(htmlText);

        const link = data.url || ("https://www.biblegateway.com/passage/?search=" + encodeURIComponent(reference) + "&version=DRA");
        sourceLink.href = link;

        statusEl.textContent = "Atualiza automaticamente.";
        return;
      }catch(e){
        // tenta o próximo endpoint
      }
    }

    // Se tudo falhar:
    refEl.textContent = "Indisponível no momento";
    textEl.textContent = "Toque em “BibleGateway” para abrir o Versículo do Dia.";
    statusEl.textContent = "Falha de rede/CORS no embed.";
    sourceLink.href = "https://www.biblegateway.com/votd";
  }

  run();
})();
