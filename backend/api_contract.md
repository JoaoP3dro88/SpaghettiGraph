# Contrato da API — Gráfico de Espaguete

Versão: `v1` — Base URL: `https://espaguete.suaempresa.com/api/v1` (mesmo domínio do frontend, ver seção de Infraestrutura)

## Modelo geral

A API funciona em duas etapas:
1. **Criar um job** (envia vídeo + parâmetros) → recebe um `job_id`.
2. **Consultar o status do job** periodicamente (polling) até `status = "done"`, então buscar os arquivos de resultado.

Processamento roda numa fila com um único worker (uma GPU), então um job pode
ficar em `queued` antes de `processing`.

---

## Decisões de política (definidas)

| Item | Decisão |
|---|---|
| **Autenticação** | Nenhuma. A API fica acessível apenas dentro da rede interna da empresa (VPN/intranet) — sem login próprio. Proteção é por perímetro de rede, não por credencial de aplicação. |
| **Limite de vídeo** | Duração máxima: **15 minutos**. Tamanho máximo de arquivo: **500 MB**. |
| **Retenção de arquivos** | **30 minutos após o job terminar** (`finished_at`, não `created_at`) — depois disso, limpeza automática apaga vídeo de entrada e todos os arquivos gerados. |
| **Rate limit** | **1 job simultâneo por IP.** Novo job do mesmo IP enquanto outro está em `queued`/`processing` recebe `429`. Implica backend rodando em processo único (ver Infraestrutura). |
| **CORS / domínio** | Frontend e API no **mesmo domínio**, via proxy reverso: `/` serve o React, `/api/` repassa pro FastAPI. Sem CORS necessário. |

---

## 1. `POST /jobs`

Cria um novo job de processamento.

**Request:** `multipart/form-data`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `video` | file | sim | Arquivo de vídeo (mp4, avi, mov) |
| `model` | string | não (padrão: `yolov8s`) | `yolov8n` \| `yolov8s` \| `yolov8m` |
| `conf` | float | não (padrão: `0.35`) | Confiança mínima de detecção (0–1) |
| `min_track_len` | int | não (padrão: `10`) | Filtro de trajetórias curtas |
| `skip_frames` | int | não (padrão: `0`) | Pula N frames entre processados |
| `smooth_window` | int | não (padrão: `15`) | Janela de suavização (0 = desliga) |
| `pixels_per_meter` | float | não | Escala pixel→metro, se souber |
| `make_video` | bool | não (padrão: `true`) | Gerar vídeo anotado com rastros |

**Response `201 Created`:**
```json
{
  "job_id": "a1b2c3d4",
  "status": "queued",
  "created_at": "2026-08-26T14:30:00Z",
  "estimated_position_in_queue": 0,
  "estimated_processing_seconds": 620
}
```

`estimated_processing_seconds` é uma estimativa aproximada (baseada em duração do vídeo / modelo escolhido) pra UI mostrar algo como "processamento deve levar até ~10 minutos".

**Erros possíveis:**
- `400` — formato de vídeo inválido, parâmetro fora do range
- `413` — arquivo excede 500 MB
- `422` — vídeo excede 15 minutos de duração
- `429` — já existe um job ativo (`queued` ou `processing`) para este IP

---

## 2. `GET /jobs/{job_id}`

Consulta o status atual do job. Frontend faz polling nesse endpoint (ex: a cada 2s).

**Response `200 OK`:**
```json
{
  "job_id": "a1b2c3d4",
  "status": "processing",
  "stage": "tracking",
  "stage_number": 2,
  "total_stages": 5,
  "progress_percent": 34,
  "created_at": "2026-08-26T14:30:00Z",
  "started_at": "2026-08-26T14:30:05Z",
  "finished_at": null,
  "error": null
}
```

**Valores possíveis de `status`:** `queued` | `processing` | `done` | `failed`

**Valores possíveis de `stage`** (espelha as 5 etapas do script):
`background` | `tracking` | `filtering` | `rendering` | `video_export`

**Quando `status = "failed"`:**
```json
{
  "job_id": "a1b2c3d4",
  "status": "failed",
  "error": {
    "code": "NO_TRAJECTORIES_FOUND",
    "message": "Nenhuma trajetória válida encontrada. Ajuste conf ou min_track_len."
  }
}
```

---

## 3. `GET /jobs/{job_id}/result`

Só retorna dado útil quando `status = "done"`. Lista os artefatos gerados com URLs prontas pra download/exibição.

**Response `200 OK`:**
```json
{
  "job_id": "a1b2c3d4",
  "status": "done",
  "expires_at": "2026-08-26T15:08:00Z",
  "files": {
    "spaghetti_chart": "/api/v1/jobs/a1b2c3d4/files/grafico_espaguete.png",
    "annotated_video": "/api/v1/jobs/a1b2c3d4/files/video_anotado.mp4",
    "raw_trajectories_csv": "/api/v1/jobs/a1b2c3d4/files/trajetorias.csv",
    "background_reference": "/api/v1/jobs/a1b2c3d4/files/fundo_referencia.png"
  },
  "stats": {
    "people_detected": 10,
    "video_duration_seconds": 45.2,
    "processing_time_seconds": 78.4
  }
}
```

`expires_at` = `finished_at + 30 minutos`. O frontend deve exibir uma contagem
regressiva e avisar claramente o usuário para baixar os arquivos antes desse
horário — depois disso, o job vira `410 Gone` em qualquer endpoint.

**Response `409 Conflict`** (se ainda não terminou):
```json
{ "error": "Job ainda não concluído. Status atual: processing" }
```

---

## 4. `GET /jobs/{job_id}/files/{filename}`

Serve o arquivo estático em si (imagem, vídeo ou CSV). Usado diretamente como `src` de `<img>`/`<video>` no frontend, ou link de download.

Headers de resposta incluem `Content-Type` apropriado (`image/png`, `video/mp4`, `text/csv`).

---

## 5. `DELETE /jobs/{job_id}`

Remove o job e seus arquivos do servidor (limpeza manual ou pelo frontend após o usuário baixar o que precisa).

**Response `204 No Content`**

---

## 6. `GET /health`

Health check simples pro monitoramento do servidor.

```json
{ "status": "ok", "gpu_available": true, "queue_length": 0 }
```

---

## 7. `GET /models`

Lista os modelos disponíveis no servidor, pro frontend popular um dropdown sem hardcodar.

```json
{
  "models": [
    { "id": "yolov8n", "label": "Rápido (menor precisão)" },
    { "id": "yolov8s", "label": "Equilibrado (recomendado)" },
    { "id": "yolov8m", "label": "Mais preciso (mais lento)" }
  ]
}
```

---

## Infraestrutura de execução (decorrente das decisões acima)

- **Processo único do backend.** O rate limit por IP (1 job simultâneo) e a fila de processamento GPU-bound exigem estado compartilhado em memória (lista de jobs, IP com job ativo). Isso significa rodar o Uvicorn/FastAPI com **um único worker** (`--workers 1`). Não é limitação real de performance aqui, já que a GPU é o gargalo mesmo — múltiplos workers de API não processariam vídeo mais rápido de qualquer forma.

- **Job de limpeza (cleanup).** Uma tarefa em background (rodando dentro do próprio processo FastAPI, ex: `asyncio` task periódica a cada 1 minuto) verifica jobs com `status = "done"` e `expires_at` no passado, apaga os arquivos do disco e marca o job como `expired`/remove do registro.

- **Proxy reverso (Nginx, por exemplo) na frente de tudo:**
  - `/` → serve os arquivos estáticos do build do Vite (`npm run build` gera uma pasta `dist/`)
  - `/api/` → repassa (`proxy_pass`) pro FastAPI rodando internamente (ex: `127.0.0.1:8000`)
  - O Nginx também é responsável por só aceitar conexões da rede interna (firewall/bind em interface interna, não exposto na internet pública).

- **Sem tabela de usuários, sem autenticação no código.** Simplifica bastante o backend — não há model de `User`, não há JWT, não há sessão. O único "identificador" de cliente usado é o IP de origem, só para o rate limit.