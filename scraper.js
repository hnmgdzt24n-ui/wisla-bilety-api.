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
    
    const prompt = `Jesteś ekspertem analizującym stronę biletową. 
Znajdź mecze pierwszej drużyny Wisły Kraków (np. Górnik Łęczna, Wrexham, Puszcza itp.).
Dla KAŻDEGO znalezionego meczu wyciągnij:
1. Pełną nazwę meczu (np. WISŁA KRAKÓW - GÓRNIK ŁĘCZNA).
2. Datę i godzinę meczu w formacie YYYY-MM-DDTHH:MM:00 (np. 2026-04-15T19:00:00).
3. LICZBĘ DOSTĘPNYCH BILETÓW.

UWAGA DOTYCZĄCA BILETÓW:
Na stronie liczba dostępnych biletów pojawia się jako samotna liczba (np. 15302, 850, 4120) umieszczona w okienku przy banerze meczu.
Znajdź tę liczbę w tekście w okolicach danego meczu. 
KRYTYCZNE: Nie pomyl liczby biletów z rokiem założenia klubu (np. 1906, 1946), obecnym rokiem (2026), godzinami (np. 19:06, 17:30) ani cenami. Jeśli liczby ewidentnie nie ma, wpisz 0.

Zwróć wynik JAKO CZYSTY JSON:
{
  "events": [
    {
      "id": "WISLAGORNIK", 
      "title": "WISŁA KRAKÓW - GÓRNIK ŁĘCZNA",
      "date": "2026-04-15T19:00:00", 
      "tickets": 15300 
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
    
    // Zabezpieczenie przed brakiem odpowiedzi od AI
    if (!responseAI.candidates) {
        console.error("🔴 Błąd od Google Gemini API:", JSON.stringify(responseAI, null, 2));
        throw new Error("AI nie zwróciło poprawnej odpowiedzi.");
    }

    let rawJson = responseAI.candidates[0].content.parts[0].text;
    let parsedData = JSON.parse(rawJson);

    const output = { 
      updated: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), 
      events: parsedData.events || []
    };
    
    fs.writeFileSync('events.json', JSON.stringify(output, null, 2));
    console.log("SUKCES! Znaleziono mecze: ", JSON.stringify(output.events));

  } catch (error) {
    console.error("BŁĄD KRYTYCZNY:", error.message);
    
    // Zapisujemy pusty plik awaryjny, żeby widget w telefonie miał co odczytać
    const safeOutput = { 
      updated: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }) + " (Czkawka AI)", 
      events: []
    };
    fs.writeFileSync('events.json', JSON.stringify(safeOutput, null, 2));
    console.log("Stworzono awaryjny plik events.json, żeby nie zawiesić telefonu.");
  }
}

run();
