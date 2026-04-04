const cheerio = require(“cheerio”);
const fs = require(“fs”);

const API_KEY = process.env.GEMINI_API_KEY;
const TICKET_URL = “https://bilety.wislakrakow.com/”;

const MODELS = [
“gemini-2.0-flash-lite”,
“gemini-2.0-flash”,
“gemini-1.5-flash-8b”,
“gemini-1.5-pro”,
];

async function callGemini(model, prompt) {
const res = await fetch(
“https://generativelanguage.googleapis.com/v1beta/models/” + model + “:generateContent?key=” + API_KEY,
{
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
contents: [{ parts: [{ text: prompt }] }],
generationConfig: { responseMimeType: “application/json” },
}),
}
);
return await res.json();
}

async function callWithFallback(prompt) {
for (const model of MODELS) {
console.log(“Probuje model: “ + model);
const data = await callGemini(model, prompt);

```
if (data.error) {
  const code = data.error.code;
  if (code === 429 || code === 404) {
    console.warn("Model " + model + " niedostepny (" + code + "), probuje nastepny...");
    continue;
  }
  throw new Error(data.error.message);
}

if (!data.candidates || data.candidates.length === 0) {
  console.warn("Model " + model + " nie zwrocil wynikow, probuje nastepny...");
  continue;
}

console.log("Dziala model: " + model);
return data.candidates[0].content.parts[0].text;
```

}

throw new Error(“Zaden model nie jest dostepny. Sprawdz klucz API lub limity.”);
}

async function run() {
try {
console.log(“Pobieram strone biletow…”);
const response = await fetch(TICKET_URL);
const html = await response.text();
const $ = cheerio.load(html);

```
$("script, style, noscript, iframe, img, svg").remove();
const bodyText = $("body").text().replace(/\s+/g, " ").trim();

console.log("Analizuje tekst za pomoca AI...");

const prompt = [
  "Jestes ekspertem biletowym. Znajdz mecze Wisly Krakow.",
  "Dla kazdego meczu wyciagnij:",
  "1. Pelna nazwe (WISLA KRAKOW - PRZECIWNIK).",
  "2. Date w formacie YYYY-MM-DDTHH:MM:00.",
  "3. LICZBE SPRZEDANYCH BILETOW (liczba z okienka na banerze).",
  "KRYTYCZNE: Nie pomyl biletow z rokiem 1906, 2026 ani godzina.",
  'Zwroc CZYSTY JSON: {"events":[{"id":"ID","title":"WISLA KRAKOW - ...","date":"2026-04-15T19:00:00","tickets":1000}]}',
  "Tekst strony:",
  bodyText.substring(0, 30000),
].join("\n");

const rawJson = await callWithFallback(prompt);
const parsedData = JSON.parse(rawJson);

const output = {
  updated: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
  events: parsedData.events || [],
};

fs.writeFileSync("events.json", JSON.stringify(output, null, 2));
console.log("SUKCES! Zapisano events.json");
```

} catch (error) {
console.error(“BLAD: “ + error.message);
const fallback = { updated: “Blad: “ + error.message, events: [] };
fs.writeFileSync(“events.json”, JSON.stringify(fallback, null, 2));
}
}

run();
