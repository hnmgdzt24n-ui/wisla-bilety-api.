
import * as cheerio from 'cheerio';
import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
const URL = "https://bilety.wislakrakow.com/";

async function run() {
  try {
    console.log("Pobieranie strony Wisły...");
    const response = await fetch(URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    const bodyText = $('body').text();
    const matches = bodyText.match(/\b\d{1,2}\s?\d{3}\b|\b\d{4,5}\b/g) || [];
    const uniqueNums = [...new Set(matches.map(n => parseInt(n.replace(/\s/g, ''))))]
                       .filter(n => n > 500 && n < 35000 && n !== 1906 && n !== 2024 && n !== 2025 && n !== 2026);

    let finalTargets = [];
    uniqueNums.forEach(num => {
        let foundEl = null;
        $('*').each(function() {
            // Szuka tekstu bezpośrednio w elemencie (bez "dzieci")
            let directText = $(this).clone().children().remove().end().text().replace(/\s/g, '');
            if(directText.includes(num.toString())) {
                foundEl = $(this);
                return false; 
            }
        });

        if(foundEl) {
             let container = foundEl;
             for(let i=0; i<4; i++) {
                 if(container.parent().length > 0 && container.parent().prop('tagName') !== 'BODY') {
                     container = container.parent();
                 }
             }
             
             let imgSrc = container.find('img').not('[src*="logo"]').first().attr('src');
             let targetText = "";
             container.find('h1, h2, h3, h4, strong, .title, .name').each(function() {
                 targetText += $(this).text() + " ";
             });
             
             if (targetText.trim().length < 3) targetText = container.text().replace(/\n/g, ' ').substring(0, 100);
             
             finalTargets.push({ tickets: num, imgUrl: imgSrc, text: targetText.trim() });
        }
    });

    finalTargets.sort((a, b) => b.tickets - a.tickets);
    finalTargets = finalTargets.slice(0, 3);

    let liveEvents = [];

    for (let match of finalTargets) {
         let aiFallbackTitle = "MECZ WISŁY";
         if (match.text && match.text.length > 3 && !match.text.toUpperCase().includes("SUBSKRYPCJA")) {
             aiFallbackTitle = match.text.replace(/BILETY NA MECZ|KUP BILET/gi, '').replace(/\d{1,2}\s?\d{3}/g, '').trim().substring(0, 25).toUpperCase();
         }

         let parts = [
             { text: "Wyciągnij nazwy drużyn. Zwróć TYLKO kod JSON: {\"title\": \"DRUŻYNA A - DRUŻYNA B\", \"date\": \"YYYY-MM-DDTHH:MM:00\"}. Reguła krytyczna: Zignoruj słowa nawigacyjne strony (Subskrypcja, Voucher, Logowanie). Jeśli to nie mecz, wpisz w title \"KARNETY / INNE\". Tekst do analizy: " + match.text }
         ];

         if (match.imgUrl) {
             try {
                 let urlToFetch = match.imgUrl.startsWith('http') ? match.imgUrl : URL + match.imgUrl;
                 let imgRes = await fetch(urlToFetch);
                 let arrayBuffer = await imgRes.arrayBuffer();
                 let base64Image = Buffer.from(arrayBuffer).toString('base64');
                 parts.push({ inline_data: { mime_type: "image/jpeg", data: base64Image } });
             } catch(e) { console.log("Błąd pobierania obrazka, idę z samym tekstem."); }
         }

         console.log("Wysyłam do Gemini dla biletów:", match.tickets);
         let aiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ contents: [{ parts: parts }] })
         });

         let response = await aiReq.json();
         try {
             let rawText = response.candidates[0].content.parts[0].text;
             let jsonStr = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
             let aiData = JSON.parse(jsonStr);

             let title = aiData.title || aiFallbackTitle;
             if (title.toUpperCase().includes("SUBSKRYPCJA") || title.toUpperCase().includes("VOUCHER")) title = "MECZ WISŁY";
             let matchId = title.replace(/\s/g, '').substring(0, 10);

             liveEvents.push({ id: matchId, title: title, date: (aiData.date || ""), tickets: match.tickets });
         } catch(err) {
             console.log("Błąd odpowiedzi AI");
             liveEvents.push({ id: "EVT_"+match.tickets, title: aiFallbackTitle, date: "", tickets: match.tickets });
         }
    }

    fs.writeFileSync('events.json', JSON.stringify({ updated: new Date().toLocaleString('pl-PL'), events: liveEvents }, null, 2));
    console.log("SUKCES! Zapisano events.json.");

  } catch (error) {
    console.error("Główny błąd skryptu:", error);
  }
}

run();
