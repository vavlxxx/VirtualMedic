import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import {
  normalizeOptionalTextValue,
  resolveFormApiError,
  useSubmitLock,
} from './formSupport'
import { useRouter } from './router'
import { formatDateTime, formatFileSize } from './publicPageUtils'
import { VirtualMedicPage } from './VirtualMedicLayout'
import { ProfileImage } from './ProfileImage'

const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/
const MAX_DOCTOR_DOCUMENTS_PER_REQUEST = 10
const MAX_DOCTOR_DOCUMENT_SIZE_BYTES = 8 * 1024 * 1024
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
const allowedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const allowedDoctorDocumentTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
])
const allowedDoctorDocumentExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp'])

function formatRole(role) {
  const labels = {
    patient: 'Пациент',
    doctor: 'Врач',
    admin: 'Администратор',
    superuser: 'Суперпользователь',
  }

  return labels[role] || role
}

function formatName(user) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  return fullName || user?.username || 'Пользователь'
}

function validateProfileForm(values) {
  const errors = {}
  const firstName = normalizeOptionalTextValue(values.first_name)
  const lastName = normalizeOptionalTextValue(values.last_name)

  if (!firstName && !lastName) {
    errors.first_name = 'Укажите хотя бы имя или фамилию'
  }

  if (firstName.length > 120) {
    errors.first_name = 'Имя не должно превышать 120 символов'
  }

  if (lastName.length > 120) {
    errors.last_name = 'Фамилия не должна превышать 120 символов'
  }

  return errors
}

function validatePasswordForm(values) {
  const errors = {}

  if (!values.current_password) {
    errors.current_password = 'Введите текущий пароль'
  }

  if (!values.new_password) {
    errors.new_password = 'Введите новый пароль'
  } else if (!strongPasswordPattern.test(values.new_password)) {
    errors.new_password =
      'Минимум 10 символов, включая заглавную, строчную, цифру и специальный символ'
  } else if (values.new_password === values.current_password) {
    errors.new_password = 'Новый пароль должен отличаться от текущего'
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Подтвердите новый пароль'
  } else if (values.confirmPassword !== values.new_password) {
    errors.confirmPassword = 'Пароли не совпадают'
  }

  return errors
}

function validateDoctorFiles(files) {
  if (!files.length) {
    return 'Выберите хотя бы один файл'
  }

  if (files.length > MAX_DOCTOR_DOCUMENTS_PER_REQUEST) {
    return `Можно загрузить не больше ${MAX_DOCTOR_DOCUMENTS_PER_REQUEST} файлов за раз`
  }

  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''

    if (!allowedDoctorDocumentExtensions.has(extension)) {
      return `Файл ${file.name} имеет недопустимое расширение`
    }

    if (file.type && !allowedDoctorDocumentTypes.has(file.type)) {
      return `Файл ${file.name} имеет недопустимый тип`
    }

    if (file.size > MAX_DOCTOR_DOCUMENT_SIZE_BYTES) {
      return `Файл ${file.name} превышает лимит 8 МБ`
    }
  }

  return ''
}

function AccountPage() {
  const auth = useAuth()
  const { location } = useRouter()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const loadCurrentProfile = auth.loadProfile
  const currentUserId = auth.user?.id || null
  const currentUserRole = auth.user?.role || null
  const isAuthenticated = auth.isAuthenticated
  const isDoctor = currentUserRole === 'doctor'
  const didLoadProfileRef = useRef(null)
  const documentInputRef = useRef(null)
  const avatarInputRef = useRef(null)
  const runProfileSubmit = useSubmitLock()
  const runDocumentsSubmit = useSubmitLock()
  const accessMessage = searchParams.get('access')
    ? 'У вас нет доступа к запрошенному маршруту с текущей ролью.'
    : ''

  const [isProfileLoading, setIsProfileLoading] = useState(() => !auth.user)
  const [profileLoadError, setProfileLoadError] = useState('')

  const [profileValues, setProfileValues] = useState({ first_name: '', last_name: '' })
  const [profileErrors, setProfileErrors] = useState({})
  const [profileMessage, setProfileMessage] = useState('')
  const [profileFormError, setProfileFormError] = useState('')
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false)
  const [avatarMessage, setAvatarMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [isAvatarSubmitting, setIsAvatarSubmitting] = useState(false)

  const [passwordValues, setPasswordValues] = useState({
    current_password: '',
    new_password: '',
    confirmPassword: '',
  })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordFormError, setPasswordFormError] = useState('')
  const [doctorDocuments, setDoctorDocuments] = useState([])
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [documentsMessage, setDocumentsMessage] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [selectedFilesError, setSelectedFilesError] = useState('')
  const [isDocumentsSubmitting, setIsDocumentsSubmitting] = useState(false)

  useEffect(() => {
    setProfileValues({
      first_name: auth.user?.first_name || '',
      last_name: auth.user?.last_name || '',
    })
  }, [auth.user?.first_name, auth.user?.last_name])

  useEffect(() => {
    if (!isAuthenticated || !currentUserId) {
      setIsProfileLoading(false)
      return
    }

    if (didLoadProfileRef.current === currentUserId) {
      return
    }

    didLoadProfileRef.current = currentUserId

    let isCancelled = false

    const loadProfileData = async () => {
      setProfileLoadError('')

      try {
        await loadCurrentProfile()
      } catch (error) {
        if (!isCancelled) {
          setProfileLoadError(error instanceof ApiError ? error.message : 'Не удалось загрузить профиль')
        }
      } finally {
        if (!isCancelled) {
          setIsProfileLoading(false)
        }
      }
    }

    loadProfileData()

    return () => {
      isCancelled = true
    }
  }, [currentUserId, isAuthenticated, loadCurrentProfile])

  useEffect(() => {
    let isCancelled = false

    if (!isAuthenticated || !isDoctor) {
      setDoctorDocuments([])
      setDocumentsError('')
      setIsDocumentsLoading(false)
      return undefined
    }

    const loadDocuments = async () => {
      setIsDocumentsLoading(true)
      setDocumentsError('')

      try {
        const response = await apiClient.getMyDocuments()

        if (!isCancelled) {
          setDoctorDocuments(response)
        }
      } catch (error) {
        if (!isCancelled) {
          setDocumentsError(error instanceof ApiError ? error.message : 'Не удалось загрузить документы врача')
        }
      } finally {
        if (!isCancelled) {
          setIsDocumentsLoading(false)
        }
      }
    }

    loadDocuments()

    return () => {
      isCancelled = true
    }
  }, [currentUserId, isAuthenticated, isDoctor])

  const handleProfileChange = (field) => (event) => {
    const nextValue = event.target.value

    setProfileValues((current) => ({
      ...current,
      [field]: nextValue,
    }))
    setProfileErrors((current) => ({
      ...current,
      [field]: '',
    }))
    setProfileMessage('')
    setProfileFormError('')
  }

  const handleAccountSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = validateProfileForm(profileValues)
    const shouldChangePassword = Boolean(
      passwordValues.current_password || passwordValues.new_password || passwordValues.confirmPassword,
    )
    const nextPasswordErrors = shouldChangePassword ? validatePasswordForm(passwordValues) : {}

    if (Object.keys(nextErrors).length > 0 || Object.keys(nextPasswordErrors).length > 0) {
      setProfileErrors(nextErrors)
      setPasswordErrors(nextPasswordErrors)
      return
    }

    await runProfileSubmit(async () => {
      setIsProfileSubmitting(true)
      setProfileFormError('')
      setProfileMessage('')
      setPasswordFormError('')
      setPasswordMessage('')

      try {
        await auth.updateProfile({
          first_name: normalizeOptionalTextValue(profileValues.first_name) || null,
          last_name: normalizeOptionalTextValue(profileValues.last_name) || null,
        })

        if (shouldChangePassword) {
          const response = await auth.changePassword({
            current_password: passwordValues.current_password,
            new_password: passwordValues.new_password,
          })
          setPasswordValues({
            current_password: '',
            new_password: '',
            confirmPassword: '',
          })
          setPasswordMessage(response.detail || 'Пароль обновлён')
        }

        setProfileMessage(shouldChangePassword ? 'Профиль и пароль обновлены.' : 'Профиль обновлён.')
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось сохранить изменения. Попробуйте ещё раз.',
        })

        setProfileErrors(resolvedError.fieldErrors)
        setProfileFormError(resolvedError.formError)
      } finally {
        setIsProfileSubmitting(false)
      }
    })
  }

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]

    setAvatarMessage('')
    setAvatarError('')

    if (!file) {
      return
    }

    if (!allowedAvatarTypes.has(file.type)) {
      setAvatarError('Выберите изображение JPG, PNG или WEBP.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError('Фото должно быть не больше 2 МБ.')
      event.target.value = ''
      return
    }

    setIsAvatarSubmitting(true)

    try {
      await auth.uploadAvatar(file)
      setAvatarMessage('Фото профиля обновлено.')
    } catch (error) {
      setAvatarError(error instanceof ApiError ? error.message : 'Не удалось загрузить фото.')
    } finally {
      setIsAvatarSubmitting(false)
      event.target.value = ''
    }
  }

  const handlePasswordChange = (field) => (event) => {
    const nextValue = event.target.value

    setPasswordValues((current) => ({
      ...current,
      [field]: nextValue,
    }))
    setPasswordErrors((current) => ({
      ...current,
      [field]: '',
    }))
    setPasswordMessage('')
    setPasswordFormError('')
  }

  const handleFilesChange = (event) => {
    const files = Array.from(event.target.files || [])
    const validationError = validateDoctorFiles(files)

    setDocumentsMessage('')

    if (validationError) {
      setSelectedFiles([])
      setSelectedFilesError(validationError)
      return
    }

    setSelectedFiles(files)
    setSelectedFilesError('')
  }

  const handleDocumentsSubmit = async (event) => {
    event.preventDefault()

    if (!auth.hasRole('doctor')) {
      setDocumentsError('Загружать qualification documents может только пользователь с ролью doctor.')
      return
    }

    const validationError = validateDoctorFiles(selectedFiles)
    if (validationError) {
      setSelectedFilesError(validationError)
      return
    }

    await runDocumentsSubmit(async () => {
      setIsDocumentsSubmitting(true)
      setDocumentsError('')
      setDocumentsMessage('')

      try {
        const response = await apiClient.uploadDoctorDocuments(selectedFiles)
        setDoctorDocuments(response)
        setSelectedFiles([])
        setSelectedFilesError('')
        if (documentInputRef.current) {
          documentInputRef.current.value = ''
        }
        await auth.loadProfile()
        setDocumentsMessage('Документы загружены и список обновлён.')
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось загрузить документы. Попробуйте ещё раз.',
        })

        setDocumentsError(resolvedError.formError)
      } finally {
        setIsDocumentsSubmitting(false)
      }
    })
  }

  if (isProfileLoading && !auth.user) {
    return (
      <VirtualMedicPage activeNav="account">
        <section className="vm-shell account-card">
          <div className="route-state-card">
            <div className="route-state-spinner" aria-hidden="true" />
            <p>Загружаем профиль...</p>
          </div>
        </section>
      </VirtualMedicPage>
    )
  }

  return (
    <VirtualMedicPage activeNav="account">
      <section className="vm-shell account-card account-page-card">
        <div className="auth-card__header">
          <span className="auth-kicker">Мой профиль</span>
          <h1 className="auth-card__title">Личный кабинет</h1>
          <p className="auth-card__subtitle">
            Здесь можно обновить личные данные, сменить пароль и перейти к разделам,
            доступным для вашей роли.
          </p>
        </div>

        {accessMessage ? <div className="auth-message auth-message--error">{accessMessage}</div> : null}
        {profileLoadError ? <div className="auth-message auth-message--error">{profileLoadError}</div> : null}

        <div className="account-modern-profile">
          <section className="vm-card vm-modern-profile-hero account-modern-profile__hero">
            <div className="vm-modern-profile-photo">
              <ProfileImage alt={formatName(auth.user)} src={auth.user.avatar_url} />
            </div>

            <div className="vm-modern-profile-main">
              <div className="vm-inline-meta">
                <span className="account-role-chip">{formatRole(auth.user.role)}</span>
                <span className={auth.user.is_active ? 'vm-online-chip' : 'vm-online-chip is-muted'}>
                  <span className="vm-online-dot" aria-hidden="true" />
                  {auth.user.is_active ? 'Аккаунт активен' : 'Аккаунт заблокирован'}
                </span>
              </div>
              <h2 className="vm-profile-hero__title">{formatName(auth.user)}</h2>
              <p className="vm-muted">@{auth.user.username}</p>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="account-avatar-input"
                onChange={handleAvatarChange}
                disabled={isAvatarSubmitting}
              />
              <div className="vm-modern-profile-actions">
                <button
                  className="vm-button vm-button--soft"
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isAvatarSubmitting}
                >
                  {isAvatarSubmitting ? 'Загружаем фото...' : 'Загрузить фото'}
                </button>
              </div>
              {avatarMessage ? <div className="auth-message auth-message--success">{avatarMessage}</div> : null}
              {avatarError ? <div className="auth-message auth-message--error">{avatarError}</div> : null}
            </div>

            <dl className="account-detail-list account-modern-profile__facts">
              <div>
                <dt>Профиль</dt>
                <dd>{formatRole(auth.user.role)}</dd>
              </div>
              <div>
                <dt>Подтверждение врача</dt>
                <dd>{auth.user.is_verified_doctor ? 'Врач подтверждён' : 'Без подтверждения врача'}</dd>
              </div>
              <div>
                <dt>Специализации</dt>
                <dd>
                  {auth.user.specializations?.length
                    ? auth.user.specializations.map((item) => item.name).join(', ')
                    : 'Пока не назначены'}
                </dd>
              </div>
              <div>
                <dt>Документы врача</dt>
                <dd>{auth.user.qualification_documents_count}</dd>
              </div>
            </dl>
          </section>
        </div>

        <form className="account-section account-unified-form" onSubmit={handleAccountSubmit} noValidate>
          <div className="account-section__header">
            <div>
              <h2 className="account-section__title">Настройки профиля</h2>
              <p className="account-section__text">
                Обновите личные данные и при необходимости смените пароль. Для сохранения всех изменений
                используется одна кнопка.
              </p>
            </div>
          </div>

          {profileMessage ? <div className="auth-message auth-message--success">{profileMessage}</div> : null}
          {profileFormError ? <div className="auth-message auth-message--error">{profileFormError}</div> : null}
          {passwordMessage ? <div className="auth-message auth-message--success">{passwordMessage}</div> : null}
          {passwordFormError ? <div className="auth-message auth-message--error">{passwordFormError}</div> : null}

          <div className="account-edit-list">
            <section className="account-settings-group">
              <div>
                <h2 className="account-section__title">Профиль</h2>
                <p className="account-section__text">
                  Укажите имя и фамилию, которые будут видны в личном кабинете.
                </p>
              </div>

              <div className="account-list-fields">
                <label className="auth-field account-list-field">
                  <span className="auth-field__label">Имя</span>
                  <input
                    className={`auth-field__input ${profileErrors.first_name ? 'auth-field__input--error' : ''}`}
                    type="text"
                    value={profileValues.first_name}
                    onChange={handleProfileChange('first_name')}
                    disabled={isProfileSubmitting}
                  />
                  {profileErrors.first_name ? (
                    <span className="auth-field__error">{profileErrors.first_name}</span>
                  ) : null}
                </label>

                <label className="auth-field account-list-field">
                  <span className="auth-field__label">Фамилия</span>
                  <input
                    className={`auth-field__input ${profileErrors.last_name ? 'auth-field__input--error' : ''}`}
                    type="text"
                    value={profileValues.last_name}
                    onChange={handleProfileChange('last_name')}
                    disabled={isProfileSubmitting}
                  />
                  {profileErrors.last_name ? (
                    <span className="auth-field__error">{profileErrors.last_name}</span>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="account-settings-group">
              <div>
                <h2 className="account-section__title">Смена пароля</h2>
                <p className="account-section__text">
                  Оставьте поля пустыми, если пароль менять не нужно.
                </p>
              </div>

              <div className="account-list-fields">
                <label className="auth-field account-list-field">
                  <span className="auth-field__label">Текущий пароль</span>
                  <input
                    className={`auth-field__input ${
                      passwordErrors.current_password ? 'auth-field__input--error' : ''
                    }`}
                    type="password"
                    value={passwordValues.current_password}
                    onChange={handlePasswordChange('current_password')}
                    disabled={isProfileSubmitting}
                    autoComplete="current-password"
                  />
                  {passwordErrors.current_password ? (
                    <span className="auth-field__error">{passwordErrors.current_password}</span>
                  ) : null}
                </label>

                <label className="auth-field account-list-field">
                  <span className="auth-field__label">Новый пароль</span>
                  <input
                    className={`auth-field__input ${passwordErrors.new_password ? 'auth-field__input--error' : ''}`}
                    type="password"
                    value={passwordValues.new_password}
                    onChange={handlePasswordChange('new_password')}
                    disabled={isProfileSubmitting}
                    autoComplete="new-password"
                  />
                  {passwordErrors.new_password ? (
                    <span className="auth-field__error">{passwordErrors.new_password}</span>
                  ) : null}
                </label>

                <label className="auth-field account-list-field">
                  <span className="auth-field__label">Подтверждение</span>
                  <input
                    className={`auth-field__input ${
                      passwordErrors.confirmPassword ? 'auth-field__input--error' : ''
                    }`}
                    type="password"
                    value={passwordValues.confirmPassword}
                    onChange={handlePasswordChange('confirmPassword')}
                    disabled={isProfileSubmitting}
                    autoComplete="new-password"
                  />
                  {passwordErrors.confirmPassword ? (
                    <span className="auth-field__error">{passwordErrors.confirmPassword}</span>
                  ) : null}
                </label>
              </div>
            </section>
          </div>

          <div className="auth-actions account-save-row">
            <button className="auth-submit-button" type="submit" disabled={isProfileSubmitting}>
              {isProfileSubmitting ? 'Сохраняем изменения...' : 'Сохранить изменения'}
            </button>
          </div>
        </form>

        {auth.hasRole('doctor') ? (
          <article className="account-section">
            <div className="account-section__header">
              <div>
                <h2 className="account-section__title">Документы врача</h2>
                <p className="account-section__text">
                  Загрузите документы, которые подтверждают образование и право на практику.
                  После проверки профиль врача получит подтверждённый статус.
                </p>
              </div>

              <span
                className={`status-badge ${
                  auth.isVerifiedDoctor ? 'status-badge--verified' : 'status-badge--warning'
                }`}
              >
                <span className="material-symbols-outlined">
                  {auth.isVerifiedDoctor ? 'verified' : 'pending_actions'}
                </span>
                {auth.isVerifiedDoctor ? 'Верифицирован' : 'Ожидает модерации'}
              </span>
            </div>

            {documentsMessage ? <div className="auth-message auth-message--success">{documentsMessage}</div> : null}
            {documentsError ? <div className="auth-message auth-message--error">{documentsError}</div> : null}

            <div className="document-section-grid">
              <div className="document-section-panel">
                <h3 className="account-section__subtitle">Загруженные файлы</h3>
                <p className="account-section__text">
                  Допустимы `pdf`, `png`, `jpg`, `jpeg`, `webp`, максимум 8 МБ на файл и не более
                  10 файлов за запрос.
                </p>

                {isDocumentsLoading ? (
                  <div className="route-state-card">
                    <div className="route-state-spinner" aria-hidden="true" />
                    <p>Загружаем список документов...</p>
                  </div>
                ) : null}

                {!isDocumentsLoading && doctorDocuments.length === 0 ? (
                  <div className="auth-panel">
                    <h3 className="auth-panel__title">Документы пока не загружены</h3>
                    <p className="auth-panel__text">
                      Добавьте дипломы, сертификаты или другие подтверждающие файлы для проверки.
                    </p>
                  </div>
                ) : null}

                {!isDocumentsLoading && doctorDocuments.length > 0 ? (
                  <div className="document-list">
                    {doctorDocuments.map((document) => (
                      <article className="document-item" key={document.id}>
                        <div className="document-item__meta">
                          <strong>{document.original_file_name}</strong>
                          <span>
                            {formatFileSize(document.size_bytes)} · {document.content_type} ·{' '}
                            {formatDateTime(document.created_at)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>

              <form className="document-section-panel" onSubmit={handleDocumentsSubmit} noValidate>
                <h3 className="account-section__subtitle">Загрузить ещё документы</h3>

                <label className="auth-field">
                  <span className="auth-field__label">Файлы</span>
                  <input
                    ref={documentInputRef}
                    className="auth-field__input auth-field__input--file"
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    onChange={handleFilesChange}
                    disabled={isDocumentsSubmitting}
                  />
                  <span className="auth-field__hint">
                    Можно выбрать несколько файлов. Проверки типа, размера и количества происходят
                    до отправки.
                  </span>
                  {selectedFilesError ? <span className="auth-field__error">{selectedFilesError}</span> : null}
                </label>

                {selectedFiles.length ? (
                  <div className="selected-files-list">
                    {selectedFiles.map((file) => (
                      <div className="selected-files-list__item" key={`${file.name}-${file.size}`}>
                        <span>{file.name}</span>
                        <span>{formatFileSize(file.size)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="auth-actions">
                  <button className="auth-submit-button" type="submit" disabled={isDocumentsSubmitting}>
                    {isDocumentsSubmitting ? 'Загружаем документы...' : 'Загрузить документы'}
                  </button>
                </div>
              </form>
            </div>
          </article>
        ) : null}

      </section>
    </VirtualMedicPage>
  )
}

export default AccountPage
