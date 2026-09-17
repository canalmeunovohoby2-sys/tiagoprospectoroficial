"""GMapsScraper HTTP microservice.

Encapsula o scraper Selenium de Anonym0usWork1221/GMapsScraper (vendored em
`upstream/`) atrás de um endpoint HTTP no padrão consumido pelo Prospector.
Retorna, além dos dados de contato, as FOTOS reais do estabelecimento
(`cover_image` + `related_images`), resolvendo o problema de leads sem imagem.

Endpoints:
  GET /                 -> health check
  GET /scrape-get?query=...&max_places=N&threads=4&scroll=2 -> JSON array
"""
import json
import logging
import os
import shutil
import subprocess
import tempfile

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gmapsphotos")

UPSTREAM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "upstream")

app = FastAPI(title="GMapsScraper API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

UNAVAILABLE = {"not available", "n/a", "", "none", "null"}


def _clean(value):
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in UNAVAILABLE else text


def _images(value):
    out = []
    if isinstance(value, list):
        for item in value:
            text = _clean(item)
            if text and text.startswith("http") and text not in out:
                out.append(text)
    elif isinstance(value, str):
        text = _clean(value)
        if text and text.startswith("http"):
            out.append(text)
    return out


def _map_record(record: dict) -> dict:
    lat = _clean(record.get("latitude"))
    lng = _clean(record.get("longitude"))
    coor = f"{lat},{lng}" if lat and lng else ""
    cover = _images([record.get("cover_image")])
    related = _images(record.get("related_images"))
    images = (cover + related)[:8]
    return {
        "id": "",  # sem place_id no upstream: o app usa título+endereço como chave
        "title": _clean(record.get("title")),
        "category": _clean(record.get("category")),
        "address": _clean(record.get("address")),
        "phoneNumber": _clean(record.get("phone_number")),
        "completePhoneNumber": _clean(record.get("phone_number")),
        "url": _clean(record.get("webpage")),
        "coor": coor,
        "stars": _clean(record.get("rating")),
        "reviews": _clean(record.get("review_count")),
        "link": _clean(record.get("map_link")),  # URL oficial do Google Maps
        "thumbnail": images[0] if images else None,
        "images": images,
        "site_email": _clean(record.get("email")),
        "site_instagram": _clean(record.get("instagram")),
        "site_facebook": _clean(record.get("facebook")),
    }


@app.get("/")
def health() -> dict:
    return {"message": "GMapsScraper API is running."}


@app.get("/scrape-get")
def scrape_get(
    query: str = Query(...),
    max_places: int = Query(40),
    threads: int = Query(4),
    scroll: int = Query(2),
    lang: str = Query("pt"),
    country: str = Query("br"),
) -> list:
    _ = (lang, country)  # o upstream usa o locale do Chrome; mantido por compatibilidade
    tmp = tempfile.mkdtemp(prefix="gmapsphotos-")
    try:
        query_file = os.path.join(tmp, "queries.txt")
        with open(query_file, "w", encoding="utf-8") as handle:
            handle.write(f"{query}\n")
        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)

        cmd = [
            "python", "maps.py",
            "-q", query_file,
            "-w", str(max(1, int(threads))),
            "-l", str(max(1, int(max_places))),
            "-of", "JSON",
            "-o", out_dir,
            "-sm", str(max(1, int(scroll))),
            "-bw", str(int(os.environ.get("BROWSER_WAIT_SECONDS", "20"))),
            "-nv",
        ]
        # Em datacenter, o headless costuma ser detectado (TimeoutException/consent).
        # Rodar em janela virtual (xvfb) é bem mais estável. Desligável por env.
        if os.environ.get("SCRAPER_WINDOWED", "1") != "0":
            cmd.insert(0, "xvfb-run")
            cmd.insert(1, "-a")
            cmd.append("-wb")
        logger.info("run %s", " ".join(cmd))
        subprocess.run(cmd, cwd=UPSTREAM, check=True, timeout=int(os.environ.get("SCRAPE_TIMEOUT_SECONDS", "280")))

        data_file = os.path.join(out_dir, "google_maps_data.json")
        if not os.path.exists(data_file):
            return []
        with open(data_file, encoding="utf-8") as handle:
            data = json.load(handle)
        records = data if isinstance(data, list) else data.get("data", [])

        seen = set()
        result = []
        for record in records:
            mapped = _map_record(record)
            key = mapped["id"] or f'{mapped["title"]}|{mapped["address"]}'
            if key in seen:
                continue
            seen.add(key)
            result.append(mapped)
        logger.info("query=%r -> %d result(s), %d com foto", query, len(result), sum(1 for r in result if r["thumbnail"]))
        return result
    except Exception:  # noqa: BLE001
        logger.exception("scrape failed for query=%r", query)
        return []
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
