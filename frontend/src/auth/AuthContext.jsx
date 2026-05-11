/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient, configureApiClient } from '../api/client'

const AuthContext = createContext(null)
const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000

const anonymousState = {
  isReady: false,
  accessToken: null,
  user: null,
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(anonymousState)
  const stateRef = useRef(anonymousState)
  const didInitializeRef = useRef(false)

  const applyAuthenticatedUser = useCallback((user, accessToken = stateRef.current.accessToken) => {
    setAuthState({
      isReady: true,
      accessToken,
      user,
    })
  }, [])

  useEffect(() => {
    stateRef.current = authState
  }, [authState])

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => stateRef.current.accessToken,
      refreshAccessToken: async () => {
        const payload = await apiClient.refreshSession()
        applyAuthenticatedUser(payload.user, payload.access_token)
        return payload.access_token
      },
      handleAuthFailure: () => {
        setAuthState({
          isReady: true,
          accessToken: null,
          user: null,
        })
      },
    })
  }, [applyAuthenticatedUser])

  useEffect(() => {
    if (didInitializeRef.current) {
      return
    }

    didInitializeRef.current = true

    const initializeSession = async () => {
      try {
        const payload = await apiClient.refreshSession()
        applyAuthenticatedUser(payload.user, payload.access_token)
      } catch {
        setAuthState({
          isReady: true,
          accessToken: null,
          user: null,
        })
      }
    }

    initializeSession()
  }, [applyAuthenticatedUser])

  useEffect(() => {
    if (!authState.isReady || !authState.accessToken || !authState.user) {
      return undefined
    }

    let isCancelled = false

    const sendPresence = async () => {
      try {
        await apiClient.sendPresence()
      } catch {
        if (isCancelled) {
          return
        }
      }
    }

    sendPresence()
    const intervalId = window.setInterval(() => {
      sendPresence()
    }, PRESENCE_HEARTBEAT_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendPresence()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authState.accessToken, authState.isReady, authState.user])

  const login = useCallback(async (payload) => {
    const response = await apiClient.login(payload)
    applyAuthenticatedUser(response.user, response.access_token)
    return response
  }, [applyAuthenticatedUser])

  const registerPatient = useCallback((payload) => apiClient.registerPatient(payload), [])

  const logout = useCallback(async () => {
    try {
      await apiClient.logout()
    } finally {
      setAuthState({
        isReady: true,
        accessToken: null,
        user: null,
      })
    }
  }, [])

  const refreshSession = useCallback(async () => {
    const payload = await apiClient.refreshSession()
    applyAuthenticatedUser(payload.user, payload.access_token)
    return payload
  }, [applyAuthenticatedUser])

  const loadProfile = useCallback(async () => {
    const profile = await apiClient.getMe()
    applyAuthenticatedUser(profile)
    return profile
  }, [applyAuthenticatedUser])

  const updateProfile = useCallback(async (payload) => {
    const profile = await apiClient.updateMe(payload)
    applyAuthenticatedUser(profile)
    return profile
  }, [applyAuthenticatedUser])

  const uploadAvatar = useCallback(async (file) => {
    const profile = await apiClient.uploadMyAvatar(file)
    applyAuthenticatedUser(profile)
    return profile
  }, [applyAuthenticatedUser])

  const changePassword = useCallback((payload) => apiClient.changePassword(payload), [])

  const contextValue = useMemo(
    () => ({
      ...authState,
      isAuthenticated: Boolean(authState.user && authState.accessToken),
      login,
      logout,
      refreshSession,
      loadProfile,
      updateProfile,
      uploadAvatar,
      changePassword,
      registerPatient,
      hasRole: (...roles) => Boolean(authState.user && roles.includes(authState.user.role)),
      isVerifiedDoctor: Boolean(authState.user?.is_verified_doctor),
    }),
    [
      authState,
      changePassword,
      loadProfile,
      login,
      logout,
      registerPatient,
      refreshSession,
      updateProfile,
      uploadAvatar,
    ],
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
