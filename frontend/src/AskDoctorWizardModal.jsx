import { useEffect, useMemo, useState } from 'react'
import { apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import {
  normalizeMultilineTextValue,
  normalizeOptionalTextValue,
  normalizeUsernameValue,
  resolveFormApiError,
  useSubmitLock,
} from './formSupport'
import { buildQuestionHref } from './publicPageUtils'
import { useRouter } from './router'

const MIN_PAID_PRICE_RUB = 749
const PRICE_PRESETS = [949, 1049, 1249]
const PROFILE_DEFAULTS_STORAGE_KEY = 'askDoctorWizard.profileDefaults.v1'
const usernamePattern = /^[a-zA-Z0-9_.-]{4,64}$/
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/

const WIZARD_STEPS = Object.freeze({
  QUESTION: 'question',
  FORMAT: 'format',
  PRICE: 'price',
  PROFILE: 'profile',
})

const STEP_ORDER = Object.freeze({
  [WIZARD_STEPS.QUESTION]: 0,
  [WIZARD_STEPS.FORMAT]: 1,
  [WIZARD_STEPS.PRICE]: 2,
  [WIZARD_STEPS.PROFILE]: 3,
})

function splitPatientName(value) {
  const normalized = normalizeOptionalTextValue(value || '')
  if (!normalized) {
    return { firstName: null, lastName: null }
  }

  const [firstToken, ...rest] = normalized.split(' ')
  return {
    firstName: firstToken || null,
    lastName: rest.length ? rest.join(' ') : null,
  }
}

function parseAge(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) {
    return null
  }

  return parsed
}

function readProfileDefaults() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILE_DEFAULTS_STORAGE_KEY) || '{}')
    return {
      patientName: typeof parsed.patientName === 'string' ? parsed.patientName : '',
      patientAge: typeof parsed.patientAge === 'string' ? parsed.patientAge : '',
      chronicConditions: typeof parsed.chronicConditions === 'string' ? parsed.chronicConditions : '',
      contactEmail: typeof parsed.contactEmail === 'string' ? parsed.contactEmail : '',
    }
  } catch {
    return {
      patientName: '',
      patientAge: '',
      chronicConditions: '',
      contactEmail: '',
    }
  }
}

function writeProfileDefaults(defaults) {
  window.localStorage.setItem(PROFILE_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults))
}

function formatQueuePeopleCount(count) {
  const normalizedCount = Math.abs(count)
  const lastTwoDigits = normalizedCount % 100
  const lastDigit = normalizedCount % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} человек`
  }

  if (lastDigit === 1) {
    return `${count} человек`
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} человека`
  }

  return `${count} человек`
}

function mapQuestionFieldErrors(rawFieldErrors) {
  const keyMap = {
    specialization_id: 'selectedSpecializationId',
    short_problem: 'shortProblem',
    details: 'details',
    question_format: 'questionFormat',
    price_rub: 'priceRub',
    patient_name: 'patientName',
    patient_age: 'patientAge',
    contact_email: 'contactEmail',
    consent_terms: 'consentTerms',
    consent_marketing: 'consentMarketing',
    username: 'accountUsername',
    password: 'accountPassword',
    confirm_password: 'accountConfirmPassword',
  }

  const friendlyMessageByField = {
    selectedSpecializationId: 'Выберите специализацию врача.',
    shortProblem: 'Коротко опишите, что вас беспокоит.',
    details: 'Добавьте более подробное описание проблемы.',
    priceRub: `Минимальная сумма ${MIN_PAID_PRICE_RUB} ₽`,
    patientName: 'Укажите ваше имя.',
    patientAge: 'Укажите возраст числом от 0 до 120.',
    contactEmail: 'Укажите корректный адрес электронной почты.',
    consentTerms: 'Подтвердите согласие с условиями и политикой обработки данных.',
    accountUsername: 'Придумайте логин: 4-64 символа, латиница, цифры и знаки ._-',
    accountPassword: 'Пароль должен быть надёжным: от 10 символов, с буквами, цифрой и спецсимволом.',
    accountConfirmPassword: 'Пароли не совпадают.',
  }

  return Object.entries(rawFieldErrors || {}).reduce((accumulator, [rawKey]) => {
    const mappedKey = keyMap[rawKey]
    if (!mappedKey) {
      return accumulator
    }

    accumulator[mappedKey] = friendlyMessageByField[mappedKey] || 'Проверьте значение в этом поле.'
    return accumulator
  }, {})
}

export function AskDoctorWizardModal({
  isOpen,
  initialQuestion = '',
  preferredSpecializationLabel = '',
  onClose,
  onQuestionCreated,
}) {
  const auth = useAuth()
  const { navigate } = useRouter()
  const runQuestionSubmit = useSubmitLock()
  const runAuthSubmit = useSubmitLock()

  const [step, setStep] = useState(WIZARD_STEPS.QUESTION)
  const [stepTransitionDirection, setStepTransitionDirection] = useState('forward')
  const [specializations, setSpecializations] = useState([])
  const [specializationsError, setSpecializationsError] = useState('')
  const [isSpecializationsLoading, setIsSpecializationsLoading] = useState(false)
  const [freeQueuePendingCount, setFreeQueuePendingCount] = useState(0)

  const [selectedSpecializationId, setSelectedSpecializationId] = useState('')
  const [shortProblem, setShortProblem] = useState('')
  const [details, setDetails] = useState('')
  const [questionFormat, setQuestionFormat] = useState('paid')
  const [priceRub, setPriceRub] = useState(String(MIN_PAID_PRICE_RUB))
  const [promoCode, setPromoCode] = useState('')

  const [patientName, setPatientName] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [chronicConditions, setChronicConditions] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)

  const [accountUsername, setAccountUsername] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('')

  const [wizardError, setWizardError] = useState('')
  const [wizardMessage, setWizardMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [isQuestionSubmitting, setIsQuestionSubmitting] = useState(false)

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authLoginPassword, setAuthLoginPassword] = useState('')
  const [authRegisterPassword, setAuthRegisterPassword] = useState('')
  const [authRegisterConfirmPassword, setAuthRegisterConfirmPassword] = useState('')
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)

  const detailsLength = details.length
  const isPaidFormat = questionFormat === 'paid'
  const freeQueueLabel =
    freeQueuePendingCount > 0
      ? `Перед вами ${formatQueuePeopleCount(freeQueuePendingCount)} в очереди`
      : 'Ваш вопрос сейчас станет первым'

  const selectedSpecializationLabel = useMemo(
    () => specializations.find((item) => String(item.id) === selectedSpecializationId)?.name || '',
    [selectedSpecializationId, specializations],
  )

  const resolvePreferredSpecializationId = (items, label) => {
    const normalizedLabel = normalizeOptionalTextValue(label || '')?.toLowerCase() || ''

    if (!normalizedLabel || normalizedLabel === 'все направления') {
      return ''
    }

    const normalizedSpecializations = items.map((item) => ({
      id: String(item.id),
      name: item.name.toLowerCase(),
    }))

    const exactMatch = normalizedSpecializations.find((item) => item.name === normalizedLabel)
    if (exactMatch) {
      return exactMatch.id
    }

    const tokenMatchers = {
      терапия: /(терап|терапевт)/,
      педиатрия: /педиатр/,
      дерматология: /дермат/,
      неврология: /невр/,
      гастроэнтерология: /гастро/,
      кардиология: /карди/,
    }

    const matcher = tokenMatchers[normalizedLabel]
    if (!matcher) {
      return ''
    }

    const matchByToken = normalizedSpecializations.find((item) => matcher.test(item.name))
    return matchByToken?.id || ''
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const normalized = normalizeMultilineTextValue(initialQuestion || '')
    const profileDefaults = readProfileDefaults()
    const knownFirstName = normalizeOptionalTextValue(auth.user?.first_name || '')
    const knownLastName = normalizeOptionalTextValue(auth.user?.last_name || '')
    const knownFullName = [knownFirstName, knownLastName].filter(Boolean).join(' ')
    const initialPatientName = knownFullName || profileDefaults.patientName
    const usernameAsEmail = /^\S+@\S+\.\S+$/.test(auth.user?.username || '') ? auth.user.username : ''
    const initialContactEmail = profileDefaults.contactEmail || usernameAsEmail

    setStep(WIZARD_STEPS.QUESTION)
    setStepTransitionDirection('forward')
    setSelectedSpecializationId('')
    setShortProblem(normalized)
    setDetails(normalized)
    setQuestionFormat('paid')
    setPriceRub(String(MIN_PAID_PRICE_RUB))
    setPromoCode('')
    setPatientName(initialPatientName)
    setPatientAge(profileDefaults.patientAge)
    setChronicConditions(profileDefaults.chronicConditions)
    setContactEmail(initialContactEmail)
    setConsentTerms(false)
    setConsentMarketing(false)
    setAccountUsername('')
    setAccountPassword('')
    setAccountConfirmPassword('')
    setWizardError('')
    setWizardMessage('')
    setFieldErrors({})
    setAuthError('')
    setAuthLoginPassword('')
    setAuthRegisterPassword('')
    setAuthRegisterConfirmPassword('')
    setIsAuthModalOpen(false)
    setAuthMode('login')

    let isCancelled = false

    const loadData = async () => {
      setIsSpecializationsLoading(true)
      setSpecializationsError('')

      const [specializationsResponse, queueResponse] = await Promise.allSettled([
        apiClient.listSpecializations(),
        apiClient.getFreeQueueStatus(),
      ])

      if (isCancelled) {
        return
      }

      if (specializationsResponse.status === 'fulfilled') {
        setSpecializations(specializationsResponse.value)

        const preferredId = resolvePreferredSpecializationId(
          specializationsResponse.value,
          preferredSpecializationLabel,
        )

        if (preferredId) {
          setSelectedSpecializationId(preferredId)
        }
      } else {
        const resolvedError = resolveFormApiError(specializationsResponse.reason, {
          defaultMessage: 'Не удалось загрузить специализации. Попробуйте позже.',
        })
        setSpecializationsError(resolvedError.formError)
      }

      if (queueResponse.status === 'fulfilled') {
        setFreeQueuePendingCount(queueResponse.value.pending_count || 0)
      } else {
        setFreeQueuePendingCount(0)
      }

      setIsSpecializationsLoading(false)
    }

    loadData()

    return () => {
      isCancelled = true
    }
  }, [auth.user?.first_name, auth.user?.last_name, auth.user?.username, initialQuestion, isOpen, preferredSpecializationLabel])

  if (!isOpen) {
    return null
  }

  const goToStep = (nextStep) => {
    const currentStepOrder = STEP_ORDER[step] ?? 0
    const nextStepOrder = STEP_ORDER[nextStep] ?? currentStepOrder
    setStepTransitionDirection(nextStepOrder < currentStepOrder ? 'backward' : 'forward')
    setWizardError('')
    setWizardMessage('')
    setFieldErrors({})
    setStep(nextStep)
  }

  const clearFieldError = (fieldName) => {
    setFieldErrors((current) => {
      if (!current[fieldName]) {
        return current
      }

      const next = { ...current }
      delete next[fieldName]
      return next
    })
  }

  const openAuthModal = (mode) => {
    setAuthMode(mode)
    setAuthError('')
    if (mode === 'register') {
      setAuthRegisterPassword(accountPassword)
      setAuthRegisterConfirmPassword(accountConfirmPassword)
    }
    setIsAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setIsAuthModalOpen(false)
    setAuthError('')
  }

  const handleQuestionStepContinue = () => {
    const nextFieldErrors = {}

    if (!selectedSpecializationId) {
      nextFieldErrors.selectedSpecializationId = 'Выберите специализацию врача.'
    }

    const normalizedShortProblem = normalizeOptionalTextValue(shortProblem)
    if (!normalizedShortProblem || normalizedShortProblem.length < 2) {
      nextFieldErrors.shortProblem = 'Коротко опишите, что вас беспокоит.'
    }

    const normalizedDetails = normalizeMultilineTextValue(details)
    if (!normalizedDetails || normalizedDetails.length < 10) {
      nextFieldErrors.details = 'Расскажите подробнее, чтобы врач лучше понял ситуацию.'
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setWizardError('Пожалуйста, заполните отмеченные поля.')
      return
    }

    setFieldErrors({})
    goToStep(WIZARD_STEPS.FORMAT)
  }

  const handleFormatStepContinue = () => {
    if (isPaidFormat) {
      goToStep(WIZARD_STEPS.PRICE)
      return
    }

    goToStep(WIZARD_STEPS.PROFILE)
  }

  const handlePriceStepContinue = () => {
    const parsedPrice = Number.parseInt(priceRub, 10)

    if (!Number.isInteger(parsedPrice) || parsedPrice < MIN_PAID_PRICE_RUB) {
      setFieldErrors({ priceRub: `Минимальная сумма ${MIN_PAID_PRICE_RUB} ₽` })
      setWizardError('Проверьте стоимость вопроса.')
      return
    }

    setFieldErrors({})
    goToStep(WIZARD_STEPS.PROFILE)
  }

  const buildQuestionPayload = () => {
    const parsedAge = parseAge(patientAge)
    const normalizedDetails = normalizeMultilineTextValue(details)
    const normalizedShortProblem = normalizeOptionalTextValue(shortProblem) || normalizedDetails.slice(0, 300)
    const payload = {
      text: normalizedDetails,
      specialization_id: Number.parseInt(selectedSpecializationId, 10),
      short_problem: normalizedShortProblem,
      details: normalizedDetails,
      question_format: questionFormat,
      price_rub: isPaidFormat ? Number.parseInt(priceRub, 10) : null,
      is_paid_mock: isPaidFormat ? true : null,
      queue_position_at_submit: isPaidFormat ? null : freeQueuePendingCount,
      promo_code: normalizeOptionalTextValue(promoCode),
      patient_name: normalizeOptionalTextValue(patientName),
      patient_age: parsedAge,
      chronic_conditions: normalizeOptionalTextValue(chronicConditions),
      contact_email: normalizeOptionalTextValue(contactEmail),
      consent_terms: consentTerms,
      consent_marketing: consentMarketing,
      source: 'landing_wizard',
    }

    return payload
  }

  const validateProfileData = () => {
    const nextFieldErrors = {}

    const normalizedPatientName = normalizeOptionalTextValue(patientName)
    if (!normalizedPatientName) {
      nextFieldErrors.patientName = 'Укажите ваше имя.'
    }

    const parsedAge = parseAge(patientAge)
    if (parsedAge === null || parsedAge < 0 || parsedAge > 120) {
      nextFieldErrors.patientAge = 'Укажите возраст числом от 0 до 120.'
    }

    const normalizedEmail = normalizeOptionalTextValue(contactEmail)
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      nextFieldErrors.contactEmail = 'Укажите корректный адрес электронной почты.'
    }

    if (!consentTerms) {
      nextFieldErrors.consentTerms = 'Подтвердите согласие с условиями и политикой обработки данных.'
    }

    if (!auth.isAuthenticated) {
      const normalizedUsername = normalizeOptionalTextValue(accountUsername)
      if (!normalizedUsername || !usernamePattern.test(normalizedUsername)) {
        nextFieldErrors.accountUsername = 'Придумайте логин: 4-64 символа, латиница, цифры и знаки ._-'
      }

      if (!strongPasswordPattern.test(accountPassword)) {
        nextFieldErrors.accountPassword = 'Пароль должен быть надёжным: от 10 символов, с буквами, цифрой и спецсимволом.'
      }

      if (accountConfirmPassword !== accountPassword) {
        nextFieldErrors.accountConfirmPassword = 'Пароли не совпадают.'
      }
    }

    if (isPaidFormat) {
      const parsedPrice = Number.parseInt(priceRub, 10)
      if (!Number.isInteger(parsedPrice) || parsedPrice < MIN_PAID_PRICE_RUB) {
        nextFieldErrors.priceRub = `Минимальная сумма ${MIN_PAID_PRICE_RUB} ₽`
      }
    }

    return nextFieldErrors
  }

  const createQuestion = async () => {
    await runQuestionSubmit(async () => {
      const validationErrors = validateProfileData()
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors)
        setWizardError('Пожалуйста, заполните отмеченные поля.')
        return
      }

      setIsQuestionSubmitting(true)
      setWizardError('')
      setWizardMessage('')
      setFieldErrors({})

      try {
        const response = await apiClient.createQuestion(buildQuestionPayload())
        writeProfileDefaults({
          patientName: normalizeOptionalTextValue(patientName),
          patientAge: String(parseAge(patientAge) ?? ''),
          chronicConditions: normalizeOptionalTextValue(chronicConditions),
          contactEmail: normalizeOptionalTextValue(contactEmail),
        })
        setWizardMessage('Вопрос создан. Перенаправляем на страницу вопроса...')
        onQuestionCreated?.(response)
        onClose()
        navigate(buildQuestionHref(response.id))
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось создать вопрос. Попробуйте ещё раз.',
          statusMessages: {
            400: 'Проверьте заполненные данные и попробуйте снова.',
            401: 'Сессия завершилась. Войдите в аккаунт ещё раз.',
            403: 'Этот аккаунт не может публиковать вопросы. Войдите как пациент и повторите попытку.',
            422: 'Пожалуйста, проверьте заполнение полей формы.',
          },
        })
        const mappedFieldErrors = mapQuestionFieldErrors(resolvedError.fieldErrors)
        if (Object.keys(mappedFieldErrors).length > 0) {
          setFieldErrors((current) => ({ ...current, ...mappedFieldErrors }))
        }
        setWizardError(resolvedError.formError)
      } finally {
        setIsQuestionSubmitting(false)
      }
    })
  }

  const registerAndCreateQuestion = async () => {
    await runQuestionSubmit(async () => {
      setIsQuestionSubmitting(true)
      setWizardError('')
      setWizardMessage('')
      setFieldErrors({})

      try {
        const normalizedUsername = normalizeOptionalTextValue(accountUsername)

        const { firstName, lastName } = splitPatientName(patientName)
        await auth.registerPatient({
          username: normalizeUsernameValue(normalizedUsername),
          password: accountPassword,
          first_name: firstName,
          last_name: lastName,
        })

        await auth.login({
          username: normalizeUsernameValue(normalizedUsername),
          password: accountPassword,
        })

        const response = await apiClient.createQuestion(buildQuestionPayload())
        writeProfileDefaults({
          patientName: normalizeOptionalTextValue(patientName),
          patientAge: String(parseAge(patientAge) ?? ''),
          chronicConditions: normalizeOptionalTextValue(chronicConditions),
          contactEmail: normalizeOptionalTextValue(contactEmail),
        })
        setWizardMessage('Вопрос создан. Перенаправляем на страницу вопроса...')
        onQuestionCreated?.(response)
        onClose()
        navigate(buildQuestionHref(response.id))
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось создать аккаунт или опубликовать вопрос. Попробуйте ещё раз.',
          statusMessages: {
            400: 'Проверьте заполненные данные и попробуйте снова.',
            401: 'Сессия завершилась. Войдите в аккаунт ещё раз.',
            403: 'Этот аккаунт не может публиковать вопросы. Войдите как пациент и повторите попытку.',
            409: 'Такой логин уже занят. Попробуйте другой.',
            422: 'Пожалуйста, проверьте заполнение полей формы.',
          },
        })
        const mappedFieldErrors = mapQuestionFieldErrors(resolvedError.fieldErrors)
        if (Object.keys(mappedFieldErrors).length > 0) {
          setFieldErrors((current) => ({ ...current, ...mappedFieldErrors }))
        }
        setWizardError(resolvedError.formError)
      } finally {
        setIsQuestionSubmitting(false)
      }
    })
  }

  const handleProfileSubmit = async () => {
    const validationErrors = validateProfileData()
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setWizardError('Пожалуйста, заполните отмеченные поля.')
      return
    }

    if (auth.isAuthenticated) {
      await createQuestion()
      return
    }

    await registerAndCreateQuestion()
  }

  const handleAuthLogin = async (event) => {
    event.preventDefault()

    await runAuthSubmit(async () => {
      setIsAuthSubmitting(true)
      setAuthError('')

      try {
        await auth.login({
          username: normalizeUsernameValue(accountUsername),
          password: authLoginPassword || accountPassword,
        })

        closeAuthModal()
        if (step === WIZARD_STEPS.PROFILE) {
          await createQuestion()
        } else {
          setWizardMessage('Вы успешно авторизовались. Продолжайте заполнение вопроса.')
        }
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось авторизоваться.',
          statusMessages: {
            401: 'Неверный логин или пароль.',
            403: 'Вход временно недоступен для этого аккаунта.',
          },
        })
        setAuthError(resolvedError.formError)
      } finally {
        setIsAuthSubmitting(false)
      }
    })
  }

  const handleAuthRegister = async (event) => {
    event.preventDefault()

    await runAuthSubmit(async () => {
      setIsAuthSubmitting(true)
      setAuthError('')

      const normalizedUsername = normalizeOptionalTextValue(accountUsername)
      const registerPassword = authRegisterPassword || accountPassword
      const registerConfirmPassword = authRegisterConfirmPassword || accountConfirmPassword

      if (!normalizedUsername || !usernamePattern.test(normalizedUsername)) {
        setAuthError('Введите логин: 4-64 символа, латиница, цифры и знаки ._-')
        setIsAuthSubmitting(false)
        return
      }

      if (!strongPasswordPattern.test(registerPassword)) {
        setAuthError('Пароль слишком слабый. Нужны заглавные, строчные, цифры и спецсимволы.')
        setIsAuthSubmitting(false)
        return
      }

      if (registerPassword !== registerConfirmPassword) {
        setAuthError('Пароли не совпадают.')
        setIsAuthSubmitting(false)
        return
      }

      try {
        const { firstName, lastName } = splitPatientName(patientName)

        await auth.registerPatient({
          username: normalizeUsernameValue(normalizedUsername),
          password: registerPassword,
          first_name: firstName,
          last_name: lastName,
        })

        await auth.login({
          username: normalizeUsernameValue(normalizedUsername),
          password: registerPassword,
        })

        closeAuthModal()
        if (step === WIZARD_STEPS.PROFILE) {
          await createQuestion()
        } else {
          setWizardMessage('Аккаунт создан. Продолжайте заполнение вопроса.')
        }
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось зарегистрироваться.',
          statusMessages: {
            409: 'Такой логин уже занят. Попробуйте другой.',
          },
        })
        setAuthError(resolvedError.formError)
      } finally {
        setIsAuthSubmitting(false)
      }
    })
  }

  return (
    <>
      <div
        className="ask-wizard-overlay"
        role="presentation"
        onClick={onClose}
      >
        <section
          className="ask-wizard-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ask-doctor-wizard-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="ask-wizard-header">
            <div>
              <h2 id="ask-doctor-wizard-title">Спросить врача</h2>
              <p>Заполните форму. После входа в аккаунт вопрос будет опубликован в ленте.</p>
            </div>
            <button
              type="button"
              className="ask-wizard-close"
              onClick={onClose}
              aria-label="Закрыть окно"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {wizardError ? <div className="ask-wizard-error">{wizardError}</div> : null}
          {wizardMessage ? <div className="ask-wizard-success">{wizardMessage}</div> : null}

          {step === WIZARD_STEPS.QUESTION ? (
            <div className={`ask-wizard-grid ask-step-panel ${stepTransitionDirection === 'backward' ? 'is-backward' : ''}`}>
              <label className="ask-wizard-field">
                <span>Выберите врача*</span>
                <select
                  className={`ask-wizard-input ${fieldErrors.selectedSpecializationId ? 'ask-wizard-input--error' : ''}`}
                  value={selectedSpecializationId}
                  onChange={(event) => {
                    setSelectedSpecializationId(event.target.value)
                    clearFieldError('selectedSpecializationId')
                  }}
                  disabled={isSpecializationsLoading}
                >
                  <option value="">Выберите врача</option>
                  {specializations.map((specialization) => (
                    <option key={specialization.id} value={specialization.id}>
                      {specialization.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.selectedSpecializationId ? <span className="ask-wizard-field-error">{fieldErrors.selectedSpecializationId}</span> : null}
              </label>

              {specializationsError ? <p className="ask-wizard-note ask-wizard-note--error">{specializationsError}</p> : null}

              <p className="ask-wizard-note">
                Если сомневаетесь, укажите <strong>терапевта</strong> или <strong>педиатра</strong>. Для вопроса про
                домашнего любимца выберите <strong>ветеринара</strong>.
              </p>

              <label className="ask-wizard-field">
                <span>Что вас беспокоит*</span>
                <input
                  className={`ask-wizard-input ${fieldErrors.shortProblem ? 'ask-wizard-input--error' : ''}`}
                  type="text"
                  placeholder="Коротко опишите проблему"
                  value={shortProblem}
                  onChange={(event) => {
                    setShortProblem(event.target.value)
                    clearFieldError('shortProblem')
                  }}
                />
                {fieldErrors.shortProblem ? <span className="ask-wizard-field-error">{fieldErrors.shortProblem}</span> : null}
              </label>

              <label className="ask-wizard-field">
                <span className="ask-wizard-field__row">
                  Расскажите подробнее*
                  <span>{detailsLength}/7500</span>
                </span>
                <textarea
                  className={`ask-wizard-textarea ${fieldErrors.details ? 'ask-wizard-input--error' : ''}`}
                  maxLength={7500}
                  placeholder="Расскажите о том, что тревожит — подробно и детально"
                  value={details}
                  onChange={(event) => {
                    setDetails(event.target.value)
                    clearFieldError('details')
                  }}
                />
                {fieldErrors.details ? <span className="ask-wizard-field-error">{fieldErrors.details}</span> : null}
              </label>

              {!auth.isAuthenticated ? (
                <p className="ask-wizard-note">
                  <button type="button" className="ask-wizard-link" onClick={() => openAuthModal('login')}>
                    Авторизуйтесь
                  </button>{' '}
                  если у вас есть аккаунт
                </p>
              ) : null}

              <div className="ask-wizard-actions ask-wizard-actions--single">
                <button className="ask-wizard-button ask-wizard-button--primary" type="button" onClick={handleQuestionStepContinue}>
                  Продолжить
                </button>
              </div>
            </div>
          ) : null}

          {step === WIZARD_STEPS.FORMAT ? (
            <div className={`ask-wizard-grid ask-step-panel ${stepTransitionDirection === 'backward' ? 'is-backward' : ''}`}>
              <h3 className="ask-wizard-step-title">Формат вопроса</h3>

              <button
                type="button"
                className={`ask-format-card ${questionFormat === 'paid' ? 'is-active' : ''}`}
                onClick={() => setQuestionFormat('paid')}
              >
                <div className="ask-format-card__head">
                  <strong>Быстро и с файлами</strong>
                  <span className="ask-format-card__price">от {MIN_PAID_PRICE_RUB} ₽</span>
                </div>
                <ul>
                  <li>Ответы от нескольких врачей</li>
                  <li>Можно добавить анализы или фото</li>
                  <li>Вопрос не увидят другие пользователи</li>
                </ul>
              </button>

              <button
                type="button"
                className={`ask-format-card ask-format-card--free ${questionFormat === 'free' ? 'is-active' : ''}`}
                onClick={() => setQuestionFormat('free')}
              >
                <div className="ask-format-card__head">
                  <strong>Очередь до 3 дней</strong>
                  <span className="ask-format-card__queue">{freeQueueLabel}</span>
                </div>
                <ul>
                  <li>Без оплаты и гарантии ответа</li>
                  <li>Нельзя добавить фото и анализы</li>
                  <li>Вопрос виден другим пользователям</li>
                </ul>
              </button>

              <div className="ask-wizard-actions">
                <button className="ask-wizard-button ask-wizard-button--ghost" type="button" onClick={() => goToStep(WIZARD_STEPS.QUESTION)}>
                  Назад
                </button>
                <button className="ask-wizard-button ask-wizard-button--primary" type="button" onClick={handleFormatStepContinue}>
                  Продолжить
                </button>
              </div>
            </div>
          ) : null}

          {step === WIZARD_STEPS.PRICE ? (
            <div className={`ask-wizard-grid ask-step-panel ${stepTransitionDirection === 'backward' ? 'is-backward' : ''}`}>
              <h3 className="ask-wizard-step-title">Выберите стоимость вопроса</h3>
              <p className="ask-wizard-note">Вы определяете уровень поддержки врачей, которые возьмут ваш вопрос в работу.</p>

              <label className="ask-wizard-field">
                <span>Сумма, ₽</span>
                <input
                  className={`ask-wizard-input ${fieldErrors.priceRub ? 'ask-wizard-input--error' : ''}`}
                  type="number"
                  min={MIN_PAID_PRICE_RUB}
                  step="1"
                  value={priceRub}
                  onChange={(event) => {
                    setPriceRub(event.target.value)
                    clearFieldError('priceRub')
                  }}
                />
                {fieldErrors.priceRub ? <span className="ask-wizard-field-error">{fieldErrors.priceRub}</span> : null}
              </label>

              <p className="ask-wizard-note">Минимальная сумма {MIN_PAID_PRICE_RUB} ₽</p>

              <div className="ask-price-presets">
                {PRICE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`ask-price-chip ${String(preset) === String(priceRub) ? 'is-active' : ''}`}
                    onClick={() => setPriceRub(String(preset))}
                  >
                    {preset} ₽
                  </button>
                ))}
              </div>

              <label className="ask-wizard-field">
                <span>Промокод (необязательно)</span>
                <input
                  className="ask-wizard-input"
                  type="text"
                  placeholder="У меня есть промокод"
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value)}
                />
              </label>

              <div className="ask-wizard-actions">
                <button className="ask-wizard-button ask-wizard-button--ghost" type="button" onClick={() => goToStep(WIZARD_STEPS.FORMAT)}>
                  Назад
                </button>
                <button className="ask-wizard-button ask-wizard-button--primary" type="button" onClick={handlePriceStepContinue}>
                  Оплатить и продолжить
                </button>
              </div>
            </div>
          ) : null}

          {step === WIZARD_STEPS.PROFILE ? (
            <div className={`ask-wizard-grid ask-step-panel ${stepTransitionDirection === 'backward' ? 'is-backward' : ''}`}>
              <h3 className="ask-wizard-step-title">Спроси врача</h3>
              <p className="ask-wizard-note">Необходимо предоставить врачам как можно более полную информацию о себе.</p>

              <label className="ask-wizard-field">
                <span>Имя</span>
                <input
                  className={`ask-wizard-input ${fieldErrors.patientName ? 'ask-wizard-input--error' : ''}`}
                  type="text"
                  placeholder="Как вас зовут?"
                  value={patientName}
                  onChange={(event) => {
                    setPatientName(event.target.value)
                    clearFieldError('patientName')
                  }}
                />
                {fieldErrors.patientName ? <span className="ask-wizard-field-error">{fieldErrors.patientName}</span> : null}
              </label>

              <label className="ask-wizard-field">
                <span>Возраст</span>
                <input
                  className={`ask-wizard-input ${fieldErrors.patientAge ? 'ask-wizard-input--error' : ''}`}
                  type="number"
                  min="0"
                  max="120"
                  placeholder="Сколько вам лет?"
                  value={patientAge}
                  onChange={(event) => {
                    setPatientAge(event.target.value)
                    clearFieldError('patientAge')
                  }}
                />
                {fieldErrors.patientAge ? <span className="ask-wizard-field-error">{fieldErrors.patientAge}</span> : null}
              </label>

              <label className="ask-wizard-field">
                <span>Хронические болезни</span>
                <input
                  className="ask-wizard-input"
                  type="text"
                  placeholder="Ответ может стать точнее"
                  value={chronicConditions}
                  onChange={(event) => setChronicConditions(event.target.value)}
                />
              </label>

              <label className="ask-wizard-field">
                <span>Email</span>
                <input
                  className={`ask-wizard-input ${fieldErrors.contactEmail ? 'ask-wizard-input--error' : ''}`}
                  type="email"
                  placeholder="example@mail.ru"
                  value={contactEmail}
                  onChange={(event) => {
                    setContactEmail(event.target.value)
                    clearFieldError('contactEmail')
                  }}
                />
                {fieldErrors.contactEmail ? <span className="ask-wizard-field-error">{fieldErrors.contactEmail}</span> : null}
              </label>

              {!auth.isAuthenticated ? (
                <>
                  <label className="ask-wizard-field">
                    <span>Логин</span>
                    <input
                      className={`ask-wizard-input ${fieldErrors.accountUsername ? 'ask-wizard-input--error' : ''}`}
                      type="text"
                      placeholder="Придумайте логин"
                      value={accountUsername}
                      onChange={(event) => {
                        setAccountUsername(event.target.value)
                        clearFieldError('accountUsername')
                      }}
                    />
                    {fieldErrors.accountUsername ? <span className="ask-wizard-field-error">{fieldErrors.accountUsername}</span> : null}
                  </label>

                  <label className="ask-wizard-field">
                    <span>Пароль</span>
                    <input
                      className={`ask-wizard-input ${fieldErrors.accountPassword ? 'ask-wizard-input--error' : ''}`}
                      type="password"
                      placeholder="Придумайте надежный пароль"
                      value={accountPassword}
                      onChange={(event) => {
                        setAccountPassword(event.target.value)
                        clearFieldError('accountPassword')
                      }}
                    />
                    {fieldErrors.accountPassword ? <span className="ask-wizard-field-error">{fieldErrors.accountPassword}</span> : null}
                  </label>

                  <label className="ask-wizard-field">
                    <span>Подтверждение пароля</span>
                    <input
                      className={`ask-wizard-input ${fieldErrors.accountConfirmPassword ? 'ask-wizard-input--error' : ''}`}
                      type="password"
                      placeholder="Повторите пароль"
                      value={accountConfirmPassword}
                      onChange={(event) => {
                        setAccountConfirmPassword(event.target.value)
                        clearFieldError('accountConfirmPassword')
                      }}
                    />
                    {fieldErrors.accountConfirmPassword ? <span className="ask-wizard-field-error">{fieldErrors.accountConfirmPassword}</span> : null}
                  </label>
                </>
              ) : (
                <p className="ask-wizard-note">Вы авторизованы как @{auth.user.username}. Вопрос будет опубликован от вашего профиля.</p>
              )}

              <label className="ask-consent">
                <input
                  type="checkbox"
                  checked={consentTerms}
                  onChange={(event) => {
                    setConsentTerms(event.target.checked)
                    clearFieldError('consentTerms')
                  }}
                />
                <span>Я ознакомился с лицензионным соглашением и политикой обработки данных</span>
              </label>
              {fieldErrors.consentTerms ? <p className="ask-wizard-field-error">{fieldErrors.consentTerms}</p> : null}

              <label className="ask-consent">
                <input
                  type="checkbox"
                  checked={consentMarketing}
                  onChange={(event) => setConsentMarketing(event.target.checked)}
                />
                <span>Я согласен с получением рекламных и информационных материалов</span>
              </label>

              {!auth.isAuthenticated ? (
                <p className="ask-wizard-note">
                  <button type="button" className="ask-wizard-link" onClick={() => openAuthModal('login')}>
                    Авторизуйтесь
                  </button>{' '}
                  если у вас есть аккаунт
                </p>
              ) : null}

              <div className="ask-wizard-actions">
                <button
                  className="ask-wizard-button ask-wizard-button--ghost"
                  type="button"
                  onClick={() => goToStep(isPaidFormat ? WIZARD_STEPS.PRICE : WIZARD_STEPS.FORMAT)}
                  disabled={isQuestionSubmitting}
                >
                  Назад
                </button>
                <button
                  className="ask-wizard-button ask-wizard-button--primary"
                  type="button"
                  onClick={handleProfileSubmit}
                  disabled={isQuestionSubmitting}
                >
                  {isQuestionSubmitting
                    ? 'Отправляем...'
                    : auth.isAuthenticated
                      ? 'Создать вопрос'
                      : 'Создать аккаунт и задать вопрос'}
                </button>
              </div>
            </div>
          ) : null}

          {selectedSpecializationLabel && step !== WIZARD_STEPS.QUESTION ? (
            <p className="ask-wizard-footnote">Выбрана специализация: {selectedSpecializationLabel}</p>
          ) : null}
        </section>
      </div>

      {isAuthModalOpen ? (
        <div className="ask-auth-overlay" role="presentation" onClick={closeAuthModal}>
          <section className="ask-auth-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="ask-auth-head">
              <h3>{authMode === 'login' ? 'Авторизация' : 'Регистрация'}</h3>
              <button type="button" className="ask-wizard-close" onClick={closeAuthModal} aria-label="Закрыть окно">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {authError ? <div className="ask-wizard-error">{authError}</div> : null}

            {authMode === 'login' ? (
              <form className="ask-wizard-grid" onSubmit={handleAuthLogin}>
                <label className="ask-wizard-field">
                  <span>Логин</span>
                  <input
                    className="ask-wizard-input"
                    type="text"
                    value={accountUsername}
                    onChange={(event) => setAccountUsername(event.target.value)}
                    required
                  />
                </label>

                <label className="ask-wizard-field">
                  <span>Пароль</span>
                  <input
                    className="ask-wizard-input"
                    type="password"
                    value={authLoginPassword}
                    onChange={(event) => setAuthLoginPassword(event.target.value)}
                    required
                  />
                </label>

                <button className="ask-wizard-button ask-wizard-button--primary" type="submit" disabled={isAuthSubmitting}>
                  {isAuthSubmitting ? 'Входим...' : 'Войти'}
                </button>

                <button type="button" className="ask-wizard-button ask-wizard-button--ghost" onClick={() => setAuthMode('register')}>
                  Зарегистрироваться
                </button>
              </form>
            ) : (
              <form className="ask-wizard-grid" onSubmit={handleAuthRegister}>
                <label className="ask-wizard-field">
                  <span>Логин</span>
                  <input
                    className="ask-wizard-input"
                    type="text"
                    value={accountUsername}
                    onChange={(event) => setAccountUsername(event.target.value)}
                    required
                  />
                </label>

                <label className="ask-wizard-field">
                  <span>Пароль</span>
                  <input
                    className="ask-wizard-input"
                    type="password"
                    value={authRegisterPassword}
                    onChange={(event) => setAuthRegisterPassword(event.target.value)}
                    required
                  />
                </label>

                <label className="ask-wizard-field">
                  <span>Подтвердите пароль</span>
                  <input
                    className="ask-wizard-input"
                    type="password"
                    value={authRegisterConfirmPassword}
                    onChange={(event) => setAuthRegisterConfirmPassword(event.target.value)}
                    required
                  />
                </label>

                <button className="ask-wizard-button ask-wizard-button--primary" type="submit" disabled={isAuthSubmitting}>
                  {isAuthSubmitting ? 'Создаем аккаунт...' : 'Зарегистрироваться'}
                </button>

                <button type="button" className="ask-wizard-button ask-wizard-button--ghost" onClick={() => setAuthMode('login')}>
                  Уже есть аккаунт
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
