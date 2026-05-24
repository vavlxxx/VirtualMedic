import { useEffect, useMemo, useState } from 'react'
import { apiClient, ApiError } from './api/client'
import { useAuth } from './auth/AuthContext'
import {
  normalizeOptionalTextValue,
  normalizeUsernameValue,
  resolveFormApiError,
  useSubmitLock,
} from './formSupport'
import { AppLink, useRouter } from './router'
import { resolveSafeAppPath, routes, withReturnTo } from './routes'
import { VirtualMedicAuthFrame } from './VirtualMedicLayout'

const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/
const allowedDoctorDocumentExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp'])

function validateRegistrationForm(values, role) {
  const errors = {}

  if (!values.first_name.trim()) {
    errors.first_name = 'Введите имя'
  }
  if (!values.last_name.trim()) {
    errors.last_name = 'Введите фамилию'
  }
  if (!values.username.trim()) {
    errors.username = 'Введите имя пользователя'
  }
  if (!values.password) {
    errors.password = 'Введите пароль'
  } else if (!strongPasswordPattern.test(values.password)) {
    errors.password = 'Пароль должен быть не короче 10 символов и содержать разные типы символов'
  }
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Пароли не совпадают'
  }

  if (role === 'doctor') {
    if (!values.specialization_ids.length) {
      errors.specialization_ids = 'Выберите хотя бы одну специализацию'
    }
    if (!values.documents.length) {
      errors.documents = 'Добавьте документы для подтверждения квалификации'
    } else if (
      values.documents.some((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase() || ''
        return !allowedDoctorDocumentExtensions.has(extension)
      })
    ) {
      errors.documents = 'Допустимы только PDF, PNG, JPG, JPEG и WEBP'
    }
  }

  return errors
}

function RegistrationDesktopPage() {
  const auth = useAuth()
  const { location, navigate } = useRouter()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const [role, setRole] = useState('patient')
  const [values, setValues] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    confirmPassword: '',
    specialization_ids: [],
    documents: [],
  })
  const [specializations, setSpecializations] = useState([])
  const [specializationsError, setSpecializationsError] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const runWithSubmitLock = useSubmitLock()

  useEffect(() => {
    let isCancelled = false

    if (role !== 'doctor') {
      return undefined
    }

    const loadSpecializations = async () => {
      try {
        const response = await apiClient.listSpecializations()
        if (!isCancelled) {
          setSpecializations(response)
          setSpecializationsError('')
        }
      } catch (error) {
        if (!isCancelled) {
          setSpecializationsError(error instanceof ApiError ? error.message : 'Не удалось загрузить специализации')
        }
      }
    }

    loadSpecializations()

    return () => {
      isCancelled = true
    }
  }, [role])

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = validateRegistrationForm(values, role)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    await runWithSubmitLock(async () => {
      setIsSubmitting(true)
      setFormError('')

      try {
        if (role === 'patient') {
          await auth.registerPatient({
            first_name: normalizeOptionalTextValue(values.first_name),
            last_name: normalizeOptionalTextValue(values.last_name),
            username: normalizeUsernameValue(values.username),
            password: values.password,
          })
        } else {
          await apiClient.registerDoctor({
            first_name: normalizeOptionalTextValue(values.first_name),
            last_name: normalizeOptionalTextValue(values.last_name),
            username: normalizeUsernameValue(values.username),
            password: values.password,
            specialization_ids: values.specialization_ids,
            documents: values.documents,
          })
        }

        const params = new URLSearchParams()
        params.set('registered', '1')
        params.set('role', role)

        const returnTo = resolveSafeAppPath(searchParams.get('returnTo'), '')
        if (returnTo) {
          params.set('returnTo', returnTo)
        }

        navigate(`${routes.login}?${params.toString()}`, { replace: true })
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: role === 'doctor' ? 'Не удалось отправить заявку врача.' : 'Не удалось завершить регистрацию.',
          statusMessages: {
            409: 'Пользователь с таким username уже существует',
          },
        })

        setErrors((current) => ({ ...current, ...resolvedError.fieldErrors }))
        setFormError(resolvedError.formError)
      } finally {
        setIsSubmitting(false)
      }
    })
  }

  return (
    <VirtualMedicAuthFrame
      title="Регистрация"
      subtitle="Выберите роль и создайте аккаунт. Для врача регистрация сразу включает заявку на подтверждение документов."
      showCardBrand={false}
      cardScrollable
    >
      <div className="vm-auth-form">
        {formError ? <div className="vm-auth-message is-error">{formError}</div> : null}
        {specializationsError ? <div className="vm-auth-message is-error">{specializationsError}</div> : null}

        <div className="vm-segmented" role="tablist" aria-label="Выбор роли при регистрации">
          <button
            className={`vm-segmented__item ${role === 'patient' ? 'is-active' : ''}`}
            type="button"
            onClick={() => setRole('patient')}
          >
            <strong>Пациент</strong>
            <span>Быстрая регистрация для вопросов, консультаций и личного кабинета.</span>
          </button>
          <button
            className={`vm-segmented__item ${role === 'doctor' ? 'is-active' : ''}`}
            type="button"
            onClick={() => setRole('doctor')}
          >
            <strong>Врач</strong>
            <span>Создание профиля врача с выбором специализации и загрузкой документов.</span>
          </button>
        </div>

        <form className="vm-auth-form" onSubmit={handleSubmit} noValidate>
          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Имя</span>
            <input
              className="vm-input"
              type="text"
              value={values.first_name}
              onChange={(event) => {
                setValues((current) => ({ ...current, first_name: event.target.value }))
                setErrors((current) => ({ ...current, first_name: '' }))
              }}
            />
            {errors.first_name ? <span className="vm-form-error">{errors.first_name}</span> : null}
          </label>

          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Фамилия</span>
            <input
              className="vm-input"
              type="text"
              value={values.last_name}
              onChange={(event) => {
                setValues((current) => ({ ...current, last_name: event.target.value }))
                setErrors((current) => ({ ...current, last_name: '' }))
              }}
            />
            {errors.last_name ? <span className="vm-form-error">{errors.last_name}</span> : null}
          </label>

          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Имя пользователя</span>
            <input
              className="vm-input"
              type="text"
              value={values.username}
              onChange={(event) => {
                setValues((current) => ({ ...current, username: event.target.value }))
                setErrors((current) => ({ ...current, username: '' }))
              }}
            />
            {errors.username ? <span className="vm-form-error">{errors.username}</span> : null}
          </label>

          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Пароль</span>
            <div className="vm-auth-field__control">
              <input
                className="vm-input"
                type={isPasswordVisible ? 'text' : 'password'}
                value={values.password}
                onChange={(event) => {
                  setValues((current) => ({ ...current, password: event.target.value }))
                  setErrors((current) => ({ ...current, password: '' }))
                }}
              />
              <button
                className="vm-auth-field__icon"
                type="button"
                onClick={() => setIsPasswordVisible((current) => !current)}
                aria-label={isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <span className="material-symbols-outlined">
                  {isPasswordVisible ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {errors.password ? <span className="vm-form-error">{errors.password}</span> : null}
          </label>

          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Подтверждение пароля</span>
            <div className="vm-auth-field__control">
              <input
                className="vm-input"
                type={isConfirmPasswordVisible ? 'text' : 'password'}
                value={values.confirmPassword}
                onChange={(event) => {
                  setValues((current) => ({ ...current, confirmPassword: event.target.value }))
                  setErrors((current) => ({ ...current, confirmPassword: '' }))
                }}
              />
              <button
                className="vm-auth-field__icon"
                type="button"
                onClick={() => setIsConfirmPasswordVisible((current) => !current)}
                aria-label={isConfirmPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <span className="material-symbols-outlined">
                  {isConfirmPasswordVisible ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {errors.confirmPassword ? <span className="vm-form-error">{errors.confirmPassword}</span> : null}
          </label>

          {role === 'doctor' ? (
            <>
              <label className="vm-auth-field">
                <span className="vm-auth-field__label">Специализации</span>
                <select
                  className="vm-select"
                  multiple
                  value={values.specialization_ids.map(String)}
                  onChange={(event) => {
                    const nextValue = Array.from(event.target.selectedOptions, (option) => Number(option.value))
                    setValues((current) => ({ ...current, specialization_ids: nextValue }))
                    setErrors((current) => ({ ...current, specialization_ids: '' }))
                  }}
                  style={{ minHeight: '124px', padding: '12px 14px' }}
                >
                  {specializations.map((specialization) => (
                    <option key={specialization.id} value={specialization.id}>
                      {specialization.name}
                    </option>
                  ))}
                </select>
                {errors.specialization_ids ? <span className="vm-form-error">{errors.specialization_ids}</span> : null}
              </label>

              <label className="vm-auth-field">
                <span className="vm-auth-field__label">Документы врача</span>
                <input
                  className="vm-input"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(event) => {
                    const nextDocuments = Array.from(event.target.files || [])
                    setValues((current) => ({ ...current, documents: nextDocuments }))
                    setErrors((current) => ({ ...current, documents: '' }))
                  }}
                  style={{ padding: '12px 14px', height: 'auto' }}
                />
                {values.documents.length ? (
                  <div className="vm-file-list">
                    {values.documents.map((file) => (
                      <span className="vm-file-chip" key={`${file.name}-${file.size}`}>
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                {errors.documents ? <span className="vm-form-error">{errors.documents}</span> : null}
              </label>
            </>
          ) : null}

          <label className="vm-checkbox">
            <input type="checkbox" />
            Я соглашаюсь с условиями использования и политикой конфиденциальности
          </label>

          <button className="vm-button" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? role === 'doctor'
                ? 'Отправляем заявку...'
                : 'Создаем аккаунт...'
              : role === 'doctor'
                ? 'Подать заявку врача'
                : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="vm-auth-footer">
          Уже есть аккаунт?{' '}
          <AppLink className="vm-link" href={withReturnTo(routes.login, searchParams.get('returnTo'))}>
            Войти
          </AppLink>
        </div>
      </div>
    </VirtualMedicAuthFrame>
  )
}

export default RegistrationDesktopPage
