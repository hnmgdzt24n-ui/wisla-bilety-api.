import * as cheerio from "cheerio";
import fs from "fs";

// Upewnij się, że tu są PROSTE cudzysłowy
const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = "https://bilety.wislakrakow.com/";

const MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-pro"
];

async function callGemini(model, prompt) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + API_KEY;
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
  });
  return await res.json();
}

async function callWithFallback(prompt) {
  for (const model of MODELS) {
    console.log("Próbuje model: " + model);
    try {
      const data = await callGemini(model, prompt);
      if (data.error) {
        console.warn("Model " + model + " błąd: " + data.error.message);
        continue;
      }
      if (!data.candidates || data.candidates.length === 0) continue;

      let text = data.candidates[0].content.parts[0].text;
      return text.replace(/```json/g, "").replace(/```/g, "").trim();
    } catch (e) {
      continue;
    }
  }
  throw new Error("Żaden model nie odpowiedział.");
}

async function run() {
  try {
    console.log("Pobieram stronę biletów...");
    const response = await fetch(TICKET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, img, svg").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    console.log("Analizuję tekst za pomocą AI...");

    const prompt = `Jesteś ekspertem biletowym Wisły Kraków. 
Znajdź mecze: Górnik Łęczna, Wrexham, Puszcza.
Dla każdego meczu wyciągnij:
1. Pełną nazwę (np. WISŁA KRAKÓW - WREXHAM AFC).
2. Datę w formacie YYYY-MM-DDTHH:MM:00.
3. LICZBĘ SPRZEDANYCH BILETÓW (to liczba w okienku przy banerze).

Zwróć TYLKO czysty JSON: {"events":[{"id":"ID","title":"NAZWA","date":"DATA","tickets":1234}]}

Tekst strony:
${bodyText.substring(0, 25000)}`;

    const rawJson = await callWithFallback(prompt);
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
