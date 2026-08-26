import { useCallback, useRef, useState } from 'react'

const MAX_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB, conforme o contrato da API
const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo']
const ACCEPTED_EXT = '.mp4,.mov,.avi'

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

interface VideoDropzoneProps {
  file: File | null
  onFileSelected: (file: File | null) => void
  error: string | null
}

export default function VideoDropzone({ file, onFileSelected, error }: VideoDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSet = useCallback(
    (candidate: File) => {
      if (!ACCEPTED_TYPES.includes(candidate.type)) {
        onFileSelected(null)
        return 'Formato não suportado. Envie um vídeo .mp4, .mov ou .avi.'
      }
      if (candidate.size > MAX_SIZE_BYTES) {
        onFileSelected(null)
        return `Arquivo muito grande (${formatBytes(candidate.size)}). Limite: 500 MB.`
      }
      onFileSelected(candidate)
      return null
    },
    [onFileSelected]
  )

  const [localError, setLocalError] = useState<string | null>(null)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) setLocalError(validateAndSet(dropped))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) setLocalError(validateAndSet(selected))
  }

  const displayError = error ?? localError

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragActive(true)
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer rounded-sm border-2 border-dashed
          px-6 py-14 text-center transition-colors
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-safety focus-visible:outline-offset-2
          ${isDragActive ? 'border-safety bg-safety/5' : 'border-steel/50 bg-white/60 hover:border-steel'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          onChange={handleInputChange}
          className="sr-only"
          aria-label="Selecionar arquivo de vídeo"
        />

        {!file ? (
          <>
            <p className="font-display text-lg text-ink">
              Arraste o vídeo aqui, ou clique para selecionar
            </p>
            <p className="mt-2 font-mono text-xs text-steel">
              MP4 · MOV · AVI — até 500 MB, 15 min de duração
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <span className="h-2 w-2 rounded-full bg-safety" aria-hidden />
            <p className="font-mono text-sm text-ink">{file.name}</p>
            <span className="font-mono text-xs text-steel">{formatBytes(file.size)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onFileSelected(null)
                setLocalError(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
              className="ml-2 font-mono text-xs text-steel underline hover:text-safety"
            >
              trocar
            </button>
          </div>
        )}
      </div>

      {displayError && (
        <p className="mt-2 font-mono text-xs text-safety" role="alert">
          {displayError}
        </p>
      )}
    </div>
  )
}