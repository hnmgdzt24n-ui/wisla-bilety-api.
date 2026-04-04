import * as cheerio from 'cheerio';
import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
const URL = "https://bilety.wislakrakow.com/";

async function run() {
  try {
    console.log("Pobieram stronę biletów...");
    const response = await fetch(URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, noscript, iframe, img, svg').remove();
    let bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    console.log("Analizuję tekst za pomocą AI...");
    
    const prompt = `Jesteś ekspertem biletowym. Znajdź mecze Wisły Kraków (np. Łęczna, Wrexham, Puszcza).
Dla każdego meczu wyciągnij:
1. Pełną nazwę (WISŁA KRAKÓW - PRZECIWNIK).
2. Datę (YYYY-MM-DDTHH:MM:00).
3. LICZBĘ SPRZEDANYCH BILETÓW (liczba z okienka na banerze). 
KRYTYCZNE: Nie pomyl biletów z rokiem 1906, 2026 ani godziną.

Zwróć wynik JAKO CZYSTY JSON:
{
  "events": [
    {
      "id": "MECZ_ID", 
      "title": "WISŁA KRAKÓW - ...",
      "date": "2026-04-15T19:00:00", 
      "tickets": 1000 
    }
  ]
}

Tekst strony:
${bodyText.substring(0, 30000)}`;

    const aiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          responseMimeType: "application/json" 
        }
      })
    });

    const responseAI = await aiReq.json();
    
    if (responseAI.error) {
      console.error("🔴 Błąd API:", JSON.stringify(responseAI.error, null, 2));
      throw new Error(responseAI.error.message);
    }

    if (!responseAI.candidates || responseAI.candidates.length === 0) {
      throw new Error("AI nie zwróciło wyników.");
    }

    let rawJson = responseAI.candidates[0].content.parts[0].text;
    let parsedData = JSON.parse(rawJson);

    const output = { 
      updated: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), 
      events: parsedData.events || []
    };
    
    fs.writeFileSync('events.json', JSON.stringify(output, null, 2));
    console.log("✅ SUKCES! Znaleziono mecze i zapisano plik.");

  } catch (error) {
    console.error("❌ BŁĄD:", error.message);
    const fallback = { updated: "Błąd: " + error.message, events: [] };
    fs.writeFileSync('events.json', JSON.stringify(fallback, null, 2));
  }
}

run();
