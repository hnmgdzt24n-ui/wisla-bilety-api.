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

    // Czyszczenie strony z niepotrzebnych elementów
    $('script, style, noscript, iframe, img, svg').remove();
    let bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    console.log("Analizuję tekst za pomocą AI (używam endpointu v1)...");
    
    const prompt = `Jesteś ekspertem analizującym stronę biletową. 
Znajdź mecze pierwszej drużyny Wisły Kraków.
Dla KAŻDEGO znalezionego meczu wyciągnij:
1. Pełną nazwę meczu (np. WISŁA KRAKÓW - GÓRNIK ŁĘCZNA).
2. Datę i godzinę meczu w formacie YYYY-MM-DDTHH:MM:00.
3. LICZBĘ SPRZEDANYCH BILETÓW.

UWAGA: Liczba sprzedanych biletów to ta liczba widoczna w okienku przy banerze. 
Nie pomyl jej z rokiem (1906, 2026) ani godziną. Jeśli nie widzisz liczby, wpisz 0.

Zwróć wynik JAKO CZYSTY JSON:
{
  "events": [
    {
      "id": "WISLA_MECZ", 
      "title": "WISŁA KRAKÓW - PRZECIWNIK",
      "date": "2026-04-15T19:00:00", 
      "tickets": 1000 
    }
  ]
}

Tekst strony:
${bodyText.substring(0, 30000)}`;

    // ZMIANA: używamy stabilnego endpointu /v1/ zamiast /v1beta/
    const aiReq = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
                response_mime_type: "application/json"
            }
        })
    });

    const responseAI = await aiReq.json();
    
    if (responseAI.error) {
        console.error("🔴 Błąd API:", JSON.stringify(responseAI.error, null, 2));
        throw new Error(responseAI.error.message);
    }

    if (!responseAI.candidates || responseAI.candidates.length === 0) {
        throw new Error("AI nie zwróciło żadnych wyników.");
    }

    let rawJson = responseAI.candidates[0].content.parts[0].text;
    let parsedData = JSON.parse(rawJson);

    const output = { 
      updated: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), 
      events: parsedData.events || []
    };
    
    fs.writeFileSync('events.json', JSON.stringify(output, null, 2));
    console.log("SUKCES! Dane zapisane.");

  } catch (error) {
    console.error("BŁĄD:", error.message);
    // Zapisujemy pusty plik, aby widget nie przestał działać całkowicie
    const fallback = { updated: "Błąd: " + error.message, events: [] };
    fs.writeFileSync('events.json', JSON.stringify(fallback, null, 2));
  }
}

run();
