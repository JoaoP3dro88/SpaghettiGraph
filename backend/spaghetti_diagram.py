#!/usr/bin/env python3
"""
Gráfico de Espaguete via Visão Computacional
==============================================

Detecta pessoas em um vídeo (gravado de cima), rastreia cada indivíduo
frame a frame e desenha as trajetórias resultantes ("espaguete") sobre
uma imagem de referência do ambiente.

Pipeline:
    1. Detecção de pessoas (YOLOv8/Ultralytics)
    2. Tracking multi-objeto (ByteTrack, embutido no Ultralytics)
    3. Acúmulo da posição (centro da base da bounding box) por ID e por frame
    4. Conversão opcional pixel -> metros (escala simples, útil pra câmera
       ortogonal / vista de cima, sem distorção de perspectiva relevante)
    5. Geração do gráfico de espaguete (PNG) + vídeo anotado opcional + CSV bruto

Uso básico:
    python spaghetti_diagram.py --video caminho/para/video.mp4

Uso com mais controle:
    python spaghetti_diagram.py \
        --video video.mp4 \
        --model yolov8s.pt \
        --conf 0.35 \
        --skip-frames 1 \
        --min-track-len 15 \
        --make-video \
        --output-dir ./saida

Requisitos:
    pip install ultralytics opencv-python numpy matplotlib pandas
"""

import argparse
import os
import sys
from collections import defaultdict

import cv2
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib import colormaps
from scipy.signal import savgol_filter


def parse_args():
    p = argparse.ArgumentParser(description="Gera gráfico de espaguete a partir de vídeo com pessoas.")
    p.add_argument("--video", required=True, help="Caminho para o vídeo de entrada.")
    p.add_argument("--output-dir", default="./output", help="Diretório de saída.")
    p.add_argument("--model", default="yolov8n.pt",
                   help="Modelo YOLO (yolov8n/s/m.pt). 's' ou 'm' dão mais precisão, "
                        "'n' é mais rápido. Com RTX 3500 12GB, 's' ou até 'm' rodam bem.")
    p.add_argument("--conf", type=float, default=0.35, help="Confiança mínima de detecção.")
    p.add_argument("--iou", type=float, default=0.5, help="IoU threshold do tracker.")
    p.add_argument("--tracker", default="bytetrack.yaml",
                   help="Config do tracker: bytetrack.yaml ou botsort.yaml")
    p.add_argument("--skip-frames", type=int, default=0,
                   help="Pula N frames entre cada processado (0 = processa todos). "
                        "Use >0 para acelerar vídeos longos.")
    p.add_argument("--min-track-len", type=int, default=10,
                   help="Descarta trajetórias com menos de N pontos (ruído/falsos positivos).")
    p.add_argument("--pixels-per-meter", type=float, default=None,
                   help="Escala pixel->metro. Se informado, o CSV e os eixos do gráfico "
                        "saem em metros. Se omitido, fica em pixels.")
    p.add_argument("--make-video", action="store_true",
                   help="Também gera um vídeo anotado com caixas, IDs e rastros crescendo.")
    p.add_argument("--smooth-window", type=int, default=15,
                   help="Tamanho da janela do filtro de suavização (deve ser ímpar). "
                        "0 desativa a suavização e mantém o traço bruto. Padrão: 15.")
    p.add_argument("--smooth-polyorder", type=int, default=2,
                   help="Ordem do polinômio do filtro Savitzky-Golay (padrão: 2, suave e sem distorcer curvas).")
    p.add_argument("--background", choices=["median", "first", "last"], default="median",
                   help="Como gerar a imagem de fundo para desenhar as trajetórias por cima.")
    p.add_argument("--max-frames-for-bg", type=int, default=30,
                   help="Quantos frames amostrar para calcular o fundo por mediana.")
    return p.parse_args()


def compute_background(cap, method="median", n_samples=30):
    """Calcula uma imagem de fundo 'limpa' (sem pessoas, idealmente) para servir
    de base ao gráfico de espaguete."""
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total_frames = max(total_frames, 1)

    if method == "first":
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, frame = cap.read()
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        return frame if ok else None

    if method == "last":
        cap.set(cv2.CAP_PROP_POS_FRAMES, max(total_frames - 1, 0))
        ok, frame = cap.read()
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        return frame if ok else None

    # median: amostra N frames espaçados ao longo do vídeo e tira a mediana pixel a pixel.
    # Isso tende a "apagar" pessoas em movimento, sobrando só o ambiente estático.
    idxs = np.linspace(0, total_frames - 1, num=min(n_samples, total_frames), dtype=int)
    frames = []
    for i in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, frame = cap.read()
        if ok:
            frames.append(frame)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    if not frames:
        return None
    stacked = np.stack(frames, axis=0)
    median_frame = np.median(stacked, axis=0).astype(np.uint8)
    return median_frame


def track_people(video_path, model_name, conf, iou, tracker_cfg, skip_frames):
    """Roda detecção + tracking no vídeo inteiro e retorna um dicionário
    {track_id: [(frame_idx, x_px, y_px), ...]}."""
    from ultralytics import YOLO

    model = YOLO(model_name)
    trajectories = defaultdict(list)

    frame_idx = 0
    results_gen = model.track(
        source=video_path,
        conf=conf,
        iou=iou,
        classes=[0],  # classe 0 = 'person' no COCO
        tracker=tracker_cfg,
        stream=True,
        persist=True,
        verbose=False,
    )

    for frame_idx, result in enumerate(results_gen):
        if skip_frames > 0 and frame_idx % (skip_frames + 1) != 0:
            continue

        if result.boxes is None or result.boxes.id is None:
            continue

        boxes = result.boxes.xyxy.cpu().numpy()
        ids = result.boxes.id.cpu().numpy().astype(int)

        for (x1, y1, x2, y2), track_id in zip(boxes, ids):
            # Ponto de referência: centro da base da bbox (aprox. onde os pés estão).
            # Em vista de cima isso se aproxima bem do centro da pessoa; ajuste se
            # sua câmera não for totalmente ortogonal.
            cx = (x1 + x2) / 2.0
            cy = y2
            trajectories[int(track_id)].append((frame_idx, float(cx), float(cy)))

    return trajectories


def smooth_trajectory(xs, ys, window=15, polyorder=2):
    """Suaviza uma trajetória com o filtro Savitzky-Golay, que reduz o
    'tremor' de detecção frame a frame sem cortar curvas reais do caminho.

    Se a trajetória for curta demais para a janela pedida, a janela é
    reduzida automaticamente (sempre ímpar e > polyorder)."""
    n = len(xs)
    if window <= 0 or n < 5:
        return xs, ys

    w = min(window, n if n % 2 == 1 else n - 1)
    if w <= polyorder:
        w = polyorder + 1 if (polyorder + 1) % 2 == 1 else polyorder + 2
    if w > n:
        return xs, ys  # trajetória curta demais mesmo após ajuste, mantém bruto

    xs_smooth = savgol_filter(xs, window_length=w, polyorder=polyorder)
    ys_smooth = savgol_filter(ys, window_length=w, polyorder=polyorder)
    return xs_smooth, ys_smooth


def filter_short_tracks(trajectories, min_len):
    return {tid: pts for tid, pts in trajectories.items() if len(pts) >= min_len}


def save_raw_csv(trajectories, output_path, pixels_per_meter=None):
    rows = []
    for tid, pts in trajectories.items():
        for frame_idx, x, y in pts:
            if pixels_per_meter:
                x, y = x / pixels_per_meter, y / pixels_per_meter
            rows.append({"track_id": tid, "frame": frame_idx, "x": x, "y": y})
    df = pd.DataFrame(rows).sort_values(["track_id", "frame"])
    df.to_csv(output_path, index=False)
    return df


def plot_spaghetti(background, trajectories, output_path, pixels_per_meter=None, title=None,
                    smooth_window=15, smooth_polyorder=2):
    h, w = background.shape[:2]
    bg_rgb = cv2.cvtColor(background, cv2.COLOR_BGR2RGB)

    fig, ax = plt.subplots(figsize=(w / 100, h / 100), dpi=100)
    ax.imshow(bg_rgb, extent=[0, w, h, 0])

    colors = colormaps["tab20"]

    for i, (tid, pts) in enumerate(sorted(trajectories.items())):
        pts_sorted = sorted(pts, key=lambda p: p[0])
        xs = [p[1] for p in pts_sorted]
        ys = [p[2] for p in pts_sorted]
        xs, ys = smooth_trajectory(xs, ys, window=smooth_window, polyorder=smooth_polyorder)
        color = colors(i % 20)
        ax.plot(xs, ys, linewidth=1.8, alpha=0.85, color=color, label=f"ID {tid}")
        ax.scatter([xs[0]], [ys[0]], color=color, marker="o", s=40, edgecolors="black", zorder=5)   # início
        ax.scatter([xs[-1]], [ys[-1]], color=color, marker="s", s=40, edgecolors="black", zorder=5)  # fim

    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.set_title(title or "Gráfico de Espaguete — Movimentação")
    ax.axis("off")

    if len(trajectories) <= 20:
        ax.legend(loc="upper right", fontsize=7, framealpha=0.7)

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def make_annotated_video(video_path, trajectories, output_path, min_track_len,
                          smooth_window=15, smooth_polyorder=2):
    """Gera um vídeo com os rastros sendo desenhados progressivamente,
    útil para apresentar a demanda de forma visual."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    colors = colormaps["tab20"]
    id_color = {}
    for i, tid in enumerate(sorted(trajectories.keys())):
        c = colors(i % 20)
        id_color[tid] = tuple(int(c[k] * 255) for k in (2, 1, 0))  # RGB->BGR

    # Suaviza cada trajetória inteira antes de indexar por frame, para o
    # rastro desenhado no vídeo já sair sem o jitter de detecção.
    smoothed_trajectories = {}
    for tid, pts in trajectories.items():
        pts_sorted = sorted(pts, key=lambda p: p[0])
        frame_idxs = [p[0] for p in pts_sorted]
        xs = [p[1] for p in pts_sorted]
        ys = [p[2] for p in pts_sorted]
        xs, ys = smooth_trajectory(xs, ys, window=smooth_window, polyorder=smooth_polyorder)
        smoothed_trajectories[tid] = list(zip(frame_idxs, xs, ys))

    # index: frame_idx -> lista de (tid, x, y)
    by_frame = defaultdict(list)
    for tid, pts in smoothed_trajectories.items():
        for frame_idx, x, y in pts:
            by_frame[frame_idx].append((tid, x, y))

    trail = defaultdict(list)
    frame_idx = 0
    ok, frame = cap.read()
    while ok:
        for tid, x, y in by_frame.get(frame_idx, []):
            trail[tid].append((int(x), int(y)))

        for tid, pts in trail.items():
            color = id_color.get(tid, (0, 255, 0))
            for j in range(1, len(pts)):
                cv2.line(frame, pts[j - 1], pts[j], color, 2)
            if pts:
                cv2.putText(frame, f"ID {tid}", pts[-1], cv2.FONT_HERSHEY_SIMPLEX,
                            0.5, color, 2, cv2.LINE_AA)

        writer.write(frame)
        frame_idx += 1
        ok, frame = cap.read()

    cap.release()
    writer.release()


def main():
    args = parse_args()

    if not os.path.exists(args.video):
        print(f"Erro: vídeo não encontrado em {args.video}")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    print("[1/5] Calculando imagem de fundo...")
    cap = cv2.VideoCapture(args.video)
    background = compute_background(cap, method=args.background, n_samples=args.max_frames_for_bg)
    cap.release()
    if background is None:
        print("Erro: não foi possível ler frames do vídeo.")
        sys.exit(1)

    print("[2/5] Rodando detecção + tracking (YOLO + ByteTrack)...")
    trajectories = track_people(
        args.video, args.model, args.conf, args.iou, args.tracker, args.skip_frames
    )
    print(f"    -> {len(trajectories)} tracks brutos detectados.")

    print("[3/5] Filtrando trajetórias curtas (ruído)...")
    trajectories = filter_short_tracks(trajectories, args.min_track_len)
    print(f"    -> {len(trajectories)} trajetórias após filtro (min {args.min_track_len} pontos).")

    if not trajectories:
        print("Nenhuma trajetória válida encontrada. Ajuste --conf, --min-track-len ou verifique o vídeo.")
        sys.exit(1)

    print("[4/5] Salvando CSV bruto e gráfico de espaguete...")
    csv_path = os.path.join(args.output_dir, "trajetorias.csv")
    save_raw_csv(trajectories, csv_path, pixels_per_meter=args.pixels_per_meter)

    png_path = os.path.join(args.output_dir, "grafico_espaguete.png")
    plot_spaghetti(background, trajectories, png_path, pixels_per_meter=args.pixels_per_meter,
                   smooth_window=args.smooth_window, smooth_polyorder=args.smooth_polyorder)

    bg_path = os.path.join(args.output_dir, "fundo_referencia.png")
    cv2.imwrite(bg_path, background)

    if args.make_video:
        print("[5/5] Gerando vídeo anotado (pode demorar um pouco)...")
        video_out_path = os.path.join(args.output_dir, "video_anotado.mp4")
        make_annotated_video(args.video, trajectories, video_out_path, args.min_track_len,
                              smooth_window=args.smooth_window, smooth_polyorder=args.smooth_polyorder)
    else:
        print("[5/5] Vídeo anotado pulado (use --make-video para gerar).")

    print("\nConcluído. Arquivos gerados em:", args.output_dir)
    print(" -", csv_path)
    print(" -", png_path)
    print(" -", bg_path)
    if args.make_video:
        print(" -", os.path.join(args.output_dir, "video_anotado.mp4"))


if __name__ == "__main__":
    main()