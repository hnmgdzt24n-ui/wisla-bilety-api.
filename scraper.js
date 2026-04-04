import puppeteer from "puppeteer";
import fs from "fs";

// Klucz i URL - Z GITHUB SECRETS!
const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = "https://bilety.wislakrakow.com/";

async function run() {
  let browser;
  try {
    if (!API_KEY) throw new Error("Brak klucza API w Secrets!");

    console.log("KROK 1: Uruchamiam wirtualną przeglądarkę...");
    browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Wymagane na GitHub Actions
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1600 }); // Ustawiamy okno, żeby widzieć banery

    console.log("KROK 2: Wchodzę na stronę biletów...");
    await page.goto(TICKET_URL, { waitUntil: 'networkidle2' }); // Czekamy, aż JavaScript się załaduje!

    console.log("KROK 3: Robię zdjęcie strony...");
    const screenshotPath = 'screenshot.png';
    await page.screenshot({ path: screenshotPath }); // Zapisujemy zdjęcie na dysku
    console.log("Zdjęcie zrobione!");

    // Konwersja zdjęcia na format Base64 dla Gemini
    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');

    await browser.close();

    console.log("KROK 4: Wykrywanie dostępnego modelu (Flash)...");
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const modelsRes = await fetch(modelsUrl);
    const modelsData = await modelsRes.json();
    
    // Szukamy modelu Flash, który obsługuje generowanie treści
    const bestModel = modelsData.models.find(m => 
      m.name.includes("flash") && m.supportedGenerationMethods.includes("generateContent")
    );
    // Używamy v1beta dla multimodalności
    const modelPath = bestModel ? `https://generativelanguage.googleapis.com/v1beta/${bestModel.name}` : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash`;
    console.log("Używam modelu: " + modelPath.split('/').pop());

    console.log("KROK 5: Wysyłam zdjęcie do AI (Multimodal Vision)...");

    const prompt = `Jesteś ekspertem biletowym. Przeanalizuj dołączone ZDJĘCIE strony Wisły Kraków.
Dla każdego meczu widocznego na banerze (np. Łęczna, Wrexham, Puszcza) wyciągnij:
1. Pełną nazwę (WISŁA KRAKÓW - PRZECIWNIK).
2. Datę (np. 06.04.2026, godz. 11:30) sformatowaną jako: YYYY-MM-DDTHH:MM:00.
3. LICZBĘ SPRZEDANYCH BILETÓW. 

UWAGA: Liczba sprzedanych biletów znajduje się w szarym okienku z ikonką wykresu w lewym górnym rogu każdego banera. Szukaj liczb typu 19257, 11000, 8450.
KRYTYCZNE: 
- Nie ignoruj ich, te liczby TAM SĄ na obrazku!
- Nie myl z rokiem 1906, 2026 ani godziną.

Zwróć TYLKO czysty JSON w formacie:
{"events":[{"id":"MECZ_ID","title":"NAZWA","date":"DATA","tickets":12345}]}
Nie dodawaj żadnych innych znaków poza JSON.`;

    // Budowanie żądania multimodalnego (tekst + obraz)
    const generateUrl = `${modelPath}:generateContent?key=${API_KEY}`;
    const aiReq = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/png", data: base64Image } } // Dodajemy zdjęcie!
          ]
        }],
        generationConfig: { 
            responseMimeType: "application/json" // Wymuszamy JSON output
        }
      })
    });

    const data = await aiReq.json();
    if (data.error) throw new Error(data.error.message);

    let rawJson = data.candidates[0].content.parts[0].text;
    rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(rawJson);
    const events = parsedData.events || [];

    const output = {
      updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      events: events
    };

    fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
    console.log("SUKCES! Dane zapisane w events.json");
    console.log("Znaleziono meczów: " + events.length);
    console.log("Dane: " + JSON.stringify(events));

  } catch (error) {
    console.error("BŁĄD KRYTYCZNY: " + error.message);
    if (browser) await browser.close();
    fs.writeFileSync("events.json", JSON.stringify({ updated: "Błąd Vision: " + error.message, events: [] }, null, 2));
  }
}

run();
