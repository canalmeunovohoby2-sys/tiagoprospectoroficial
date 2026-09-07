const API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      generationConfig: { temperature: 0, maxOutputTokens: 10 },
      contents: [{ role: "user", parts: [{ text: "Responda exatamente com a palavra: OK" }] }],
    }),
  }
);

const data = await res.json();
console.log("Status:", res.status);
if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
  console.log("Resposta:", data.candidates[0].content.parts[0].text);
}
if (data.error) {
  console.log("Erro:", data.error.message);
}
console.log("Modelo usado:", data.model || "gemini-2.5-flash");