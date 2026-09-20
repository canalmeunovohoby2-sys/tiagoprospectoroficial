# Agent Engine — camada mínima sobre a imagem do agent-runtime
#
# POR QUE ESTE ARQUIVO EXISTE
# O Dockerfile atual (agent-runtime/Dockerfile) NÃO instala `git` no apt — e os
# endpoints /git do runtime invocam o binário `git`. No Railway isso funciona
# porque o build de lá não usa este Dockerfile (Nixpacks instala git); num host
# baseado em Docker, /git falharia.
#
# Esta camada NÃO altera agent-runtime/** : ela apenas adiciona `git` à MESMA
# imagem já construída pelo Dockerfile do runtime (build em 2 passos).
#
# BUILD (2 passos, na raiz do repo):
#   1) gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-runtime-base:latest agent-runtime/
#   2) gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-engine:latest \
#        --substitutions=_BASE=REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-runtime-base:latest deploy/agent-engine/
#
# Nada mais é alterado: Node 22, Chromium/Playwright (+deps), ffmpeg-static,
# @napi-rs/canvas, jspdf/jszip e o CMD `node dist/server.js` vêm da imagem base.

ARG _BASE=agent-runtime-base:latest
FROM ${_BASE}

# git é requisito dos endpoints /git (commit/status/diff/log/restore) — ausente
# no apt do Dockerfile base. Plus: utilidades usadas por subprocessos do build.
RUN apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=30 \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && git --version

# marca a origem do deploy no /health (sem depender de variável do Railway)
ENV DEPLOY_VERSION=agent-engine

EXPOSE 8787
CMD ["node", "dist/server.js"]
