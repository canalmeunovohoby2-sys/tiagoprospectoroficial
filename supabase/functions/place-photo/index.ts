// Proxy da Google Places Photo API.
// A API key fica apenas no servidor (secret GOOGLE_PLACES_API_KEY) — nunca no
// HTML do cliente. O front usa <img src=".../place-photo?name=places/.../photos/...">
// com lazy loading; a resposta é cacheável na CDN/Edge.
const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_\-]+\/photos\/[A-Za-z0-9_\-]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: CORS });

  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const requested = Number(url.searchParams.get("w") ?? "800");
  const maxWidth = Math.min(1600, Math.max(120, Number.isFinite(requested) ? requested : 800));

  if (!PHOTO_NAME_RE.test(name)) {
    return new Response("invalid photo reference", { status: 400, headers: CORS });
  }
  if (!GOOGLE_KEY) {
    return new Response("photo service unavailable", { status: 503, headers: CORS });
  }

  const target = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidth}&key=${GOOGLE_KEY}`;
  try {
    const upstream = await fetch(target, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      return new Response("photo unavailable", { status: upstream.status === 404 ? 404 : 502, headers: CORS });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return new Response("photo error", { status: 502, headers: CORS });
  }
});
