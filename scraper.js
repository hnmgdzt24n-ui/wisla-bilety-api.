import * as cheerio from "cheerio";
import fs from "fs";

const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = "https://bilety.wislakrakow.com/";

async function run() {
  try {
    if (!API_KEY) throw new Error("Brak klucza API!");

    console.log("Pobieram stronę biletów...");
    const response = await fetch(TICKET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    // LEPSZE WYCIĄGANIE TEKSTU: Dodajemy spacje między elementami, żeby liczby się nie sklejały
    $('script, style, noscript, iframe, img, svg').remove();
    let bodyText = "";
    $('body *').each(function() {
      const text = $(this).contents().filter(function() {
        return this.nodeType === 3; // Tylko czysty tekst
      }).text().trim();
      if (text) bodyText += text + " ";
    });
    bodyText = bodyText.replace(/\s+/g, " ").trim();

    console.log("KROK 1: Wykrywanie modelu...");
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const modelsRes = await fetch(modelsUrl);
    const modelsData = await modelsRes.json();
    const bestModel = modelsData.models.find(m => m.name.includes("flash") && m.supportedGenerationMethods.includes("generateContent"));
    const modelPath = bestModel ? bestModel.name : "models/gemini-1.5-flash";

    console.log("Wybrano: " + modelPath + ". KROK 2: Analiza szczegółowa...");

    const prompt = `Jesteś ekspertem danych. W poniższym tekście ze strony Wisły Kraków znajdź mecze: GÓRNIK ŁĘCZNA, WREXHAM, PUSZCZA.
Dla każdego meczu musisz znaleźć liczbę SPRZEDANYCH BILETÓW. 

WSKAZÓWKA: Szukaj dużej liczby (zazwyczaj od 500 do 33000), która znajduje się blisko nazwy przeciwnika. 
KRYTYCZNE: 
- Nie ignoruj liczb! Jeśli widzisz liczbę typu 11425, 28410 lub 8450, to SĄ sprzedane bilety.
- Nie myl z rokiem 1906, 2026 ani godziną (np. 19:06).
- Jeśli widzisz liczbę w formacie "12 345" (ze spacją), połącz ją w 12345.

Zwróć wynik JAKO CZYSTY JSON:
{"events":[{"id":"MECZ","title":"WISŁA KRAKÓW - PRZECIWNIK","date":"2026-XX-XXTXX:XX:00","tickets":12345}]}

Tekst strony:
${bodyText.substring(0, 20000)}`;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${API_KEY}`;
    const aiReq = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await aiReq.json();
    let rawJson = data.candidates[0].content.parts[0].text;
    rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(rawJson);
    const output = {
      updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      events: parsedData.events || [],
    };

    fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
    console.log("SUKCES! Wyciągnięte dane: " + JSON.stringify(output.events));

  } catch (error) {
    console.error("BŁĄD: " + error.message);
    fs.writeFileSync("events.json", JSON.stringify({ updated: "Błąd AI", events: [] }, null, 2));
  }
}

run();
