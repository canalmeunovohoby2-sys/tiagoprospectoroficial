# Maps Engine (Etapa 2) — preparação isolada

> **Nada do serviço atual foi alterado.** Este diretório só contém o kit de execução
> do **mesmo** `mapscraper-service` fora do Railway (imagem idêntica). Railway segue oficial.

## O que é

`Maps Engine` = o container Python/FastAPI já existente em `mapscraper-service/`
(`app.py` + `scraper.py` + `requirements.txt` + `Dockerfile`), executado em outro host.

Contrato preservado byte a byte:
- `GET /` → `{"message": "mapScraper API is running."}`
- `GET /scrape-get?query=...&max_places=...&lang=pt&country=br&concurrency=5` → **array JSON** com
  `title, category, address, domain, url, coor ("lat,lng"), stars, reviews, source_query`
- knobs: `SCRAPER_CONCURRENCY` (semáforo global), `LOG_LEVEL`
- porta: **8000** (fixa no `CMD` do Dockerfile) → publicar 8000 no host.

## Build da imagem (mesmo contexto do Railway)

```bash
# na raiz do repo; usa mapscraper-service/Dockerfile sem alterá-lo
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/maps-engine:latest mapscraper-service/
```

## Deploy (Cloud Run)

```bash
gcloud run services replace deploy/maps-engine/maps-engine.service.yaml --region REGION
gcloud run services describe prospector-maps-engine --region REGION --format='value(status.url)'
```

## Teste local (sem Docker, pasta temporária)

```bash
py -3.11 -m venv .venv-maps || python -m venv .venv-maps
.venv-maps/Scripts/activate            # Windows
pip install -r mapscraper-service/requirements.txt uvicorn fastapi
cd mapscraper-service && uvicorn app:app --host 127.0.0.1 --port 8010
# outra aba:
curl http://127.0.0.1:8010/
curl "http://127.0.0.1:8010/scrape-get?query=pet%20shop%20em%20Guarulhos,%20SP&max_places=5"
```

## Validação antes de qualquer cutover (comparar com o Railway)

1. `/` responde `{"message": ...}` nos dois.
2. **3 queries iguais** nos dois (mesma `query`, mesmo `max_places`) — ex.:
   `academias em Barueri, SP` · `usinagem em Joinville, SC` · `pet shop em Guarulhos, SP`
3. Comparar: quantidade de resultados, presença dos 9 campos do contrato, telefone/endereço,
   erros e tempo aproximado. Diferenças esperadas: variação natural do Google (não é erro).
4. Só então (etapa futura e autorizada): trocar `MAP_SCRAPER_URL` + `MAP_SCRAPER_ENABLED=true`.

## Rollback

Nada a desfazer: `MAP_SCRAPER_URL`/`MAP_SCRAPER_ENABLED` **não são tocados aqui**.
Se um dia forem trocados, reverter o secret devolve o tráfego ao Railway **sem deploy**.

## Docker no PC (alternativa de teste)

```bash
docker build -t maps-engine mapscraper-service/
docker run --rm -p 8000:8000 maps-engine
```
