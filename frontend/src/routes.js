export const routes = Object.freeze({
  landing: '/',
  login: '/login',
  loginLegacy: '/login-desktop-ru',
  register: '/register',
  registerLegacy: '/registration-desktop-ru',
  doctors: '/doctors',
  doctorsLegacy: '/doctor-directory-with-filters-ru',
  doctorProfile: '/doctor',
  doctorProfileLegacy: '/doctor-public-profile-ru',
  questions: '/questions',
  questionsLegacy: '/public-questions-feed-ru',
  questionDetail: '/question',
  questionDetailLegacy: '/public-question-detail-ru',
  account: '/account',
  profileAlias: '/profile',
  admin: '/admin',
  adminLegacy: '/admin-doctor-moderation',
  notFound: '/404',
})

export function getDefaultAuthenticatedPath(user) {
  if (user?.role === 'admin' || user?.role === 'superuser') {
    return routes.admin
  }

  return routes.account
}

export function resolveSafeAppPath(value, fallback = routes.landing) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }

  if (value.startsWith('/api')) {
    return fallback
  }

  return value
}

export function withReturnTo(path, returnTo) {
  const safeReturnTo = resolveSafeAppPath(returnTo, '')

  if (!safeReturnTo) {
    return path
  }

  const searchParams = new URLSearchParams()
  searchParams.set('returnTo', safeReturnTo)

  return `${path}?${searchParams.toString()}`
}
