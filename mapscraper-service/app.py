"""mapScraper HTTP microservice.

Encapsula o scraper async de christivn/mapScraper (vendored em scraper.py)
atrás de um endpoint HTTP no mesmo padrão do gmaps-scraper, para ser
consumido pela Edge Function `search-places`.

Endpoints:
  GET /                     -> health check
  GET /scrape-get?query=... -> JSON array com os estabelecimentos

Query params: query (obrigatório), max_places, lang (default pt), country (default br), concurrency.
"""
import asyncio
import logging
import os
from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from scraper import search_async

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("mapscraper-service")

app = FastAPI(title="mapScraper API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_CONCURRENT = max(1, int(os.environ.get("SCRAPER_CONCURRENCY", "3")))


@app.get("/")
async def health() -> dict[str, str]:
    return {"message": "mapScraper API is running."}


@app.get("/scrape-get")
async def scrape_get(
    query: str = Query(..., description="Search query, e.g. 'dentistas em Curitiba, PR'"),
    max_places: int | None = Query(None, description="Max results"),
    lang: str = Query("pt"),
    country: str = Query("br"),
    concurrency: int = Query(5),
) -> list[dict[str, Any]]:
    limit = max_places if (max_places and max_places > 0) else None
    semaphore = asyncio.Semaphore(max(1, min(concurrency, MAX_CONCURRENT)))
    try:
        results = await search_async(query, lang, country, limit, semaphore)
    except Exception:  # noqa: BLE001
        logger.exception("[scrape-get] unhandled error for query=%r", query)
        return []
    logger.info("[scrape-get] query=%r -> %d result(s)", query, len(results))
    return results
