/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import virtualmedicIcon from '../assets/virtualmedic-icon.png'
import { apiClient, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AppLink, useRouter } from '../router'
import { routes } from '../routes'

const MaintenanceContext = createContext(null)
const POLL_INTERVAL_MS = 30000

function formatUpdatedAt(value) {
  if (!value) {
    return ''
  }

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function isLoginRoute(pathname) {
  return [routes.login, routes.loginLegacy].includes(pathname)
}

function MaintenanceScreen({ updatedAt }) {
  return (
    <main className="min-h-screen bg-[#f7f2e7] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <section className="w-full max-w-5xl rounded-[2rem] bg-white px-6 py-10 text-center shadow-[0_30px_80px_rgba(15,23,42,0.08)] sm:px-10 sm:py-14 md:rounded-[3rem] md:px-16 md:py-18">
          <div className="mb-8 flex items-center justify-center gap-3">
            <img alt="VirtualMedic" className="h-12 w-12 rounded-2xl object-cover shadow-sm" src={virtualmedicIcon} />
            <span className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              VirtualMedic
            </span>
          </div>

          <p className="mb-4 text-sm font-semibold tracking-[0.28em] text-amber-700 uppercase sm:text-base">
            Временные изменения
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl leading-tight font-black tracking-tight text-slate-950 sm:text-5xl md:text-6xl">
            Мы временно ограничили доступ к сайту.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            Платформа находится в режиме технических работ.
          </p>

          {updatedAt ? (
            <p className="mt-8 text-sm text-slate-400">
              Последнее изменение режима: {updatedAt}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export function MaintenanceProvider({ children }) {
  const auth = useAuth()
  const { location } = useRouter()
  const [state, setState] = useState({
    isReady: false,
    enabled: false,
    updatedAt: '',
    error: '',
  })

  const refreshMaintenance = useCallback(async () => {
    try {
      const payload = await apiClient.getMaintenanceState()
      setState({
        isReady: true,
        enabled: Boolean(payload.enabled),
        updatedAt: formatUpdatedAt(payload.updated_at),
        error: '',
      })
      return payload
    } catch (error) {
      setState((current) => ({
        ...current,
        isReady: true,
        error: error instanceof ApiError ? error.message : 'Не удалось загрузить состояние заглушки',
      }))
      return null
    }
  }, [])

  useEffect(() => {
    refreshMaintenance()

    const intervalId = window.setInterval(() => {
      refreshMaintenance()
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refreshMaintenance])

  const contextValue = useMemo(() => {
    const isAdmin = auth.hasRole('admin', 'superuser')
    const shouldShowMaintenance =
      state.isReady && state.enabled && !isAdmin && !isLoginRoute(location.pathname)

    return {
      ...state,
      shouldShowMaintenance,
      refreshMaintenance,
    }
  }, [auth, location, refreshMaintenance, state])

  return <MaintenanceContext.Provider value={contextValue}>{children}</MaintenanceContext.Provider>
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext)

  if (!context) {
    throw new Error('useMaintenance must be used inside MaintenanceProvider')
  }

  return context
}

export function MaintenanceGate({ children }) {
  const maintenance = useMaintenance()

  if (maintenance.shouldShowMaintenance) {
    return <MaintenanceScreen updatedAt={maintenance.updatedAt} />
  }

  return children
}
