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
const usernamePattern = /^[a-zA-Z0-9_.-]{4,64}$/
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/

const WIZARD_STEPS = Object.freeze({
  QUESTION: 'question',
  FORMAT: 'format',
  PRICE: 'price',
  PROFILE: 'profile',
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

    setStep(WIZARD_STEPS.QUESTION)
    setSelectedSpecializationId('')
    setShortProblem(normalized)
    setDetails(normalized)
    setQuestionFormat('paid')
    setPriceRub(String(MIN_PAID_PRICE_RUB))
    setPromoCode('')
    setPatientName('')
    setPatientAge('')
    setChronicConditions('')
    setContactEmail('')
    setConsentTerms(false)
    setConsentMarketing(false)
    setAccountUsername('')
    setAccountPassword('')
    setAccountConfirmPassword('')
    setWizardError('')
    setWizardMessage('')
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
  }, [initialQuestion, isOpen, preferredSpecializationLabel])

  if (!isOpen) {
    return null
  }

  const goToStep = (nextStep) => {
    setWizardError('')
    setWizardMessage('')
    setStep(nextStep)
  }

  const openAuthModal = (mode) => {
    setAuthMode(mode)
    setAuthError('')
    setIsAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setIsAuthModalOpen(false)
    setAuthError('')
  }

  const handleQuestionStepContinue = () => {
    if (!selectedSpecializationId) {
      setWizardError('Выберите врача из списка специализаций.')
      return
    }

    const normalizedShortProblem = normalizeOptionalTextValue(shortProblem)
    if (!normalizedShortProblem || normalizedShortProblem.length < 2) {
      setWizardError('Коротко опишите проблему, минимум 2 символа.')
      return
    }

    const normalizedDetails = normalizeMultilineTextValue(details)
    if (!normalizedDetails || normalizedDetails.length < 10) {
      setWizardError('Расскажите подробнее, минимум 10 символов.')
      return
    }

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
      setWizardError(`Минимальная сумма ${MIN_PAID_PRICE_RUB} ₽`)
      return
    }

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
    const normalizedPatientName = normalizeOptionalTextValue(patientName)
    if (!normalizedPatientName) {
      return 'Укажите имя пациента.'
    }

    const parsedAge = parseAge(patientAge)
    if (parsedAge === null || parsedAge < 0 || parsedAge > 120) {
      return 'Возраст должен быть числом от 0 до 120.'
    }

    const normalizedEmail = normalizeOptionalTextValue(contactEmail)
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return 'Введите корректный email.'
    }

    if (!consentTerms) {
      return 'Нужно принять лицензионное соглашение и политику обработки данных.'
    }

    if (!auth.isAuthenticated) {
      const normalizedUsername = normalizeOptionalTextValue(accountUsername)
      if (!normalizedUsername || !usernamePattern.test(normalizedUsername)) {
        return 'Username: 4-64 символа, латиница/цифры и ._-'
      }

      if (!strongPasswordPattern.test(accountPassword)) {
        return 'Пароль: минимум 10 символов, заглавная, строчная, цифра и спецсимвол.'
      }

      if (accountConfirmPassword !== accountPassword) {
        return 'Пароли не совпадают.'
      }
    }

    if (isPaidFormat) {
      const parsedPrice = Number.parseInt(priceRub, 10)
      if (!Number.isInteger(parsedPrice) || parsedPrice < MIN_PAID_PRICE_RUB) {
        return `Минимальная сумма ${MIN_PAID_PRICE_RUB} ₽`
      }
    }

    return ''
  }

  const createQuestion = async () => {
    await runQuestionSubmit(async () => {
      const validationError = validateProfileData()
      if (validationError) {
        setWizardError(validationError)
        return
      }

      setIsQuestionSubmitting(true)
      setWizardError('')
      setWizardMessage('')

      try {
        const response = await apiClient.createQuestion(buildQuestionPayload())
        setWizardMessage('Вопрос создан. Перенаправляем на страницу вопроса...')
        onQuestionCreated?.(response)
        onClose()
        navigate(buildQuestionHref(response.id))
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось создать вопрос. Попробуйте ещё раз.',
        })
        setWizardError(resolvedError.formError)
      } finally {
        setIsQuestionSubmitting(false)
      }
    })
  }

  const handleProfileSubmit = async () => {
    if (auth.isAuthenticated) {
      await createQuestion()
      return
    }

    openAuthModal('register')
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
        setAuthError('Введите корректный username: 4-64 символа, латиница/цифры и ._-')
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
            409: 'Пользователь с таким username уже существует.',
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
            <div className="ask-wizard-grid">
              <label className="ask-wizard-field">
                <span>Выберите врача*</span>
                <select
                  className="ask-wizard-input"
                  value={selectedSpecializationId}
                  onChange={(event) => setSelectedSpecializationId(event.target.value)}
                  disabled={isSpecializationsLoading}
                >
                  <option value="">Выберите врача</option>
                  {specializations.map((specialization) => (
                    <option key={specialization.id} value={specialization.id}>
                      {specialization.name}
                    </option>
                  ))}
                </select>
              </label>

              {specializationsError ? <p className="ask-wizard-note ask-wizard-note--error">{specializationsError}</p> : null}

              <p className="ask-wizard-note">
                Если сомневаетесь, укажите <strong>терапевта</strong> или <strong>педиатра</strong>. Для вопроса про
                домашнего любимца выберите <strong>ветеринара</strong>.
              </p>

              <label className="ask-wizard-field">
                <span>Что вас беспокоит*</span>
                <input
                  className="ask-wizard-input"
                  type="text"
                  placeholder="Коротко опишите проблему"
                  value={shortProblem}
                  onChange={(event) => setShortProblem(event.target.value)}
                />
              </label>

              <label className="ask-wizard-field">
                <span className="ask-wizard-field__row">
                  Расскажите подробнее*
                  <span>{detailsLength}/7500</span>
                </span>
                <textarea
                  className="ask-wizard-textarea"
                  maxLength={7500}
                  placeholder="Расскажите о том, что тревожит — подробно и детально"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                />
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
            <div className="ask-wizard-grid">
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
                  <span className="ask-format-card__queue">Вы ~{freeQueuePendingCount} на бесплатный вопрос</span>
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
            <div className="ask-wizard-grid">
              <h3 className="ask-wizard-step-title">Выберите стоимость вопроса</h3>
              <p className="ask-wizard-note">Вы определяете уровень поддержки врачей, которые возьмут ваш вопрос в работу.</p>

              <label className="ask-wizard-field">
                <span>Сумма, ₽</span>
                <input
                  className="ask-wizard-input"
                  type="number"
                  min={MIN_PAID_PRICE_RUB}
                  step="1"
                  value={priceRub}
                  onChange={(event) => setPriceRub(event.target.value)}
                />
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
            <div className="ask-wizard-grid">
              <h3 className="ask-wizard-step-title">Спроси врача</h3>
              <p className="ask-wizard-note">Необходимо предоставить врачам как можно более полную информацию о себе.</p>

              <label className="ask-wizard-field">
                <span>Имя</span>
                <input
                  className="ask-wizard-input"
                  type="text"
                  placeholder="Как вас зовут?"
                  value={patientName}
                  onChange={(event) => setPatientName(event.target.value)}
                />
              </label>

              <label className="ask-wizard-field">
                <span>Возраст</span>
                <input
                  className="ask-wizard-input"
                  type="number"
                  min="0"
                  max="120"
                  placeholder="Сколько вам лет?"
                  value={patientAge}
                  onChange={(event) => setPatientAge(event.target.value)}
                />
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
                  className="ask-wizard-input"
                  type="email"
                  placeholder="example@mail.ru"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                />
              </label>

              {!auth.isAuthenticated ? (
                <>
                  <label className="ask-wizard-field">
                    <span>Username</span>
                    <input
                      className="ask-wizard-input"
                      type="text"
                      placeholder="patient_001"
                      value={accountUsername}
                      onChange={(event) => setAccountUsername(event.target.value)}
                    />
                  </label>

                  <label className="ask-wizard-field">
                    <span>Пароль</span>
                    <input
                      className="ask-wizard-input"
                      type="password"
                      placeholder="Минимум 10 символов"
                      value={accountPassword}
                      onChange={(event) => setAccountPassword(event.target.value)}
                    />
                  </label>

                  <label className="ask-wizard-field">
                    <span>Подтверждение пароля</span>
                    <input
                      className="ask-wizard-input"
                      type="password"
                      placeholder="Повторите пароль"
                      value={accountConfirmPassword}
                      onChange={(event) => setAccountConfirmPassword(event.target.value)}
                    />
                  </label>
                </>
              ) : (
                <p className="ask-wizard-note">Вы авторизованы как @{auth.user.username}. Вопрос будет опубликован от вашего профиля.</p>
              )}

              <label className="ask-consent">
                <input
                  type="checkbox"
                  checked={consentTerms}
                  onChange={(event) => setConsentTerms(event.target.checked)}
                />
                <span>Я ознакомился с лицензионным соглашением и политикой обработки данных</span>
              </label>

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
                  <span>Username</span>
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
