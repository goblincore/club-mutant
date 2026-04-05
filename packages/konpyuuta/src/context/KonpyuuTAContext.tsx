import { createContext, useContext, ReactNode } from 'react'
import type { KonpyuuTAContextValue } from '../types'

const KonpyuuTAContext = createContext<KonpyuuTAContextValue | null>(null)

interface KonpyuuTAProviderProps extends KonpyuuTAContextValue {
  children: ReactNode
}

export function KonpyuuTAProvider({ children, ...value }: KonpyuuTAProviderProps) {
  return (
    <KonpyuuTAContext.Provider value={value}>
      {children}
    </KonpyuuTAContext.Provider>
  )
}

export function useKonpyuuTA(): KonpyuuTAContextValue {
  const ctx = useContext(KonpyuuTAContext)
  if (!ctx) throw new Error('useKonpyuuTA must be used within KonpyuuTAProvider')
  return ctx
}
