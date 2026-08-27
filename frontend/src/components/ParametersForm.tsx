export type ModelId = 'yolov8n' | 'yolov8s' | 'yolov8m'

export interface JobParams {
  model: ModelId
  conf: number
  minTrackLen: number
  skipFrames: number
  smoothWindow: number
  pixelsPerMeter: number | null
  makeVideo: boolean
}

export const DEFAULT_PARAMS: JobParams = {
  model: 'yolov8s',
  conf: 0.35,
  minTrackLen: 10,
  skipFrames: 0,
  smoothWindow: 15,
  pixelsPerMeter: null,
  makeVideo: true,
}

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'yolov8n', label: 'Rápido (menor precisão)' },
  { id: 'yolov8s', label: 'Equilibrado (recomendado)' },
  { id: 'yolov8m', label: 'Mais preciso (mais lento)' },
]

interface ParametersFormProps {
  values: JobParams
  onChange: (values: JobParams) => void
}

/** Uma linha de parâmetro no estilo "folha de especificação técnica":
 *  label em mono à esquerda, controle à direita, divisória fina embaixo. */
function ParamRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] sm:items-center gap-x-6 gap-y-2 py-4 border-b border-steel/20 last:border-b-0">
      <div>
        <p className="font-mono text-xs tracking-wide text-graphite uppercase">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-steel">{hint}</p>}
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  )
}

export default function ParametersForm({ values, onChange }: ParametersFormProps) {
  const set = <K extends keyof JobParams>(key: K, value: JobParams[K]) =>
    onChange({ ...values, [key]: value })

  return (
    <div className="rounded-sm border border-steel/30 bg-white/70 px-6">
      <ParamRow label="Modelo de detecção">
        <select
          value={values.model}
          onChange={(e) => set('model', e.target.value as ModelId)}
          className="font-mono text-sm bg-white border border-steel/40 rounded-sm px-3 py-1.5 text-ink focus-visible:outline focus-visible:outline-safety"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </ParamRow>

      <ParamRow label="Confiança mínima" hint="Detecções abaixo desse limiar são ignoradas">
        <div className="flex items-center gap-3 w-full sm:w-56">
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={values.conf}
            onChange={(e) => set('conf', Number(e.target.value))}
            className="w-full accent-safety"
          />
          <span className="font-mono text-sm text-ink w-10 text-right">
            {values.conf.toFixed(2)}
          </span>
        </div>
      </ParamRow>

      <ParamRow label="Suavização do traçado" hint="0 desativa, mantém o traço bruto">
        <div className="flex items-center gap-3 w-full sm:w-56">
          <input
            type="range"
            min={0}
            max={31}
            step={2}
            value={values.smoothWindow}
            onChange={(e) => set('smoothWindow', Number(e.target.value))}
            className="w-full accent-safety"
          />
          <span className="font-mono text-sm text-ink w-10 text-right">
            {values.smoothWindow}
          </span>
        </div>
      </ParamRow>

      <ParamRow label="Trajetória mínima" hint="Descarta rastros com menos pontos que isso (ruído)">
        <input
          type="number"
          min={1}
          value={values.minTrackLen}
          onChange={(e) => set('minTrackLen', Number(e.target.value))}
          className="font-mono text-sm bg-white border border-steel/40 rounded-sm px-3 py-1.5 w-24 text-right text-ink focus-visible:outline focus-visible:outline-safety"
        />
      </ParamRow>

      <ParamRow label="Pular frames" hint="Acelera vídeos longos, reduz precisão temporal">
        <input
          type="number"
          min={0}
          value={values.skipFrames}
          onChange={(e) => set('skipFrames', Number(e.target.value))}
          className="font-mono text-sm bg-white border border-steel/40 rounded-sm px-3 py-1.5 w-24 text-right text-ink focus-visible:outline focus-visible:outline-safety"
        />
      </ParamRow>

      <ParamRow label="Escala (px por metro)" hint="Opcional — deixe em branco para eixos em pixels">
        <input
          type="number"
          min={1}
          placeholder="—"
          value={values.pixelsPerMeter ?? ''}
          onChange={(e) =>
            set('pixelsPerMeter', e.target.value === '' ? null : Number(e.target.value))
          }
          className="font-mono text-sm bg-white border border-steel/40 rounded-sm px-3 py-1.5 w-24 text-right text-ink placeholder:text-steel/50 focus-visible:outline focus-visible:outline-safety"
        />
      </ParamRow>

      <ParamRow label="Vídeo anotado" hint="Gera vídeo com os rastros sendo desenhados">
        <button
          type="button"
          role="switch"
          aria-checked={values.makeVideo}
          onClick={() => set('makeVideo', !values.makeVideo)}
          className={`
            relative h-6 w-11 shrink-0 rounded-full transition-colors
            focus-visible:outline focus-visible:outline-safety focus-visible:outline-offset-2
            ${values.makeVideo ? 'bg-safety' : 'bg-steel/40'}
          `}
        >
        <span
            className={`
              absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform
              ${values.makeVideo ? 'translate-x-5' : 'translate-x-0'}
            `}
        />
        </button>
      </ParamRow>
    </div>
  )
}