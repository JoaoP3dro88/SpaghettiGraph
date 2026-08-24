# Gráfico de Espaguete — Protótipo com Visão Computacional

Detecta pessoas em um vídeo gravado de cima, rastreia cada uma delas e
gera o gráfico de espaguete com as trajetórias.

## 1. Instalação

Recomendado usar um ambiente virtual:

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Na primeira execução, a Ultralytics baixa automaticamente o modelo YOLO
escolhido (`yolov8n.pt`, `yolov8s.pt` etc.) — precisa de internet nessa hora.

Para usar a GPU (RTX 3500), confira se o PyTorch com suporte CUDA está
instalado corretamente:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Se retornar `False`, reinstale o PyTorch com a versão CUDA compatível
com o driver da sua máquina (veja https://pytorch.org/get-started/locally/).

## 2. Uso básico

```bash
python spaghetti_diagram.py --video caminho/para/video.mp4
```

Isso gera, em `./output`:
- `trajetorias.csv` — posição (x, y) de cada pessoa por frame
- `grafico_espaguete.png` — o gráfico de espaguete final
- `fundo_referencia.png` — imagem de fundo usada como base

## 3. Opções úteis

| Flag | O que faz |
|---|---|
| `--model yolov8s.pt` | Modelo mais preciso (padrão: `yolov8n.pt`, mais rápido). Com a RTX 3500, `yolov8s` ou até `yolov8m` rodam tranquilamente. |
| `--conf 0.35` | Confiança mínima de detecção. Suba se estiver detectando "pessoas fantasmas"; desça se estiver perdendo gente. |
| `--skip-frames 2` | Pula frames para acelerar processamento de vídeos longos. |
| `--min-track-len 15` | Descarta rastros muito curtos (ruído/detecção passageira). |
| `--make-video` | Gera também um vídeo com os rastros sendo desenhados ao vivo. |
| `--pixels-per-meter 40` | Se você souber a escala (ex: 40px = 1 metro no vídeo), os eixos saem em metros. |
| `--background median\|first\|last` | Como montar a imagem de fundo. `median` tende a "sumir" com as pessoas, deixando só o ambiente. |

Exemplo mais completo:

```bash
python spaghetti_diagram.py \
    --video reuniao_producao.mp4 \
    --model yolov8s.pt \
    --conf 0.4 \
    --min-track-len 20 \
    --make-video \
    --output-dir ./saida_dia1
```

## 4. Como descobrir a escala (pixels-per-meter)

1. Pause o vídeo em um frame onde você reconheça uma distância real conhecida
   (ex: largura de uma mesa de 1,2m, ou espaçamento entre pilares).
2. Meça em pixels essa distância na imagem (pode usar qualquer editor de
   imagem, ou `cv2.imshow` com clique).
3. `pixels_per_meter = distância_em_pixels / distância_em_metros`

## 5. Limitações conhecidas deste protótipo

- **Troca de ID em oclusões**: se duas pessoas se cruzam bem próximas, o
  tracker pode trocar os IDs entre elas. Para reduzir isso, use
  `--tracker botsort.yaml` (mais robusto, um pouco mais lento) em vez do
  ByteTrack padrão.
- **Câmera não perfeitamente ortogonal**: o script assume vista de cima
  sem grande distorção de perspectiva. Se a câmera tiver ângulo
  significativo, o ideal é aplicar uma homografia (posso adicionar isso
  na próxima iteração).
- **Múltiplas câmeras**: este protótipo cobre uma câmera por vez. Fundir
  trajetórias de câmeras diferentes é um passo futuro.
- **Vídeo ao vivo**: o script atual lê de um arquivo. Para stream RTSP/
  webcam ao vivo, é só trocar `--video` por índice de webcam (`0`) ou URL
  RTSP — o Ultralytics aceita ambos nativamente.

## 6. Privacidade / LGPD

Como o pipeline rastreia pessoas identificáveis no ambiente de trabalho,
vale alinhar com jurídico/RH sobre consentimento, retenção de vídeo e
anonimização antes de rodar em produção.
