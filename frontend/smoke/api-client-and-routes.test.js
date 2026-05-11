import test from 'node:test'
import assert from 'node:assert/strict'

import { apiClient, configureApiClient } from '../src/api/client.js'
import { getDefaultAuthenticatedPath, resolveSafeAppPath, routes, withReturnTo } from '../src/routes.js'

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

test.beforeEach(() => {
  configureApiClient({
    getAccessToken: () => null,
    refreshAccessToken: null,
    handleAuthFailure: () => {},
  })
})

test('login posts JSON payload with cookies enabled', async () => {
  const requests = []

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({
      access_token: 'access-token',
      expires_in: 900,
      token_type: 'bearer',
      user: {
        id: 1,
        username: 'patient_001',
        role: 'patient',
        is_active: true,
        is_verified_doctor: false,
        qualification_documents_count: 0,
        specializations: [],
      },
    })
  }

  const payload = await apiClient.login({
    username: 'patient_001',
    password: 'StrongPass!123',
  })

  assert.equal(payload.access_token, 'access-token')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/v1/auth/login')
  assert.equal(requests[0].options.method, 'POST')
  assert.equal(requests[0].options.credentials, 'include')
  assert.equal(requests[0].options.headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    username: 'patient_001',
    password: 'StrongPass!123',
  })
})

test('doctor registration builds multipart payload with repeated specialization and document fields', async () => {
  let capturedBody = null

  globalThis.fetch = async (_url, options) => {
    capturedBody = options.body
    return jsonResponse({
      id: 7,
      username: 'doctor_007',
      role: 'doctor',
      is_active: true,
      is_verified_doctor: false,
      qualification_documents_count: 2,
      specializations: [],
    }, { status: 201 })
  }

  const firstDocument = new File(['pdf'], 'license.pdf', { type: 'application/pdf' })
  const secondDocument = new File(['png'], 'diploma.png', { type: 'image/png' })

  await apiClient.registerDoctor({
    username: 'doctor_007',
    password: 'DoctorPass!123',
    first_name: 'Olga',
    last_name: 'Medvedeva',
    specialization_ids: [5, 2],
    documents: [firstDocument, secondDocument],
  })

  assert.ok(capturedBody instanceof FormData)
  assert.equal(capturedBody.get('username'), 'doctor_007')
  assert.equal(capturedBody.get('password'), 'DoctorPass!123')
  assert.deepEqual(capturedBody.getAll('specialization_ids'), ['5', '2'])
  assert.equal(capturedBody.getAll('documents').length, 2)
})

test('protected requests retry once after refresh and reuse the new access token', async () => {
  const authFailures = []
  const authorizationHeaders = []
  let currentToken = 'expired-token'
  let requestCount = 0
  let refreshCount = 0

  configureApiClient({
    getAccessToken: () => currentToken,
    refreshAccessToken: async () => {
      refreshCount += 1
      currentToken = 'fresh-token'
      return currentToken
    },
    handleAuthFailure: () => {
      authFailures.push('failed')
    },
  })

  globalThis.fetch = async (_url, options) => {
    requestCount += 1
    authorizationHeaders.push(options.headers.get('Authorization'))

    if (requestCount === 1) {
      return jsonResponse({ detail: 'expired' }, { status: 401 })
    }

    return jsonResponse({
      id: 9,
      username: 'patient_profile',
      role: 'patient',
      is_active: true,
      is_verified_doctor: false,
      qualification_documents_count: 0,
      specializations: [],
    })
  }

  const profile = await apiClient.getMe()

  assert.equal(profile.username, 'patient_profile')
  assert.equal(refreshCount, 1)
  assert.deepEqual(authFailures, [])
  assert.deepEqual(authorizationHeaders, ['Bearer expired-token', 'Bearer fresh-token'])
})

test('route helpers keep redirects inside the app and select correct dashboards', () => {
  assert.equal(getDefaultAuthenticatedPath({ role: 'patient' }), routes.account)
  assert.equal(getDefaultAuthenticatedPath({ role: 'doctor' }), routes.account)
  assert.equal(getDefaultAuthenticatedPath({ role: 'admin' }), routes.admin)
  assert.equal(resolveSafeAppPath('/questions?tab=latest'), '/questions?tab=latest')
  assert.equal(resolveSafeAppPath('https://example.com'), routes.landing)
  assert.equal(resolveSafeAppPath('/api/v1/auth/me'), routes.landing)
  assert.equal(withReturnTo(routes.login, '/account?tab=security'), '/login?returnTo=%2Faccount%3Ftab%3Dsecurity')
})

test('maintenance state uses dedicated endpoints', async () => {
  const requests = []

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })

    if (options.method === 'PATCH') {
      return jsonResponse({ enabled: true, updated_at: '2026-04-23T22:45:00Z' })
    }

    return jsonResponse({ enabled: false, updated_at: null })
  }

  const state = await apiClient.getMaintenanceState()
  const updatedState = await apiClient.updateMaintenanceState({ enabled: true })

  assert.equal(state.enabled, false)
  assert.equal(updatedState.enabled, true)
  assert.equal(requests[0].url, '/api/v1/maintenance/')
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[1].url, '/api/v1/maintenance/')
  assert.equal(requests[1].options.method, 'PATCH')
  assert.equal(requests[1].options.headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(requests[1].options.body), { enabled: true })
})

test('specialization mutations use admin authenticated endpoints', async () => {
  const requests = []

  configureApiClient({
    getAccessToken: () => 'admin-token',
    refreshAccessToken: null,
    handleAuthFailure: () => {},
  })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })

    if (options.method === 'DELETE') {
      return new Response(null, { status: 204 })
    }

    return jsonResponse({ id: 11, name: 'Кардиолог' }, { status: options.method === 'POST' ? 201 : 200 })
  }

  await apiClient.createSpecialization({ name: 'Кардиолог' })
  await apiClient.updateSpecialization(11, { name: 'Детский кардиолог' })
  await apiClient.deleteSpecialization(11)

  assert.deepEqual(
    requests.map((request) => [request.url, request.options.method]),
    [
      ['/api/v1/specializations/', 'POST'],
      ['/api/v1/specializations/11', 'PATCH'],
      ['/api/v1/specializations/11', 'DELETE'],
    ],
  )
  assert.deepEqual(
    requests.map((request) => request.options.headers.get('Authorization')),
    ['Bearer admin-token', 'Bearer admin-token', 'Bearer admin-token'],
  )
  assert.deepEqual(JSON.parse(requests[0].options.body), { name: 'Кардиолог' })
  assert.deepEqual(JSON.parse(requests[1].options.body), { name: 'Детский кардиолог' })
})
