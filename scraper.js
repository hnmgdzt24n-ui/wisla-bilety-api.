import * as cheerio from "cheerio";
import fs from "fs";

// Pobieranie klucza z GitHub Secrets
const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = "https://bilety.wislakrakow.com/";

async function run() {
  try {
    if (!API_KEY) {
      throw new Error("Brak klucza API! Sprawdź Secrets w ustawieniach GitHuba.");
    }

    console.log("Pobieram stronę biletów...");
    const response = await fetch(TICKET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Czyszczenie strony ze zbędnego kodu
    $("script, style, noscript, iframe, img, svg").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    console.log("KROK 1: Wykrywanie dostępnego modelu...");
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const modelsRes = await fetch(modelsUrl);
    const modelsData = await modelsRes.json();

    if (modelsData.error) {
      throw new Error("Błąd klucza API: " + modelsData.error.message);
    }

    // Wybór najlepszego dostępnego modelu Flash
    const bestModel = modelsData.models.find(m => 
      m.name.includes("flash") && 
      m.supportedGenerationMethods.includes("generateContent")
    );

    if (!bestModel) {
      throw new Error("Nie znaleziono modelu Flash na Twoim koncie.");
    }

    const modelPath = bestModel.name; 
    console.log("Wybrano model: " + modelPath);

    console.log("KROK 2: Analiza biletów...");

    const prompt = `Jesteś ekspertem biletowym Wisły Kraków. 
Znajdź mecze: Górnik Łęczna, Wrexham, Puszcza.
Dla każdego meczu wyciągnij:
1. Pełną nazwę (np. WISŁA KRAKÓW - WREXHAM AFC).
2. Datę w formacie YYYY-MM-DDTHH:MM:00.
3. LICZBĘ SPRZEDANYCH BILETÓW (to liczba w okienku przy banerze).

Zwróć WYŁĄCZNIE czysty JSON w formacie:
{"events":[{"id":"MECZ1","title":"NAZWA","date":"DATA","tickets":1234}]}

Tekst strony:
${bodyText.substring(0, 25000)}`;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${API_KEY}`;
    
    const aiReq = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await aiReq.json();

    if (data.error) {
      throw new Error("Błąd AI: " + data.error.message);
    }

    let rawJson = data.candidates[0].content.parts[0].text;
    // Usuwanie ewentualnych ramek ```json ... ```
    rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(rawJson);

    const output = {
      updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      events: parsedData.events || [],
    };

    fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
    console.log("SUKCES! Dane zapisane.");

  } catch (error) {
    console.error("BŁĄD: " + error.message);
    const fallback = { updated: "Błąd: " + error.message, events: [] };
    fs.writeFileSync("events.json", JSON.stringify(fallback, null, 2));
  }
}

run();
