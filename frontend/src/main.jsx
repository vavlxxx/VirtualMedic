/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './auth-shell.css'
import './public-pages.css'
import './virtualmedic-reference.css'
import App from './App.jsx'
import AdminDoctorModerationPage from './AdminDoctorModerationPage.jsx'
import AccountPage from './AccountPage.jsx'
import DoctorDirectoryWithFiltersPage from './DoctorDirectoryWithFiltersPage.jsx'
import DoctorPublicProfilePage from './DoctorPublicProfilePage.jsx'
import PublicQuestionsFeedPage from './PublicQuestionsFeedPage.jsx'
import QuestionPublicDetailPage from './QuestionPublicDetailPage.jsx'
import LoginDesktopPage from './LoginDesktopPage.jsx'
import RegistrationDesktopPage from './RegistrationDesktopPage.jsx'
import NotFoundPage from './NotFoundPage.jsx'
import { MaintenanceGate, MaintenanceProvider } from './maintenance/MaintenanceContext.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { GuestOnlyRoute, ProtectedRoute } from './RouteGuards.jsx'
import { PatientProfileCompletionGate } from './PatientProfileCompletionGate.jsx'
import { RouterProvider, useRouter } from './router.jsx'
import { routes } from './routes.js'
import './patient-profile-gate.css'

const routeMap = {
  [routes.landing]: { component: App, access: 'public' },
  [routes.account]: { component: AccountPage, access: 'protected' },
  [routes.profileAlias]: {
    redirectTo: routes.account,
    preserveSearch: true,
    access: 'protected',
  },
  [routes.admin]: {
    component: AdminDoctorModerationPage,
    access: 'protected',
    roles: ['admin', 'superuser'],
  },
  [routes.adminLegacy]: {
    redirectTo: routes.admin,
    preserveSearch: true,
    access: 'protected',
    roles: ['admin', 'superuser'],
  },
  [routes.doctors]: {
    component: DoctorDirectoryWithFiltersPage,
    access: 'public',
  },
  [routes.doctorsLegacy]: {
    redirectTo: routes.doctors,
    preserveSearch: true,
    access: 'public',
  },
  [routes.doctorProfile]: {
    component: DoctorPublicProfilePage,
    access: 'public',
  },
  [routes.doctorProfileLegacy]: {
    redirectTo: routes.doctorProfile,
    preserveSearch: true,
    access: 'public',
  },
  [routes.questions]: {
    component: PublicQuestionsFeedPage,
    access: 'public',
  },
  [routes.questionsLegacy]: {
    redirectTo: routes.questions,
    preserveSearch: true,
    access: 'public',
  },
  [routes.questionDetail]: {
    component: QuestionPublicDetailPage,
    access: 'public',
  },
  [routes.questionDetailLegacy]: {
    redirectTo: routes.questionDetail,
    preserveSearch: true,
    access: 'public',
  },
  [routes.login]: { component: LoginDesktopPage, access: 'guest' },
  [routes.loginLegacy]: {
    redirectTo: routes.login,
    preserveSearch: true,
    access: 'guest',
  },
  [routes.register]: { component: RegistrationDesktopPage, access: 'guest' },
  [routes.registerLegacy]: {
    redirectTo: routes.register,
    preserveSearch: true,
    access: 'guest',
  },
  [routes.notFound]: { component: NotFoundPage, access: 'public' },
}

function RouteRedirect({ preserveSearch = false, to }) {
  const { location, navigate } = useRouter()

  useEffect(() => {
    const destination = `${to}${preserveSearch ? location.search : ''}${location.hash || ''}`

    if (`${location.pathname}${location.search}${location.hash || ''}` !== destination) {
      navigate(destination, { replace: true })
    }
  }, [location.hash, location.pathname, location.search, navigate, preserveSearch, to])

  return null
}

function RouteRenderer() {
  const { location } = useRouter()
  const route = routeMap[location.pathname] || routeMap[routes.notFound]
  const PageComponent = route.component
  const page = route.redirectTo ? (
    <RouteRedirect preserveSearch={route.preserveSearch} to={route.redirectTo} />
  ) : (
    <PageComponent />
  )

  if (route.access === 'guest') {
    return (
      <GuestOnlyRoute>
        {page}
      </GuestOnlyRoute>
    )
  }

  if (route.access === 'protected') {
    return (
      <ProtectedRoute roles={route.roles || null}>
        {page}
      </ProtectedRoute>
    )
  }

  return page
}

function PreloaderGate({ children }) {
  const auth = useAuth()

  useEffect(() => {
    if (auth.isReady) {
      if (typeof window.__resolvePreloader === 'function') {
        window.__resolvePreloader('authReady')
      }
    }
  }, [auth.isReady])

  return children
}

function RootApp() {
  return (
    <RouterProvider>
      <AuthProvider>
        <MaintenanceProvider>
          <MaintenanceGate>
            <PreloaderGate>
              <RouteRenderer />
              <PatientProfileCompletionGate />
            </PreloaderGate>
          </MaintenanceGate>
        </MaintenanceProvider>
      </AuthProvider>
    </RouterProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
