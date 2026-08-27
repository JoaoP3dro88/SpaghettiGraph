import { useState } from 'react'
import VideoDropzone from './components/VideoDropzone'
import ParametersForm, { DEFAULT_PARAMS, type JobParams } from './components/ParametersForm'

function App() {
  const today = new Date().toLocaleDateString('pt-BR')

  const [file, setFile] = useState<File | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [params, setParams] = useState<JobParams>(DEFAULT_PARAMS)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = file !== null && !isSubmitting

  const handleSubmit = async () => {
    if (!file) return
    setIsSubmitting(true)
    setSubmitError(null)

    // TODO: substituir por chamada real a POST /api/v1/jobs quando o
    // backend/controller estiver pronto. Por enquanto só simula o estado
    // de envio pra validarmos a UI.
    console.log('Envio (placeholder) — arquivo e parâmetros:', file, params)
    await new Promise((resolve) => setTimeout(resolve, 800))

    setIsSubmitting(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Cabeçalho estilo "carimbo de prancheta" */}
      <header className="border-b border-steel/30 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs tracking-widest text-steel uppercase">
              Estudo de Movimento · Gráfico de Espaguete
            </p>
            <h1 className="font-display font-bold text-2xl text-ink">
              Análise de Fluxo de Pessoas
            </h1>
          </div>
          <div className="font-mono text-xs text-steel text-right hidden sm:block">
            <p>DATA {today}</p>
            <p>ESC 1:1</p>
          </div>
        </div>
      </header>

      {/* Área de trabalho — papel milimetrado */}
      <main
        className="flex-1 relative"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-paper-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-paper-line) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundColor: 'var(--color-paper)',
          backgroundPosition: 'center',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 40%, var(--color-paper) 100%)',
            opacity: 0.6,
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 py-12 space-y-10">
          <section>
            <h2 className="font-mono text-xs tracking-widest text-steel uppercase mb-3">
              01 — Vídeo de entrada
            </h2>
            <VideoDropzone file={file} onFileSelected={setFile} error={submitError} />
          </section>

          <section>
            <h2 className="font-mono text-xs tracking-widest text-steel uppercase mb-3">
              02 — Parâmetros de análise
            </h2>
            <ParametersForm values={params} onChange={setParams} />
          </section>

          <section className="flex flex-col items-start gap-3 pb-8">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className={`
                font-display font-medium text-sm px-6 py-3 rounded-sm transition-colors
                focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-ink
                ${
                  canSubmit
                    ? 'bg-safety text-white hover:bg-safety-dark cursor-pointer'
                    : 'bg-steel/25 text-steel cursor-not-allowed'
                }
              `}
            >
              {isSubmitting ? 'Enviando…' : 'Processar vídeo'}
            </button>
            <p className="font-mono text-xs text-steel">
              {file
                ? 'O processamento roda numa fila única — pode levar alguns minutos.'
                : 'Selecione um vídeo para habilitar o envio.'}
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App