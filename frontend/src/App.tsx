function App() {
  const today = new Date().toLocaleDateString('pt-BR')

  return (
    <div className="min-h-screen flex flex-col">
      {/* Cabeçalho estilo "carimbo de prancheta" — canto de identificação
          que todo desenho técnico de engenharia carrega */}
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
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 40%, var(--color-paper) 100%)',
            opacity: 0.6,
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          <p className="font-mono text-sm text-steel">
            [ próximo arquivo: zona de upload entra aqui ]
          </p>
        </div>
      </main>
    </div>
  )
}

export default App