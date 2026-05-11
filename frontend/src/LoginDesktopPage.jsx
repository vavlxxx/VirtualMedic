import { useMemo, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { normalizeUsernameValue, resolveFormApiError, useSubmitLock } from './formSupport'
import { AppLink, useRouter } from './router'
import { getDefaultAuthenticatedPath, resolveSafeAppPath, routes, withReturnTo } from './routes'
import { VirtualMedicAuthFrame } from './VirtualMedicLayout'

function validateLoginForm(values) {
  const errors = {}

  if (!values.username.trim()) {
    errors.username = 'Введите имя пользователя'
  }
  if (!values.password) {
    errors.password = 'Введите пароль'
  }

  return errors
}

function LoginDesktopPage() {
  const auth = useAuth()
  const { location, navigate } = useRouter()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const [values, setValues] = useState({ username: '', password: '' })
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const runWithSubmitLock = useSubmitLock()

  const successMessage = searchParams.get('registered')
    ? 'Аккаунт создан. Теперь войдите в систему.'
    : searchParams.get('logged_out')
      ? 'Вы вышли из аккаунта.'
      : ''

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = validateLoginForm(values)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    await runWithSubmitLock(async () => {
      setIsSubmitting(true)
      setFormError('')

      try {
        const response = await auth.login({
          username: normalizeUsernameValue(values.username),
          password: values.password,
        })

        navigate(
          resolveSafeAppPath(searchParams.get('returnTo'), getDefaultAuthenticatedPath(response.user)),
          { replace: true },
        )
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось выполнить вход.',
          statusMessages: {
            401: 'Неверное имя пользователя или пароль',
          },
        })

        setErrors(resolvedError.fieldErrors)
        setFormError(resolvedError.formError)
      } finally {
        setIsSubmitting(false)
      }
    })
  }

  return (
    <VirtualMedicAuthFrame
      title="Вход в систему"
      subtitle="Введите имя пользователя и пароль, чтобы продолжить работу с VirtualMedic."
    >
      <div className="vm-auth-form">
        {successMessage ? <div className="vm-auth-message is-success">{successMessage}</div> : null}
        {formError ? <div className="vm-auth-message is-error">{formError}</div> : null}

        <form className="vm-auth-form" onSubmit={handleSubmit} noValidate>
          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Имя пользователя</span>
            <input
              className="vm-input"
              type="text"
              placeholder="patient_001"
              autoComplete="username"
              value={values.username}
              onChange={(event) => {
                setValues((current) => ({ ...current, username: event.target.value }))
                setErrors((current) => ({ ...current, username: '' }))
              }}
              disabled={isSubmitting}
            />
            {errors.username ? <span className="vm-form-error">{errors.username}</span> : null}
          </label>

          <label className="vm-auth-field">
            <span className="vm-auth-field__label">Пароль</span>
            <div className="vm-auth-field__control">
              <input
                className="vm-input"
                type={isPasswordVisible ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                value={values.password}
                onChange={(event) => {
                  setValues((current) => ({ ...current, password: event.target.value }))
                  setErrors((current) => ({ ...current, password: '' }))
                }}
                disabled={isSubmitting}
              />
              <button
                className="vm-auth-field__icon"
                type="button"
                aria-label={isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                onClick={() => setIsPasswordVisible((current) => !current)}
              >
                <span className="material-symbols-outlined">
                  {isPasswordVisible ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {errors.password ? <span className="vm-form-error">{errors.password}</span> : null}
          </label>

          <button className="vm-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Входим...' : 'Войти'}
          </button>
        </form>

        <div className="vm-auth-footer">
          Нет аккаунта?{' '}
          <AppLink className="vm-link" href={withReturnTo(routes.register, searchParams.get('returnTo'))}>
            Создать аккаунт
          </AppLink>
        </div>
      </div>
    </VirtualMedicAuthFrame>
  )
}

export default LoginDesktopPage
