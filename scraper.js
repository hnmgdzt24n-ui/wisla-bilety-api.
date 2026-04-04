import * as cheerio from "cheerio";
import fs from "fs";

const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = "https://bilety.wislakrakow.com/";

async function run() {
  try {
    if (!API_KEY) throw new Error("Brak klucza API w Secrets!");

    console.log("Pobieram stronę biletów...");
    const response = await fetch(TICKET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    // USUWANIE ŚMIECI I PRECYZYJNE WYCIĄGANIE TEKSTU
    $('script, style, noscript, iframe, img, svg').remove();
    
    // Zbieramy tekst z przerwami, żeby liczby biletów się nie zlewały
    let bodyText = "";
    $('div, span, p, b, strong, h1, h2, h3').each(function() {
      const txt = $(this).contents().filter(function() {
        return this.nodeType === 3; 
      }).text().trim();
      if (txt) bodyText += txt + " | ";
    });
    bodyText = bodyText.replace(/\s+/g, " ").trim();

    console.log("KROK 1: Wykrywanie dostępnego modelu...");
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const modelsRes = await fetch(modelsUrl);
    const modelsData = await modelsRes.json();
    
    // Wybieramy pierwszy działający model Flash
    const bestModel = modelsData.models.find(m => 
      m.name.includes("flash") && m.supportedGenerationMethods.includes("generateContent")
    );
    const modelPath = bestModel ? bestModel.name : "models/gemini-1.5-flash";
    console.log("Używam modelu: " + modelPath);

    console.log("KROK 2: Analiza danych (Tryb Detektywa)...");

    const prompt = `Jesteś analitykiem biletowym. W tekście strony Wisły Kraków znajdź mecze pierwszej drużyny (np. Łęczna, Wrexham, Puszcza).
Dla każdego meczu wyciągnij:
1. Pełną nazwę (WISŁA KRAKÓW - PRZECIWNIK).
2. Datę (YYYY-MM-DDTHH:MM:00).
3. LICZBĘ SPRZEDANYCH BILETÓW. 

UWAGA: Szukaj liczb typu 19257, 11000, 8450. Są to liczby biletów widoczne w okienkach na banerach. 
- Nie ignoruj ich! 
- Jeśli liczba występuje obok nazwy meczu lub słowa "Subskrypcja", to jest to liczba sprzedanych biletów.
- Nie myl z rokiem 1906, 2026 ani godziną.

Zwróć wynik JAKO CZYSTY JSON:
{
  "events": [
    {
      "id": "MECZ",
      "title": "WISŁA KRAKÓW - ...",
      "date": "2026-04-06T11:30:00",
      "tickets": 19257
    }
  ]
}

Tekst strony:
${bodyText.substring(0, 20000)}`;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${API_KEY}`;
    const aiReq = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await aiReq.json();
    if (data.error) throw new Error(data.error.message);

    let rawJson = data.candidates[0].content.parts[0].text;
    rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(rawJson);
    
    // Filtrujemy, żeby nie zapisywać "null" lub "0" jeśli AI znowu spanikuje
    const events = (parsedData.events || []).map(e => ({
      ...e,
      tickets: e.tickets || 0
    }));

    const output = {
      updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      events: events
    };

    fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
    console.log("SUKCES! Znaleziono meczów: " + events.length);
    console.log("Dane: " + JSON.stringify(events));

  } catch (error) {
    console.error("BŁĄD KRYTYCZNY: " + error.message);
    fs.writeFileSync("events.json", JSON.stringify({ updated: "Błąd: " + error.message, events: [] }, null, 2));
  }
}

run();
