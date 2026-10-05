import { SignalOrgan } from './SignalOrgan'

export function TubeMascot({ loading = false }: { loading?: boolean }) {
  return <div className={`mt-mascot${loading ? ' mt-mascot-loading' : ''}`} aria-hidden="true"><SignalOrgan /></div>
}
