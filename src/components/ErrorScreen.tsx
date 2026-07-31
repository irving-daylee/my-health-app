import { Component, type ErrorInfo, type ReactNode } from 'react'

export function ErrorScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="error-screen">
      <div className="error-card">
        <h1>{title}</h1>
        <p>
          Ververs de pagina. Blijft dit staan, laat dan de tekst hieronder zien — daar staat wat er
          misging.
        </p>
        {detail && <pre>{detail}</pre>}
        <button className="btn block" onClick={() => location.reload()}>
          Opnieuw proberen
        </button>
      </div>
    </div>
  )
}

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Zonder dit levert elke fout tijdens het renderen een leeg wit scherm op,
 * zonder enige aanwijzing wat er aan de hand is. Liever een leesbare melding.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Renderfout:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          title="Er ging iets mis"
          detail={`${this.state.error.name}: ${this.state.error.message}`}
        />
      )
    }
    return this.props.children
  }
}
