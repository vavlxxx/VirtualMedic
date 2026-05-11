const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api/v1'

let getAccessToken = () => null
let refreshAccessToken = null
let handleAuthFailure = () => {}
let refreshPromise = null

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? null
    this.payload = options.payload ?? null
    this.fieldErrors = options.fieldErrors ?? {}
  }
}

export function configureApiClient(options = {}) {
  getAccessToken = options.getAccessToken || (() => null)
  refreshAccessToken = options.refreshAccessToken || null
  handleAuthFailure = options.handleAuthFailure || (() => {})
}

function createFieldErrors(payload) {
  if (!Array.isArray(payload?.detail)) {
    return {}
  }

  return payload.detail.reduce((accumulator, issue) => {
    const path = Array.isArray(issue?.loc) ? issue.loc.at(-1) : null
    const message = typeof issue?.msg === 'string' ? issue.msg : 'Invalid value'

    if (typeof path === 'string' && !accumulator[path]) {
      accumulator[path] = message
    }

    return accumulator
  }, {})
}

async function parseResponse(response, responseType) {
  if (response.status === 204) {
    return null
  }

  if (responseType === 'blobWithMeta') {
    const blob = await response.blob()

    return {
      blob,
      contentType: response.headers.get('content-type') || blob.type || 'application/octet-stream',
      fileName: extractFileName(response.headers.get('content-disposition')),
    }
  }

  if (responseType === 'blob') {
    return response.blob()
  }

  if (responseType === 'text') {
    return response.text()
  }

  return response.json()
}

function extractFileName(contentDisposition) {
  if (!contentDisposition) {
    return 'download'
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const regularMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
  return regularMatch?.[1] || 'download'
}

function buildRequestHeaders(headers, body) {
  const requestHeaders = new Headers(headers || {})

  if (!(body instanceof FormData) && body !== undefined && body !== null && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  return requestHeaders
}

async function doRequest(path, options) {
  const requestHeaders = buildRequestHeaders(options.headers, options.body)

  if (options.auth) {
    const accessToken = getAccessToken()
    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: requestHeaders,
    body: options.body,
  })
}

async function request(path, options = {}) {
  const settings = {
    auth: false,
    responseType: 'json',
    retryOnUnauthorized: true,
    ...options,
  }

  let response = await doRequest(path, settings)

  if (response.status === 401 && settings.auth && settings.retryOnUnauthorized && refreshAccessToken) {
    try {
      refreshPromise ||= refreshAccessToken()
      await refreshPromise
      response = await doRequest(path, {
        ...settings,
        retryOnUnauthorized: false,
      })
    } catch {
      handleAuthFailure()
      throw new ApiError('Session expired', { status: 401 })
    } finally {
      refreshPromise = null
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message =
      typeof payload?.detail === 'string'
        ? payload.detail
        : response.status === 401
          ? 'Authentication required'
          : 'API request failed'

    if (response.status === 401 && settings.auth) {
      handleAuthFailure()
    }

    throw new ApiError(message, {
      status: response.status,
      payload,
      fieldErrors: createFieldErrors(payload),
    })
  }

  return parseResponse(response, settings.responseType)
}

function createQueryString(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    query.set(key, String(value))
  })

  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

function appendDoctorRegistrationFields(formData, payload) {
  formData.set('username', payload.username)
  formData.set('password', payload.password)

  if (payload.first_name) {
    formData.set('first_name', payload.first_name)
  }

  if (payload.last_name) {
    formData.set('last_name', payload.last_name)
  }

  payload.specialization_ids.forEach((item) => {
    formData.append('specialization_ids', String(item))
  })

  payload.documents.forEach((document) => {
    formData.append('documents', document)
  })

  return formData
}

/**
 * DTO storage convention for the current JS codebase:
 * frontend API shapes are documented in this module and returned as plain objects.
 */
export const apiClient = {
  registerPatient(payload) {
    return request('/auth/register/patient', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  registerDoctor(payload) {
    return request('/auth/register/doctor', {
      method: 'POST',
      body: appendDoctorRegistrationFields(new FormData(), payload),
    })
  },

  login(payload) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  logout() {
    return request('/auth/logout', {
      method: 'POST',
      retryOnUnauthorized: false,
    })
  },

  sendPresence() {
    return request('/auth/presence', {
      method: 'POST',
      auth: true,
    })
  },

  refreshSession() {
    return request('/auth/refresh', {
      method: 'POST',
      retryOnUnauthorized: false,
    })
  },

  getMe() {
    return request('/auth/me', { auth: true })
  },

  getMyDocuments() {
    return request('/auth/me/documents', { auth: true })
  },

  getMaintenanceState() {
    return request('/maintenance/')
  },

  updateMaintenanceState(payload) {
    return request('/maintenance/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  updateMe(payload) {
    return request('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  uploadMyAvatar(file) {
    const formData = new FormData()
    formData.set('avatar', file)

    return request('/auth/me/avatar', {
      method: 'POST',
      body: formData,
      auth: true,
    })
  },

  deleteMyAvatar() {
    return request('/auth/me/avatar', {
      method: 'DELETE',
      auth: true,
    })
  },

  changePassword(payload) {
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  listSpecializations() {
    return request('/specializations/')
  },

  createSpecialization(payload) {
    return request('/specializations/', {
      method: 'POST',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  updateSpecialization(specializationId, payload) {
    return request(`/specializations/${specializationId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  deleteSpecialization(specializationId) {
    return request(`/specializations/${specializationId}`, {
      method: 'DELETE',
      auth: true,
    })
  },

  listDoctors(params = {}) {
    return request(`/doctors/${createQueryString(params)}`)
  },

  getDoctor(doctorId) {
    return request(`/doctors/${doctorId}`)
  },

  uploadDoctorDocuments(documents) {
    const formData = new FormData()
    documents.forEach((document) => {
      formData.append('documents', document)
    })

    return request('/doctors/me/documents', {
      method: 'POST',
      body: formData,
      auth: true,
    })
  },

  listQuestions(params = {}) {
    return request(`/questions/${createQueryString(params)}`)
  },

  getQuestion(questionId) {
    return request(`/questions/${questionId}`)
  },

  createQuestion(payload) {
    return request('/questions/', {
      method: 'POST',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  createQuestionComment(questionId, payload) {
    return request(`/questions/${questionId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  getPendingDoctors(params = {}) {
    return request(`/admin/doctors/pending${createQueryString(params)}`, {
      auth: true,
    })
  },

  getAdminDashboard(params = {}) {
    return request(`/admin/dashboard${createQueryString(params)}`, {
      auth: true,
    })
  },

  listAdminUsers(params = {}) {
    return request(`/admin/users${createQueryString(params)}`, {
      auth: true,
    })
  },

  updateAdminUserStatus(userId, payload) {
    return request(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  deleteAdminUser(userId) {
    return request(`/admin/users/${userId}`, {
      method: 'DELETE',
      auth: true,
    })
  },

  listAdminQuestions(params = {}) {
    return request(`/admin/questions${createQueryString(params)}`, {
      auth: true,
    })
  },

  deleteAdminQuestion(questionId) {
    return request(`/admin/questions/${questionId}`, {
      method: 'DELETE',
      auth: true,
    })
  },

  listAdminAnswers(params = {}) {
    return request(`/admin/answers${createQueryString(params)}`, {
      auth: true,
    })
  },

  deleteAdminAnswer(answerId) {
    return request(`/admin/answers/${answerId}`, {
      method: 'DELETE',
      auth: true,
    })
  },

  getDoctorForModeration(doctorId) {
    return request(`/admin/doctors/${doctorId}`, {
      auth: true,
    })
  },

  verifyDoctor(doctorId, payload) {
    return request(`/admin/doctors/${doctorId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      auth: true,
    })
  },

  downloadDoctorDocument(documentId) {
    return request(`/admin/documents/${documentId}`, {
      auth: true,
      responseType: 'blobWithMeta',
    })
  },
}
