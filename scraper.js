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

    // Usuwamy kod, żeby został sam czytelny tekst
    $('script, style, noscript, iframe, img, svg').remove();
    let bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    console.log("Analizuję tekst za pomocą AI...");
    
    const prompt = `Jesteś ekspertem analizującym stronę biletową. 
Znajdź mecze Wisły Kraków widoczne w tekście (m.in. Górnik Łęczna, Wrexham, Puszcza).
Dla KAŻDEGO znalezionego meczu wyciągnij:
1. Nazwę przeciwnika
2. Datę i godzinę meczu (jeśli jest podana wprost, zapisz w formacie YYYY-MM-DDTHH:MM:00)
3. Dokładną liczbę WOLNYCH MIEJSC (dostępnych biletów).

UWAGA KRYTYCZNA: Nie myl liczby biletów z godziną (np. 19:06), ceną w PLN ani rokiem! Jeśli w tekście przy danym meczu nie jest napisane wprost "dostępne bilety / wolne miejsca: X", absolutnie nic nie zmyślaj i jako liczbę biletów wpisz 0.

Zwróć wynik JAKO CZYSTY JSON:
{
  "events": [
    {
      "id": "WISLAWREXHAM", 
      "title": "WISŁA KRAKÓW - WREXHAM AFC",
      "date": "2026-07-11T15:00:00", 
      "tickets": 0 
    }
  ]
}

Tekst strony:
${bodyText.substring(0, 30000)}`;

    const aiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: "application/json" }
        })
    });

    const responseAI = await aiReq.json();
    let rawJson = responseAI.candidates[0].content.parts[0].text;
    let parsedData = JSON.parse(rawJson);

    const output = { 
      updated: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), 
      events: parsedData.events || []
    };
    
    fs.writeFileSync('events.json', JSON.stringify(output, null, 2));
    console.log("SUKCES! Znaleziono mecze: ", JSON.stringify(output.events));

  } catch (error) {
    console.error("BŁĄD KRYTYCZNY:", error);
    process.exit(1);
  }
}

run();
