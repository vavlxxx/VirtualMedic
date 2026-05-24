import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { AppLink } from './router'
import {
  buildQuestionHref,
  downloadBlobFile,
  formatDateTime,
  formatFileSize,
  getDisplayName,
} from './publicPageUtils'
import { VirtualMedicPage } from './VirtualMedicLayout'
import { summarizeQuestion } from './virtualmedicReference'

const PAGE_LIMIT = 10

const ADMIN_TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'users', label: 'Пользователи' },
  { key: 'specializations', label: 'Специализации' },
  { key: 'questions', label: 'Вопросы' },
  { key: 'answers', label: 'Ответы' },
  { key: 'doctors', label: 'Заявки врачей' },
]

function createCollectionState() {
  return {
    items: [],
    total: 0,
    isLoading: false,
    error: '',
  }
}

function parseBooleanFilter(value) {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return undefined
}

function getRoleLabel(role) {
  switch (role) {
    case 'superuser':
      return 'Суперпользователь'
    case 'admin':
      return 'Администратор'
    case 'doctor':
      return 'врач'
    case 'patient':
      return 'пациент'
    default:
      return role || 'роль неизвестна'
  }
}

function getPaginationLabel(offset, limit, total) {
  if (!total) {
    return 'Нет записей'
  }

  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return `${from}-${to} из ${total}`
}

function PaginationControls({ offset, limit, total, onPrev, onNext }) {
  if (!total) {
    return null
  }

  const canGoPrev = offset > 0
  const canGoNext = offset + limit < total

  return (
    <div className="vm-admin-pagination">
      <span className="vm-muted">{getPaginationLabel(offset, limit, total)}</span>
      <div className="vm-admin-pagination__actions">
        <button className="vm-button vm-button--soft" type="button" onClick={onPrev} disabled={!canGoPrev}>
          Назад
        </button>
        <button className="vm-button vm-button--soft" type="button" onClick={onNext} disabled={!canGoNext}>
          Дальше
        </button>
      </div>
    </div>
  )
}

function AdminToolbar({ children }) {
  return <div className="vm-admin-toolbar">{children}</div>
}

function EmptyState({ title, description }) {
  return (
    <section className="vm-card vm-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}

function AdminDoctorModerationPage() {
  const auth = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [feedback, setFeedback] = useState({ type: '', text: '' })
  const [maintenanceState, setMaintenanceState] = useState(null)
  const [maintenanceError, setMaintenanceError] = useState('')
  const [isMaintenanceSubmitting, setIsMaintenanceSubmitting] = useState(false)

  const [dashboard, setDashboard] = useState(null)
  const [isDashboardLoading, setIsDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')

  const [usersQuery, setUsersQuery] = useState({
    search: '',
    role: '',
    is_active: '',
    is_verified_doctor: '',
    offset: 0,
    limit: PAGE_LIMIT,
  })
  const [usersState, setUsersState] = useState(createCollectionState)

  const [specializationsState, setSpecializationsState] = useState({
    items: [],
    isLoading: false,
    error: '',
  })
  const [specializationDraft, setSpecializationDraft] = useState('')
  const [specializationDraftError, setSpecializationDraftError] = useState('')
  const [editingSpecializationId, setEditingSpecializationId] = useState(null)
  const [editingSpecializationName, setEditingSpecializationName] = useState('')
  const [specializationSubmittingId, setSpecializationSubmittingId] = useState(null)
  const [isSpecializationCreating, setIsSpecializationCreating] = useState(false)

  const [questionsQuery, setQuestionsQuery] = useState({
    search: '',
    answered: '',
    offset: 0,
    limit: PAGE_LIMIT,
  })
  const [questionsState, setQuestionsState] = useState(createCollectionState)

  const [answersQuery, setAnswersQuery] = useState({
    search: '',
    offset: 0,
    limit: PAGE_LIMIT,
  })
  const [answersState, setAnswersState] = useState(createCollectionState)

  const [pendingQuery, setPendingQuery] = useState({
    search: '',
    offset: 0,
    limit: PAGE_LIMIT,
  })
  const [pendingState, setPendingState] = useState(createCollectionState)

  const [selectedDoctor, setSelectedDoctor] = useState(null)
  const [isDoctorDetailsLoading, setIsDoctorDetailsLoading] = useState(false)
  const [doctorActionMessage, setDoctorActionMessage] = useState('')
  const [doctorActionError, setDoctorActionError] = useState('')
  const [isVerifySubmitting, setIsVerifySubmitting] = useState(false)
  const [downloadingDocumentId, setDownloadingDocumentId] = useState(null)

  const setCollectionLoading = (setter) => setter((current) => ({ ...current, isLoading: true, error: '' }))
  const setCollectionError = (setter, message) => setter((current) => ({ ...current, isLoading: false, error: message }))

  const loadMaintenanceState = useCallback(async () => {
    setMaintenanceError('')

    try {
      const response = await apiClient.getMaintenanceState()
      setMaintenanceState(response)
    } catch (error) {
      setMaintenanceError(
        error instanceof ApiError ? error.message : 'Не удалось загрузить состояние заглушки',
      )
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    setIsDashboardLoading(true)
    setDashboardError('')

    try {
      const response = await apiClient.getAdminDashboard()
      setDashboard(response)
    } catch (error) {
      setDashboardError(error instanceof ApiError ? error.message : 'Не удалось загрузить обзор админки')
    } finally {
      setIsDashboardLoading(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setCollectionLoading(setUsersState)

    try {
      const response = await apiClient.listAdminUsers({
        ...usersQuery,
        is_active: parseBooleanFilter(usersQuery.is_active),
        is_verified_doctor: parseBooleanFilter(usersQuery.is_verified_doctor),
      })
      setUsersState({
        items: response.items,
        total: response.total,
        isLoading: false,
        error: '',
      })
    } catch (error) {
      setCollectionError(setUsersState, error instanceof ApiError ? error.message : 'Не удалось загрузить пользователей')
    }
  }, [usersQuery])

  const loadSpecializations = useCallback(async () => {
    setSpecializationsState((current) => ({ ...current, isLoading: true, error: '' }))

    try {
      const response = await apiClient.listSpecializations()
      setSpecializationsState({
        items: response,
        isLoading: false,
        error: '',
      })
    } catch (error) {
      setSpecializationsState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof ApiError ? error.message : 'Не удалось загрузить специализации',
      }))
    }
  }, [])

  const loadQuestions = useCallback(async () => {
    setCollectionLoading(setQuestionsState)

    try {
      const response = await apiClient.listAdminQuestions({
        ...questionsQuery,
        answered: parseBooleanFilter(questionsQuery.answered),
      })
      setQuestionsState({
        items: response.items,
        total: response.total,
        isLoading: false,
        error: '',
      })
    } catch (error) {
      setCollectionError(setQuestionsState, error instanceof ApiError ? error.message : 'Не удалось загрузить вопросы')
    }
  }, [questionsQuery])

  const loadAnswers = useCallback(async () => {
    setCollectionLoading(setAnswersState)

    try {
      const response = await apiClient.listAdminAnswers(answersQuery)
      setAnswersState({
        items: response.items,
        total: response.total,
        isLoading: false,
        error: '',
      })
    } catch (error) {
      setCollectionError(setAnswersState, error instanceof ApiError ? error.message : 'Не удалось загрузить ответы')
    }
  }, [answersQuery])

  const loadPendingDoctors = useCallback(async () => {
    setCollectionLoading(setPendingState)

    try {
      const response = await apiClient.getPendingDoctors(pendingQuery)
      setPendingState({
        items: response.items,
        total: response.total,
        isLoading: false,
        error: '',
      })
    } catch (error) {
      setCollectionError(setPendingState, error instanceof ApiError ? error.message : 'Не удалось загрузить заявки врачей')
    }
  }, [pendingQuery])

  useEffect(() => {
    loadMaintenanceState()
  }, [loadMaintenanceState])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers()
    }
  }, [activeTab, loadUsers])

  useEffect(() => {
    if (activeTab === 'specializations') {
      loadSpecializations()
    }
  }, [activeTab, loadSpecializations])

  useEffect(() => {
    if (activeTab === 'questions') {
      loadQuestions()
    }
  }, [activeTab, loadQuestions])

  useEffect(() => {
    if (activeTab === 'answers') {
      loadAnswers()
    }
  }, [activeTab, loadAnswers])

  useEffect(() => {
    if (activeTab === 'doctors') {
      loadPendingDoctors()
    }
  }, [activeTab, loadPendingDoctors])

  const refreshVisibleData = async () => {
    await Promise.all([loadDashboard(), loadMaintenanceState()])

    if (activeTab === 'users') {
      await loadUsers()
    }
    if (activeTab === 'specializations') {
      await loadSpecializations()
    }
    if (activeTab === 'questions') {
      await loadQuestions()
    }
    if (activeTab === 'answers') {
      await loadAnswers()
    }
    if (activeTab === 'doctors') {
      await loadPendingDoctors()
    }
  }

  const handleMaintenanceToggle = async () => {
    if (!maintenanceState) {
      return
    }

    setIsMaintenanceSubmitting(true)
    setMaintenanceError('')

    try {
      const nextState = await apiClient.updateMaintenanceState({
        enabled: !maintenanceState.enabled,
      })
      setMaintenanceState(nextState)
      setFeedback({
        type: 'success',
        text: nextState.enabled
          ? 'Заглушка включена. Для обычных пользователей сайт заблокирован.'
          : 'Заглушка отключена. Сайт снова доступен пользователям.',
      })
    } catch (error) {
      setMaintenanceError(
        error instanceof ApiError ? error.message : 'Не удалось изменить состояние заглушки',
      )
    } finally {
      setIsMaintenanceSubmitting(false)
    }
  }

  const openDoctorDetails = async (doctorId) => {
    setDoctorActionError('')
    setDoctorActionMessage('')
    setIsDoctorDetailsLoading(true)

    try {
      const response = await apiClient.getDoctorForModeration(doctorId)
      setSelectedDoctor(response)
    } catch (error) {
      setDoctorActionError(error instanceof ApiError ? error.message : 'Не удалось загрузить карточку врача')
    } finally {
      setIsDoctorDetailsLoading(false)
    }
  }

  const handleVerifyToggle = async () => {
    if (!selectedDoctor) {
      return
    }

    setIsVerifySubmitting(true)
    setDoctorActionError('')
    setDoctorActionMessage('')

    try {
      const response = await apiClient.verifyDoctor(selectedDoctor.id, {
        is_verified: !selectedDoctor.is_verified_doctor,
      })
      setSelectedDoctor(response)
      setDoctorActionMessage(
        response.is_verified_doctor ? 'Врач успешно верифицирован.' : 'Верификация врача снята.',
      )
      setFeedback({
        type: 'success',
        text: response.is_verified_doctor ? 'Заявка врача одобрена.' : 'Статус верификации снят.',
      })
      await loadDashboard()
      await loadPendingDoctors()
    } catch (error) {
      setDoctorActionError(error instanceof ApiError ? error.message : 'Не удалось обновить статус врача')
    } finally {
      setIsVerifySubmitting(false)
    }
  }

  const handleDownloadDocument = async (documentId) => {
    setDownloadingDocumentId(documentId)
    setDoctorActionError('')

    try {
      const response = await apiClient.downloadDoctorDocument(documentId)
      downloadBlobFile(response.blob, response.fileName)
    } catch (error) {
      setDoctorActionError(error instanceof ApiError ? error.message : 'Не удалось скачать документ')
    } finally {
      setDownloadingDocumentId(null)
    }
  }

  const handleToggleUserStatus = async (user) => {
    if (user.id === auth.user?.id) {
      setFeedback({
        type: 'error',
        text: 'Нельзя заблокировать собственный аккаунт.',
      })
      return
    }

    const nextState = !user.is_active
    const confirmed = window.confirm(
      nextState
        ? `Разблокировать пользователя ${getDisplayName(user)}?`
        : `Заблокировать пользователя ${getDisplayName(user)}?`,
    )

    if (!confirmed) {
      return
    }

    try {
      await apiClient.updateAdminUserStatus(user.id, { is_active: nextState })
      setFeedback({
        type: 'success',
        text: nextState
          ? `Пользователь ${getDisplayName(user)} снова активен.`
          : `Пользователь ${getDisplayName(user)} заблокирован.`,
      })
      await loadDashboard()
      await loadUsers()
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'Не удалось обновить статус пользователя',
      })
    }
  }

  const handleCreateSpecialization = async (event) => {
    event.preventDefault()

    const name = specializationDraft.trim()
    if (!name) {
      setSpecializationDraftError('Введите название специализации')
      return
    }

    setIsSpecializationCreating(true)
    setSpecializationDraftError('')

    try {
      const created = await apiClient.createSpecialization({ name })
      setSpecializationDraft('')
      setFeedback({
        type: 'success',
        text: `Специализация «${created.name}» добавлена.`,
      })
      await loadSpecializations()
    } catch (error) {
      setSpecializationDraftError(
        error instanceof ApiError ? error.message : 'Не удалось добавить специализацию',
      )
    } finally {
      setIsSpecializationCreating(false)
    }
  }

  const startEditSpecialization = (specialization) => {
    setEditingSpecializationId(specialization.id)
    setEditingSpecializationName(specialization.name)
    setSpecializationDraftError('')
  }

  const cancelEditSpecialization = () => {
    setEditingSpecializationId(null)
    setEditingSpecializationName('')
  }

  const handleUpdateSpecialization = async (specialization) => {
    const name = editingSpecializationName.trim()
    if (!name) {
      setFeedback({ type: 'error', text: 'Название специализации не может быть пустым.' })
      return
    }

    if (name === specialization.name) {
      cancelEditSpecialization()
      return
    }

    setSpecializationSubmittingId(specialization.id)

    try {
      const updated = await apiClient.updateSpecialization(specialization.id, { name })
      setFeedback({
        type: 'success',
        text: `Специализация переименована в «${updated.name}».`,
      })
      cancelEditSpecialization()
      await loadSpecializations()
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'Не удалось переименовать специализацию',
      })
    } finally {
      setSpecializationSubmittingId(null)
    }
  }

  const handleDeleteSpecialization = async (specialization) => {
    const confirmed = window.confirm(
      `Удалить специализацию «${specialization.name}»? Она также исчезнет из профилей врачей, где была выбрана.`,
    )

    if (!confirmed) {
      return
    }

    setSpecializationSubmittingId(specialization.id)

    try {
      await apiClient.deleteSpecialization(specialization.id)
      setFeedback({
        type: 'success',
        text: `Специализация «${specialization.name}» удалена.`,
      })
      if (editingSpecializationId === specialization.id) {
        cancelEditSpecialization()
      }
      await loadSpecializations()
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'Не удалось удалить специализацию',
      })
    } finally {
      setSpecializationSubmittingId(null)
    }
  }

  const handleDeleteUser = async (user) => {
    if (user.id === auth.user?.id) {
      setFeedback({
        type: 'error',
        text: 'Нельзя удалить собственный аккаунт.',
      })
      return
    }

    const confirmed = window.confirm(
      `Удалить пользователя ${getDisplayName(user)}? Будут удалены связанные вопросы, ответы, документы и refresh-сессии.`,
    )

    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteAdminUser(user.id)
      setFeedback({
        type: 'success',
        text: `Пользователь ${getDisplayName(user)} удалён.`,
      })
      await Promise.all([loadDashboard(), loadUsers(), loadQuestions(), loadAnswers(), loadPendingDoctors()])
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'Не удалось удалить пользователя',
      })
    }
  }

  const handleDeleteQuestion = async (question) => {
    const confirmed = window.confirm('Удалить вопрос и все ответы к нему?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteAdminQuestion(question.id)
      setFeedback({
        type: 'success',
        text: `Вопрос #${question.id} удалён.`,
      })
      await Promise.all([loadDashboard(), loadQuestions(), loadAnswers()])
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'Не удалось удалить вопрос',
      })
    }
  }

  const handleDeleteAnswer = async (answer) => {
    const confirmed = window.confirm('Удалить этот ответ врача?')
    if (!confirmed) {
      return
    }

    try {
      await apiClient.deleteAdminAnswer(answer.id)
      setFeedback({
        type: 'success',
        text: `Ответ #${answer.id} удалён.`,
      })
      await Promise.all([loadDashboard(), loadQuestions(), loadAnswers()])
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof ApiError ? error.message : 'Не удалось удалить ответ',
      })
    }
  }

  return (
    <VirtualMedicPage activeNav="admin">
      <section className="vm-page-section">
        <div className="vm-shell">
          <div className="vm-breadcrumbs">
            <span>Главная</span>
            <span>Админ панель</span>
          </div>

          <div className="vm-page-hero">
            <div>
              <h1>Админ панель</h1>
              <p>
                Рабочее место для контроля пользователей, вопросов, ответов врачей,
                специализаций и заявок на подтверждение профиля.
              </p>
            </div>
            <button className="vm-button" type="button" onClick={refreshVisibleData}>
              Обновить данные
            </button>
          </div>

          {feedback.text ? (
            <section className={`vm-auth-message ${feedback.type === 'error' ? 'is-error' : 'is-success'}`}>
              {feedback.text}
            </section>
          ) : null}

          <section className="vm-card vm-detail-card">
            <div className="vm-admin-section-head">
              <div>
                <h2>Заглушка сайта</h2>
                <p>
                  При включении пользователи и врачи увидят сервисное уведомление. Администраторы
                  сохраняют доступ к панели и могут вернуть сайт в обычный режим.
                </p>
              </div>
            </div>

            <div className="vm-inline-meta">
              <span className="vm-file-chip">
                Статус: {maintenanceState?.enabled ? 'включена' : 'выключена'}
              </span>
              <span className="vm-muted">
                Администраторы сохраняют доступ после входа.
              </span>
            </div>

            <button
                className={`vm-button ${maintenanceState?.enabled ? 'vm-button--danger' : ''}`}
                type="button"
                onClick={handleMaintenanceToggle}
                disabled={!maintenanceState || isMaintenanceSubmitting}
              >
                {isMaintenanceSubmitting
                  ? 'Сохраняем...'
                  : maintenanceState?.enabled
                    ? 'Выключить заглушку'
                    : 'Включить заглушку'}
              </button>

            {maintenanceError ? <p className="vm-form-error">{maintenanceError}</p> : null}
          </section>

          <div className="vm-admin-tabs">
            {ADMIN_TABS.map((item) => (
              <button
                key={item.key}
                className={`vm-admin-tab ${activeTab === item.key ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setFeedback({ type: '', text: '' })
                  setActiveTab(item.key)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <>
              {isDashboardLoading ? (
                <EmptyState
                  title="Загружаем обзор платформы"
                  description="Собираем статистику, последние вопросы, ответы и заявки врачей."
                />
              ) : null}

              {!isDashboardLoading && dashboardError ? (
                <EmptyState title="Панель не загрузилась" description={dashboardError} />
              ) : null}

              {dashboard ? (
                <div className="vm-grid">
                  <section className="vm-card vm-admin-command-center">
                    <div className="vm-admin-command-center__lead">
                      <span className="vm-overline">Состояние платформы</span>
                      <strong>{dashboard.stats.total_users}</strong>
                      <p>
                        пользователей в системе, из них {dashboard.stats.total_doctors} врачей и{' '}
                        {dashboard.stats.total_patients} пациентов.
                      </p>
                    </div>

                    <div className="vm-admin-health-grid">
                      <div className="vm-admin-health-item">
                        <span>Верификация врачей</span>
                        <strong>
                          {dashboard.stats.total_verified_doctors}/{dashboard.stats.total_doctors}
                        </strong>
                        <div className="vm-admin-progress">
                          <span
                            style={{
                              width: `${
                                dashboard.stats.total_doctors
                                  ? Math.round(
                                    (dashboard.stats.total_verified_doctors / dashboard.stats.total_doctors) * 100,
                                  )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="vm-admin-health-item">
                        <span>Контент</span>
                        <strong>
                          {dashboard.stats.total_questions} / {dashboard.stats.total_answers}
                        </strong>
                        <p>вопросов и ответов врачей</p>
                      </div>

                      <div className="vm-admin-health-item">
                        <span>Очередь модерации</span>
                        <strong>{dashboard.stats.total_pending_doctors}</strong>
                        <p>заявок ожидают проверки</p>
                      </div>

                      <div className="vm-admin-health-item">
                        <span>Ограничения</span>
                        <strong>{dashboard.stats.total_inactive_users}</strong>
                        <p>аккаунтов заблокировано</p>
                      </div>
                    </div>
                  </section>

                  <div className="vm-admin-overview-grid">
                    <section className="vm-card vm-detail-card">
                      <div className="vm-admin-section-head">
                        <h2>Последние пользователи</h2>
                        <button className="vm-button vm-button--soft" type="button" onClick={() => setActiveTab('users')}>
                          Открыть раздел
                        </button>
                      </div>
                      <div className="vm-admin-list">
                        {dashboard.users.map((user) => (
                          <article className="vm-admin-row" key={user.id}>
                            <div className="vm-admin-row__main">
                              <strong>{getDisplayName(user)}</strong>
                              <div className="vm-inline-meta">
                                <span className="vm-muted">@{user.username}</span>
                                <span className="vm-file-chip">{getRoleLabel(user.role)}</span>
                                {!user.is_active ? <span className="vm-file-chip">заблокирован</span> : null}
                              </div>
                            </div>
                            <span className="vm-muted">{formatDateTime(user.created_at)}</span>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="vm-card vm-detail-card">
                      <div className="vm-admin-section-head">
                        <h2>Заявки врачей</h2>
                        <button className="vm-button vm-button--soft" type="button" onClick={() => setActiveTab('doctors')}>
                          Открыть раздел
                        </button>
                      </div>
                      <div className="vm-admin-list">
                        {dashboard.pending_doctors.length ? (
                          dashboard.pending_doctors.map((doctor) => (
                            <article className="vm-admin-row" key={doctor.id}>
                              <div className="vm-admin-row__main">
                                <strong>{getDisplayName(doctor)}</strong>
                                <div className="vm-inline-meta">
                                  {doctor.specializations.map((item) => (
                                    <span className="vm-file-chip" key={item.id}>{item.name}</span>
                                  ))}
                                </div>
                              </div>
                              <button className="vm-button vm-button--soft" type="button" onClick={() => openDoctorDetails(doctor.id)}>
                                Карточка
                              </button>
                            </article>
                          ))
                        ) : (
                          <p className="vm-muted">Новых заявок на проверку сейчас нет.</p>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="vm-admin-overview-grid">
                    <section className="vm-card vm-detail-card">
                      <div className="vm-admin-section-head">
                        <h2>Последние вопросы</h2>
                        <button className="vm-button vm-button--soft" type="button" onClick={() => setActiveTab('questions')}>
                          Открыть раздел
                        </button>
                      </div>
                      <div className="vm-admin-list">
                        {dashboard.questions.map((question) => (
                          <article className="vm-admin-row" key={question.id}>
                            <div className="vm-admin-row__main">
                              <strong>{summarizeQuestion(question.text, 92)}</strong>
                              <div className="vm-inline-meta">
                                <span className="vm-muted">{getDisplayName(question.author)}</span>
                                <span className="vm-muted">Ответов: {question.comments_count}</span>
                              </div>
                            </div>
                            <AppLink className="vm-link" href={buildQuestionHref(question.id)}>
                              Открыть
                            </AppLink>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="vm-card vm-detail-card">
                      <div className="vm-admin-section-head">
                        <h2>Последние ответы</h2>
                        <button className="vm-button vm-button--soft" type="button" onClick={() => setActiveTab('answers')}>
                          Открыть раздел
                        </button>
                      </div>
                      <div className="vm-admin-list">
                        {dashboard.recent_answers.map((answer) => (
                          <article className="vm-admin-row" key={answer.id}>
                            <div className="vm-admin-row__main">
                              <strong>{getDisplayName(answer.author)}</strong>
                              <p>{summarizeQuestion(answer.text, 110)}</p>
                            </div>
                            <AppLink className="vm-link" href={buildQuestionHref(answer.question_id)}>
                              К вопросу
                            </AppLink>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {activeTab === 'users' ? (
            <section className="vm-card vm-detail-card">
              <div className="vm-admin-section-head">
                <div>
                  <h2>Пользователи</h2>
                  <p>Поиск, фильтрация, блокировка и удаление аккаунтов.</p>
                </div>
              </div>

              <AdminToolbar>
                <input
                  className="vm-input"
                  type="search"
                  placeholder="Поиск по username или ФИО"
                  value={usersQuery.search}
                  onChange={(event) => setUsersQuery((current) => ({ ...current, search: event.target.value, offset: 0 }))}
                />
                <select
                  className="vm-select"
                  value={usersQuery.role}
                  onChange={(event) => setUsersQuery((current) => ({ ...current, role: event.target.value, offset: 0 }))}
                >
                  <option value="">Все роли</option>
                  <option value="patient">Пациенты</option>
                  <option value="doctor">Врачи</option>
                  <option value="admin">Админы</option>
                  <option value="superuser">Superuser</option>
                </select>
                <select
                  className="vm-select"
                  value={usersQuery.is_active}
                  onChange={(event) => setUsersQuery((current) => ({ ...current, is_active: event.target.value, offset: 0 }))}
                >
                  <option value="">Любой статус</option>
                  <option value="true">Только активные</option>
                  <option value="false">Только заблокированные</option>
                </select>
                <select
                  className="vm-select"
                  value={usersQuery.is_verified_doctor}
                  onChange={(event) =>
                    setUsersQuery((current) => ({ ...current, is_verified_doctor: event.target.value, offset: 0 }))
                  }
                >
                  <option value="">Любая верификация</option>
                  <option value="true">Только верифицированные врачи</option>
                  <option value="false">Не верифицированы</option>
                </select>
              </AdminToolbar>

              {usersState.isLoading ? <p className="vm-muted">Загружаем пользователей...</p> : null}
              {!usersState.isLoading && usersState.error ? <p className="vm-form-error">{usersState.error}</p> : null}
              {!usersState.isLoading && !usersState.error && !usersState.items.length ? (
                <p className="vm-muted">По заданным фильтрам пользователи не найдены.</p>
              ) : null}

              <div className="vm-admin-list">
                {usersState.items.map((user) => (
                  <article className="vm-admin-row" key={user.id}>
                    <div className="vm-admin-row__main">
                      <strong>{getDisplayName(user)}</strong>
                      <div className="vm-inline-meta">
                        <span className="vm-muted">@{user.username}</span>
                        <span className="vm-file-chip">{getRoleLabel(user.role)}</span>
                        {!user.is_active ? <span className="vm-file-chip">заблокирован</span> : null}
                        {user.is_verified_doctor ? <span className="vm-file-chip">врач подтверждён</span> : null}
                      </div>
                      <div className="vm-inline-meta">
                        <span className="vm-muted">Вопросов: {user.questions_count}</span>
                        <span className="vm-muted">Ответов: {user.comments_count}</span>
                        <span className="vm-muted">Документов: {user.qualification_documents_count}</span>
                        <span className="vm-muted">Создан: {formatDateTime(user.created_at)}</span>
                      </div>
                    </div>
                    <div className="vm-admin-row__actions">
                      <button
                        className="vm-button vm-button--soft"
                        type="button"
                        onClick={() => handleToggleUserStatus(user)}
                        disabled={user.id === auth.user?.id}
                      >
                        {user.is_active ? 'Заблокировать' : 'Разблокировать'}
                      </button>
                      <button
                        className="vm-button vm-button--danger"
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        disabled={user.id === auth.user?.id}
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <PaginationControls
                offset={usersQuery.offset}
                limit={usersQuery.limit}
                total={usersState.total}
                onPrev={() => setUsersQuery((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}
                onNext={() => setUsersQuery((current) => ({ ...current, offset: current.offset + current.limit }))}
              />
            </section>
          ) : null}

          {activeTab === 'specializations' ? (
            <section className="vm-card vm-detail-card">
              <div className="vm-admin-section-head">
                <div>
                  <h2>Специализации врачей</h2>
                  <p>Справочник направлений, который используется при регистрации врачей и в фильтрах каталога.</p>
                </div>
              </div>

              <form className="vm-admin-toolbar" onSubmit={handleCreateSpecialization}>
                <input
                  className="vm-input"
                  type="text"
                  id="specializationDraft"
                  placeholder="Например: Кардиолог"
                  value={specializationDraft}
                  onChange={(event) => {
                    setSpecializationDraft(event.target.value)
                    setSpecializationDraftError('')
                  }}
                  maxLength={120}
                />
                <button className="vm-button" type="submit" disabled={isSpecializationCreating}>
                  {isSpecializationCreating ? 'Добавляем...' : 'Добавить'}
                </button>
              </form>
              {specializationDraftError ? <p className="vm-form-error">{specializationDraftError}</p> : null}

              {specializationsState.isLoading ? <p className="vm-muted">Загружаем специализации...</p> : null}
              {!specializationsState.isLoading && specializationsState.error ? (
                <p className="vm-form-error">{specializationsState.error}</p>
              ) : null}
              {!specializationsState.isLoading && !specializationsState.error && !specializationsState.items.length ? (
                <p className="vm-muted">Специализации пока не добавлены.</p>
              ) : null}

              <div className="vm-admin-list">
                {specializationsState.items.map((specialization) => {
                  const isEditing = editingSpecializationId === specialization.id
                  const isSubmitting = specializationSubmittingId === specialization.id

                  return (
                    <article className="vm-admin-row" key={specialization.id}>
                      <div className="vm-admin-row__main">
                        {isEditing ? (
                          <input
                            className="vm-input"
                            type="text"
                            value={editingSpecializationName}
                            onChange={(event) => setEditingSpecializationName(event.target.value)}
                            maxLength={120}
                            autoFocus
                          />
                        ) : (
                          <strong>{specialization.name}</strong>
                        )}
                        <div className="vm-inline-meta">
                          <span className="vm-muted">ID: {specialization.id}</span>
                          <span className="vm-muted">Доступна для выбора врачами</span>
                        </div>
                      </div>
                      <div className="vm-admin-row__actions">
                        {isEditing ? (
                          <>
                            <button
                              className="vm-button"
                              type="button"
                              onClick={() => handleUpdateSpecialization(specialization)}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? 'Сохраняем...' : 'Сохранить'}
                            </button>
                            <button
                              className="vm-button vm-button--soft"
                              type="button"
                              onClick={cancelEditSpecialization}
                              disabled={isSubmitting}
                            >
                              Отмена
                            </button>
                          </>
                        ) : (
                          <button
                            className="vm-button vm-button--soft"
                            type="button"
                            onClick={() => startEditSpecialization(specialization)}
                            disabled={isSubmitting}
                          >
                            Переименовать
                          </button>
                        )}
                        <button
                          className="vm-button vm-button--danger"
                          type="button"
                          onClick={() => handleDeleteSpecialization(specialization)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? 'Удаляем...' : 'Удалить'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {activeTab === 'questions' ? (
            <section className="vm-card vm-detail-card">
              <div className="vm-admin-section-head">
                <div>
                  <h2>Вопросы</h2>
                  <p>Фильтрация по статусу ответа и удаление проблемных публикаций.</p>
                </div>
              </div>

              <AdminToolbar>
                <input
                  className="vm-input"
                  type="search"
                  placeholder="Поиск по тексту вопроса"
                  value={questionsQuery.search}
                  onChange={(event) =>
                    setQuestionsQuery((current) => ({ ...current, search: event.target.value, offset: 0 }))
                  }
                />
                <select
                  className="vm-select"
                  value={questionsQuery.answered}
                  onChange={(event) =>
                    setQuestionsQuery((current) => ({ ...current, answered: event.target.value, offset: 0 }))
                  }
                >
                  <option value="">Все вопросы</option>
                  <option value="true">Только с ответами</option>
                  <option value="false">Без ответов</option>
                </select>
              </AdminToolbar>

              {questionsState.isLoading ? <p className="vm-muted">Загружаем вопросы...</p> : null}
              {!questionsState.isLoading && questionsState.error ? <p className="vm-form-error">{questionsState.error}</p> : null}
              {!questionsState.isLoading && !questionsState.error && !questionsState.items.length ? (
                <p className="vm-muted">Под эти фильтры вопросы не найдены.</p>
              ) : null}

              <div className="vm-admin-list">
                {questionsState.items.map((question) => (
                  <article className="vm-admin-row" key={question.id}>
                    <div className="vm-admin-row__main">
                      <strong>{summarizeQuestion(question.text, 120)}</strong>
                      <div className="vm-inline-meta">
                        <span className="vm-muted">Автор: {getDisplayName(question.author)}</span>
                        <span className="vm-muted">Ответов: {question.comments_count}</span>
                        <span className="vm-muted">Создан: {formatDateTime(question.created_at)}</span>
                        {question.latest_answer_author ? (
                          <span className="vm-muted">
                            Последний ответ: {getDisplayName(question.latest_answer_author)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="vm-admin-row__actions">
                      <AppLink className="vm-button vm-button--soft" href={buildQuestionHref(question.id)}>
                        Открыть
                      </AppLink>
                      <button className="vm-button vm-button--danger" type="button" onClick={() => handleDeleteQuestion(question)}>
                        Удалить
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <PaginationControls
                offset={questionsQuery.offset}
                limit={questionsQuery.limit}
                total={questionsState.total}
                onPrev={() =>
                  setQuestionsQuery((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))
                }
                onNext={() => setQuestionsQuery((current) => ({ ...current, offset: current.offset + current.limit }))}
              />
            </section>
          ) : null}

          {activeTab === 'answers' ? (
            <section className="vm-card vm-detail-card">
              <div className="vm-admin-section-head">
                <div>
                  <h2>Ответы врачей</h2>
                  <p>Поиск по тексту ответа и быстрая модерация нежелательного контента.</p>
                </div>
              </div>

              <AdminToolbar>
                <input
                  className="vm-input"
                  type="search"
                  placeholder="Поиск по тексту ответа"
                  value={answersQuery.search}
                  onChange={(event) => setAnswersQuery((current) => ({ ...current, search: event.target.value, offset: 0 }))}
                />
              </AdminToolbar>

              {answersState.isLoading ? <p className="vm-muted">Загружаем ответы...</p> : null}
              {!answersState.isLoading && answersState.error ? <p className="vm-form-error">{answersState.error}</p> : null}
              {!answersState.isLoading && !answersState.error && !answersState.items.length ? (
                <p className="vm-muted">Ответы по заданным фильтрам не найдены.</p>
              ) : null}

              <div className="vm-admin-list">
                {answersState.items.map((answer) => (
                  <article className="vm-admin-row" key={answer.id}>
                    <div className="vm-admin-row__main">
                      <strong>{getDisplayName(answer.author)}</strong>
                      <p>{summarizeQuestion(answer.text, 160)}</p>
                      <div className="vm-inline-meta">
                        <span className="vm-muted">Вопрос #{answer.question_id}</span>
                        <span className="vm-muted">Создан: {formatDateTime(answer.created_at)}</span>
                      </div>
                    </div>
                    <div className="vm-admin-row__actions">
                      <AppLink className="vm-button vm-button--soft" href={buildQuestionHref(answer.question_id)}>
                        К вопросу
                      </AppLink>
                      <button className="vm-button vm-button--danger" type="button" onClick={() => handleDeleteAnswer(answer)}>
                        Удалить
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <PaginationControls
                offset={answersQuery.offset}
                limit={answersQuery.limit}
                total={answersState.total}
                onPrev={() => setAnswersQuery((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}
                onNext={() => setAnswersQuery((current) => ({ ...current, offset: current.offset + current.limit }))}
              />
            </section>
          ) : null}

          {activeTab === 'doctors' ? (
            <section className="vm-card vm-detail-card">
              <div className="vm-admin-section-head">
                <div>
                  <h2>Заявки на подтверждение врача</h2>
                  <p>Проверка документов, профиля и ручное управление верификацией.</p>
                </div>
              </div>

              <AdminToolbar>
                <input
                  className="vm-input"
                  type="search"
                  placeholder="Поиск по врачу или username"
                  value={pendingQuery.search}
                  onChange={(event) => setPendingQuery((current) => ({ ...current, search: event.target.value, offset: 0 }))}
                />
              </AdminToolbar>

              {pendingState.isLoading ? <p className="vm-muted">Загружаем заявки врачей...</p> : null}
              {!pendingState.isLoading && pendingState.error ? <p className="vm-form-error">{pendingState.error}</p> : null}
              {!pendingState.isLoading && !pendingState.error && !pendingState.items.length ? (
                <p className="vm-muted">Сейчас нет врачей, ожидающих проверку.</p>
              ) : null}

              <div className="vm-admin-list">
                {pendingState.items.map((doctor) => (
                  <article className="vm-admin-row" key={doctor.id}>
                    <div className="vm-admin-row__main">
                      <strong>{getDisplayName(doctor)}</strong>
                      <div className="vm-inline-meta">
                        <span className="vm-muted">@{doctor.username}</span>
                        {doctor.specializations.map((item) => (
                          <span className="vm-file-chip" key={item.id}>{item.name}</span>
                        ))}
                        <span className="vm-muted">Документов: {doctor.qualification_documents.length}</span>
                      </div>
                    </div>
                    <div className="vm-admin-row__actions">
                      <button className="vm-button vm-button--soft" type="button" onClick={() => openDoctorDetails(doctor.id)}>
                        Открыть карточку
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <PaginationControls
                offset={pendingQuery.offset}
                limit={pendingQuery.limit}
                total={pendingState.total}
                onPrev={() => setPendingQuery((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}
                onNext={() => setPendingQuery((current) => ({ ...current, offset: current.offset + current.limit }))}
              />
            </section>
          ) : null}
        </div>
      </section>

      {(selectedDoctor || isDoctorDetailsLoading || doctorActionError) ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedDoctor(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <span className="public-kicker">Doctor moderation</span>
                <h2 className="public-panel__title">Карточка врача</h2>
              </div>
              <button className="vm-button vm-button--soft" type="button" onClick={() => setSelectedDoctor(null)}>
                Закрыть
              </button>
            </div>

            {isDoctorDetailsLoading ? <div className="state-card"><p>Загружаем данные врача...</p></div> : null}
            {doctorActionMessage ? <div className="public-inline-message public-inline-message--success">{doctorActionMessage}</div> : null}
            {doctorActionError ? <div className="public-inline-message public-inline-message--error">{doctorActionError}</div> : null}

            {selectedDoctor ? (
              <div className="profile-list">
                <div className="profile-list__item">
                  <span className="profile-list__label">Врач</span>
                  <div className="profile-list__value">
                    {getDisplayName(selectedDoctor)} (@{selectedDoctor.username})
                  </div>
                </div>
                <div className="profile-list__item">
                  <span className="profile-list__label">Статус</span>
                  <div className="profile-list__value">
                    {selectedDoctor.is_verified_doctor ? 'Верифицирован' : 'Ожидает модерации'}
                  </div>
                </div>
                <div className="profile-list__item">
                  <span className="profile-list__label">Специализации</span>
                  <div className="tag-list">
                    {selectedDoctor.specializations.map((item) => (
                      <span className="tag" key={item.id}>{item.name}</span>
                    ))}
                  </div>
                </div>
                <div className="profile-list__item">
                  <span className="profile-list__label">Документы</span>
                  <div className="profile-list__value">
                    {selectedDoctor.qualification_documents.map((document) => (
                      <div key={document.id} className="document-row">
                        <div>
                          <strong>{document.original_file_name}</strong>
                          <div>{formatFileSize(document.size_bytes)} · {formatDateTime(document.created_at)}</div>
                        </div>
                        <button
                          className="vm-button vm-button--soft"
                          type="button"
                          onClick={() => handleDownloadDocument(document.id)}
                          disabled={downloadingDocumentId === document.id}
                        >
                          {downloadingDocumentId === document.id ? 'Скачиваем...' : 'Скачать'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="modal-card__actions">
              <button
                className="vm-button"
                type="button"
                onClick={handleVerifyToggle}
                disabled={!selectedDoctor || isVerifySubmitting}
              >
                {selectedDoctor?.is_verified_doctor ? 'Снять верификацию' : 'Подтвердить врача'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </VirtualMedicPage>
  )
}

export default AdminDoctorModerationPage
