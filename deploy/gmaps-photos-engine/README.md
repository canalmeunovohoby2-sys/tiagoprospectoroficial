# GMaps Photos Engine (Etapa 3) — preparação isolada

> **Nada do serviço atual foi alterado.** Este diretório só contém o kit de execução
> do **mesmo** `gmapsphotos-service` fora do Railway (imagem idêntica). Railway segue oficial.

## O que é

`Photos Engine` = o container Python/FastAPI + Selenium + Chrome + Xvfb já existente em
`gmapsphotos-service/` (`app.py` + `upstream/` + `Dockerfile`), executado em outro host.

Contrato preservado byte a byte:
- `GET /` → `{"message": "GMapsScraper API is running."}`
- `GET /scrape-get?query=...&max_places=40&threads=4&scroll=2&lang=pt&country=br` → **array JSON**
  com `title, category, address, phoneNumber, completePhoneNumber, url, coor, stars, reviews,
  link, thumbnail, images, site_email, site_instagram, site_facebook`
- knobs: `SCRAPER_WINDOWED` (`1` = xvfb-run; `0` = headless), `BROWSER_WAIT_SECONDS`,
  `SCRAPE_TIMEOUT_SECONDS`, `LOG_LEVEL`
- porta: **8000** (fixa no `CMD` do Dockerfile) → publicar 8000 no host.

## Requisitos de ambiente (confirmados na auditoria)

| Recurso | Exigência |
|---|---|
| Memória | **1–2 GiB** (Chrome + Xvfb + Selenium) |
| CPU | 1–2 vCPU |
| Navegador | `google-chrome-stable` (já no Dockerfile) |
| Display | `xvfb` no Linux (`SCRAPER_WINDOWED=1`, padrão) |
| Subprocess | `xvfb-run python maps.py …` (o container precisa permitir) |
| Timeout | interno de 280 s (`SCRAPE_TIMEOUT_SECONDS`) → host com **≥ 360 s** |
| Concorrência | baixa (cada scrape abre um Chrome): `containerConcurrency: 2` |

## Build + deploy (Cloud Run)

```bash
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/gmaps-photos-engine:latest gmapsphotos-service/
gcloud run services replace deploy/gmaps-photos-engine/photos-engine.service.yaml --region REGION
gcloud run services describe prospector-gmaps-photos-engine --region REGION --format='value(status.url)'
```

## Teste local (Windows, sem Docker)

No Windows não existe `xvfb-run` → rodar em **headless** (`SCRAPER_WINDOWED=0`):

```powershell
$env:SCRAPER_WINDOWED="0"; $env:LOG_LEVEL="INFO"
cd gmapsphotos-service
python -m uvicorn app:app --host 127.0.0.1 --port 8011
# outra aba:
curl http://127.0.0.1:8011/
curl "http://127.0.0.1:8011/scrape-get?query=academia%20em%20Barueri,%20SP&max_places=3&threads=1&scroll=1"
```

No Linux/container o padrão (`SCRAPER_WINDOWED=1` + `xvfb-run`) é mais estável contra detecção de datacenter (já documentado no `app.py`).

## Validação antes de qualquer cutover (comparar com o Railway)

1. `/` responde `{"message": ...}` nos dois.
2. **Mesma query e mesmos parâmetros** nos dois. Comparar: sucesso, **telefone**, **quantidade de `images`**, presença de **`thumbnail`**, **`url`**, endereço e campos sociais.
3. Diferenças esperadas: o Google varia resultados/bloqueia headless — comparar **estrutura e presença dos campos**, não igualdade exata.
4. Só então (etapa futura e autorizada): trocar `GMAPS_SCRAPER_URL` + `GMAPS_SCRAPER_ENABLED=true`.

> **Comparação com o Railway indisponível localmente** quando a URL está apenas em secret do Supabase
> (não extrair/alterar secrets): nesse caso a comparação fica para a etapa de validação/cutover.

## Rollback

Nada a desfazer aqui: `GMAPS_SCRAPER_URL`/`GMAPS_SCRAPER_ENABLED` **não são tocados**.
Se um dia forem trocados, reverter o secret devolve o tráfego ao Railway **sem deploy**.

## Docker no PC (alternativa de teste fiel ao container)

```bash
docker build -t photos-engine gmapsphotos-service/
docker run --rm -p 8000:8000 --memory=2g photos-engine
```
