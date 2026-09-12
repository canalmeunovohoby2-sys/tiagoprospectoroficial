# mapScraper — microserviço (segunda fonte de leads)

Encapsula o scraper Python [christivn/mapScraper](https://github.com/christivn/mapScraper)
(vendored em `scraper.py`) atrás de um endpoint HTTP, no mesmo padrão do
`gmaps-scraper`, para ser consumido pela Edge Function `search-places`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Health check |
| GET | `/scrape-get?query=...&max_places=20&lang=pt&country=br&concurrency=3` | JSON array com os estabelecimentos |

Campos retornados (CSV original do mapScraper): `id, url_place, title, category,
address, phoneNumber, completePhoneNumber, domain, url, coor ("lat,lng"), stars,
reviews, source_query`.

## Como habilitar/desabilitar a fonte

A Edge Function consulta as fontes habilitadas em paralelo e mescla os resultados
(dedupe por `place_id`; empate → registro com mais campos; cada lead guarda `source`).

Secrets do Supabase (projeto `efgwszjjtjebqdzziqfs`):

```bash
# mapScraper (esta fonte)
supabase secrets set "MAP_SCRAPER_URL=https://<servico>.up.railway.app" "MAP_SCRAPER_ENABLED=true"

# Google Maps scraper (fonte já existente)
supabase secrets set "GMAPS_SCRAPER_ENABLED=true"
```

Para **desligar** uma fonte, basta `MAP_SCRAPER_ENABLED=false` (ou
`GMAPS_SCRAPER_ENABLED=false`). O fluxo continua funcionando com a fonte
restante; se nenhuma responder, cai no fallback Geoapify (`PARTIAL_RESULTS`)
e, em último caso, retorna `EXTERNAL_FAILURE`. Variáveis aceitas como alias:
`ENABLE_MAP_SCRAPER`, `ENABLE_GMAPS_SCRAPER`.

| Variável | Default | Descrição |
|----------|---------|-----------|
| `MAP_SCRAPER_URL` | — | URL pública do microserviço |
| `MAP_SCRAPER_ENABLED` | `false` | Liga/desliga a fonte |
| `MAP_SCRAPER_LANG` | `pt` | `hl` do Google |
| `MAP_SCRAPER_COUNTRY` | `br` | `gl` do Google |
| `MAP_SCRAPER_TIMEOUT_MS` | `300000` | Timeout por busca |
| `SCRAPER_CONCURRENCY` | `3` | Concorrência interna do serviço |

## Rodar/Deploy localmente

```bash
docker build -t mapscraper-service .
docker run -p 8000:8000 mapscraper-service
curl "http://localhost:8000/scrape-get?query=dentistas%20em%20Curitiba,%20PR&max_places=5&lang=pt&country=br"
```

No Railway: serviço com Dockerfile, target port **8000**.

## Notas

- O Google serve uma *consent wall* para IPs de datacenter; `scraper.py` envia
  cookies de consentimento (`CONSENT`/`SOCS`) e o pacote `Brotli` é necessário
  para decodificar `content-encoding: br`.
- Scraping do Google Maps viola os ToS do Google; use por sua conta e risco.
