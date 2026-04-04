import * as cheerio from "cheerio";
import fs from "fs";

// Klucz i URL - Upewnij się, że w GitHubie w Secrets masz poprawny klucz!
const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = "https://bilety.wislakrakow.com/";

// Używamy tylko sprawdzonego modelu na stabilnym punkcie v1
const MODEL = "gemini-1.5-flash";

async function run() {
  try {
    console.log("Pobieram stronę biletów...");
    const response = await fetch(TICKET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Usuwamy zbędne elementy, żeby AI miało przejrzysty tekst
    $("script, style, noscript, iframe, img, svg").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    console.log("Analizuję tekst za pomocą AI (v1/gemini-1.5-flash)...");

    const prompt = `Jesteś ekspertem biletowym Wisły Kraków. 
Znajdź mecze: Górnik Łęczna, Wrexham, Puszcza.
Dla każdego meczu wyciągnij:
1. Pełną nazwę (np. WISŁA KRAKÓW - WREXHAM AFC).
2. Datę w formacie YYYY-MM-DDTHH:MM:00.
3. LICZBĘ SPRZEDANYCH BILETÓW (to liczba w okienku przy banerze).

Zwróć WYŁĄCZNIE czysty JSON: 
{"events":[{"id":"MECZ1","title":"NAZWA","date":"DATA","tickets":1234}]}

Tekst strony:
${bodyText.substring(0, 25000)}`;

    // STABILNY ADRES V1
    const url = "https://generativelanguage.googleapis.com/v1/models/" + MODEL + ":generateContent?key=" + API_KEY;
    
    const aiReq = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await aiReq.json();

    if (data.error) {
      throw new Error("Błąd Google API: " + data.error.message);
    }

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("AI nie zwróciło żadnej treści.");
    }

    let rawJson = data.candidates[0].content.parts[0].text;
    
    // Czyszczenie z ewentualnych znaczników markdown
    rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(rawJson);

    const output = {
      updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      events: parsedData.events || [],
    };

    fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
    console.log("SUKCES! Dane zapisane w events.json");
    console.log("Znaleziono meczów: " + (parsedData.events ? parsedData.events.length : 0));

  } catch (error) {
    console.error("BŁĄD KRYTYCZNY: " + error.message);
    const fallback = { updated: "Błąd: " + error.message, events: [] };
    fs.writeFileSync("events.json", JSON.stringify(fallback, null, 2));
  }
}

run();
