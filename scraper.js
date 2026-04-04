import * as cheerio from 'cheerio';
import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
const URL = "https://bilety.wislakrakow.com/";

// Modele od najtańszych/najlżejszych do cięższych
const MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
];

async function callGemini(model, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );
  const data = await res.json();
  return data;
}

async function callWithFallback(prompt) {
  for (const model of MODELS) {
    console.log(`🔄 Próbuję model: ${model}...`);
    const data = await callGemini(model, prompt);

    if (data.error) {
      const code = data.error.code;
      if (code === 429 || code === 404) {
        console.warn(`⚠️  Model ${model} niedostępny (${code}), próbuję następny...`);
        continue;
      }
      throw new Error(data.error.message);
    }

    if (!data.candidates || data.candidates.length === 0) {
      console.warn(`⚠️  Model ${model} nie zwrócił wyników, próbuję następny...`);
      continue;
    }

    console.log(`✅ Działa model: ${model}`);
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error("Żaden model nie jest dostępny. Sprawdź klucz API lub limity.");
}

async function run() {
  try {
    console.log("Pobieram stronę biletów...");
    const response = await fetch(URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, noscript, iframe, img, svg').remove();​​​​​​​​​​​​​​​​
