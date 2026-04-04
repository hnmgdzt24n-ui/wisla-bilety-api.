import * as cheerio from "cheerio";
import fs from "fs";

// Używamy Twojego klucza bezpośrednio (lub z env na GitHubie)
const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyCSOMwvSg4SwuTeStt8dAPnryDbiTDRSEk";
const TICKET_URL = "https://bilety.wislakrakow.com/";

// Kolejność: najpierw te, które u Ciebie działały, potem nowsze/mocniejsze
const MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-2.0-flash-exp"
];

async function callGemini(model, prompt) {
  // Używamy endpointu v1 dla większej stabilności
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        responseMimeType: "application/json" 
      },
    }),
  });
  return await res.json();
}

async function callWithFallback(prompt) {
  for (const model of MODELS) {
    console.log("Próbuję model: " + model);
    try {
      const data = await callGemini(model, prompt);

      if (data.error) {
        console.warn(`Model ${model} zwrócił błąd: ${data.error.message}`);
        continue;
      }

      if (!data.candidates || data.candidates.length === 0) {
        console.warn(`Model ${model} nie zwrócił treści.`);
        continue;
      }

      console.log("Sukces! Zadziałał model: " + model);
      return data.candidates[0].content.parts[0].text;
    } catch (e) {
      console.warn(`Błąd połączenia z modelem ${model}: ${e.message}`);
      continue;
    }
  }
  throw new Error("Żaden model nie odpowiedział poprawnie.");
}

async function run() {
  try {
    console.log("Pobieram stronę biletów...");
    const response = await fetch(TICKET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Czyszczenie kodu strony
    $("script, style, noscript, iframe, img, svg").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    console.log("Analizuję tekst za pomocą AI...");

    const prompt = `Jesteś ekspertem biletowym. Znajdź mecze Wisły Kraków.
Dla każdego meczu wyciągnij:
1. Pełną nazwę (WISŁA KRAKÓW - PRZECIWNIK).
2. Datę w formacie YYYY-MM-DDTHH:MM:00.
3. LICZBĘ SPRZEDANYCH BILETÓW (to te liczby w okienkach przy banerach).

KRYTYCZNE: Nie pomyl biletów z rokiem 1906 ani 2026. Jeśli nie jesteś pewien liczby, wpisz 0.
Zwróć CZYSTY JSON: {"events":[{"id":"ID","title":"WISŁA KRAKÓW - ...","date":"2026-04-15T19:00:00","tickets":1000}]}

Tekst strony:
${bodyText.substring(0, 25000)}`;

    const rawJson = await callWithFallback(prompt);
    const parsedData = JSON.parse(rawJson);

    const output = {
      updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      events: parsedData.events || [],
    };

    fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
    console.log("KONIEC! Plik events.json został zaktualizowany.");

  } catch (error) {
    console.error("BŁĄD KRYTYCZNY: " + error.message);
    const fallback = { updated: "Błąd: " + error.message, events: [] };
    fs.writeFileSync("events.json", JSON.stringify(fallback, null, 2));
  }
}

run();
