import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { resolveFormApiError, useSubmitLock } from './formSupport'
import { AppLink } from './router'
import { routes, withReturnTo } from './routes'
import { buildQuestionHref, trimMultilineText } from './publicPageUtils'
import { VirtualMedicPage } from './VirtualMedicLayout'
import { ProfileImage } from './ProfileImage'
import {
  formatRelativeQuestionTime,
  getQuestionCategory,
  summarizeQuestion,
} from './virtualmedicReference'

const QUESTIONS_PAGE_SIZE = 12

const categoryOrder = [
  'Все направления',
  'Терапия',
  'Педиатрия',
  'Дерматология',
  'Неврология',
  'Гастроэнтерология',
  'Кардиология',
]

function validateQuestionText(value) {
  const normalizedValue = trimMultilineText(value)

  if (!normalizedValue) {
    return 'Введите текст вопроса'
  }
  if (normalizedValue.length < 10) {
    return 'Вопрос должен содержать минимум 10 символов'
  }

  return ''
}

function PublicQuestionsFeedPage() {
  const auth = useAuth()
  const currentPageHref = routes.questions
  const runQuestionSubmit = useSubmitLock()
  const replySubmitLocksRef = useRef(new Set())

  const [searchQuery] = useState(() => new URLSearchParams(window.location.search).get('search') || '')
  const [selectedCategory, setSelectedCategory] = useState('Все направления')
  const [questions, setQuestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [questionDraft, setQuestionDraft] = useState('')
  const [questionDraftError, setQuestionDraftError] = useState('')
  const [questionDraftMessage, setQuestionDraftMessage] = useState('')
  const [isQuestionSubmitting, setIsQuestionSubmitting] = useState(false)

  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyErrors, setReplyErrors] = useState({})
  const [replyMessages, setReplyMessages] = useState({})
  const [replySubmittingId, setReplySubmittingId] = useState(null)

  useEffect(() => {
    let isCancelled = false

    const loadQuestions = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await apiClient.listQuestions({
          offset: 0,
          limit: QUESTIONS_PAGE_SIZE,
        })

        if (!isCancelled) {
          setQuestions(response)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить вопросы')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadQuestions()

    return () => {
      isCancelled = true
    }
  }, [])

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return questions.filter((question) => {
      const category = getQuestionCategory(question)
      const categoryMatches = selectedCategory === 'Все направления' || selectedCategory === category
      const searchMatches =
        !normalizedSearch || question.text.toLowerCase().includes(normalizedSearch)

      return categoryMatches && searchMatches
    })
  }, [questions, searchQuery, selectedCategory])

  const handleQuestionSubmit = async (event) => {
    event.preventDefault()

    if (!auth.isReady) {
      setQuestionDraftError('Сначала дождитесь восстановления сессии.')
      return
    }
    if (!auth.isAuthenticated || !auth.hasRole('patient')) {
      setQuestionDraftError('Создание вопроса доступно только авторизованному пациенту.')
      return
    }

    const validationError = validateQuestionText(questionDraft)
    if (validationError) {
      setQuestionDraftError(validationError)
      return
    }

    await runQuestionSubmit(async () => {
      setIsQuestionSubmitting(true)
      setQuestionDraftError('')
      setQuestionDraftMessage('')

      try {
        const response = await apiClient.createQuestion({ text: trimMultilineText(questionDraft) })
        setQuestions((current) => [response, ...current])
        setQuestionDraft('')
        setQuestionDraftMessage('Вопрос опубликован и появился в общей ленте.')
      } catch (error) {
        const resolvedError = resolveFormApiError(error, {
          defaultMessage: 'Не удалось отправить вопрос.',
        })

        setQuestionDraftError(resolvedError.formError)
      } finally {
        setIsQuestionSubmitting(false)
      }
    })
  }

  const handleReplySubmit = (questionId) => async (event) => {
    event.preventDefault()

    if (!auth.isReady || !auth.isAuthenticated || !auth.hasRole('doctor') || !auth.isVerifiedDoctor) {
      setReplyErrors((current) => ({
        ...current,
        [questionId]: 'Отвечать могут только верифицированные врачи.',
      }))
      return
    }

    const nextValue = trimMultilineText(replyDrafts[questionId] || '')
    if (!nextValue) {
      setReplyErrors((current) => ({
        ...current,
        [questionId]: 'Введите текст ответа',
      }))
      return
    }

    if (replySubmitLocksRef.current.has(questionId)) {
      return
    }

    replySubmitLocksRef.current.add(questionId)
    setReplySubmittingId(questionId)
    setReplyErrors((current) => ({ ...current, [questionId]: '' }))
    setReplyMessages((current) => ({ ...current, [questionId]: '' }))

    try {
      const response = await apiClient.createQuestionComment(questionId, { text: nextValue })
      setQuestions((current) => current.map((item) => (item.id === questionId ? response : item)))
      setReplyDrafts((current) => ({ ...current, [questionId]: '' }))
      setReplyMessages((current) => ({ ...current, [questionId]: 'Ответ опубликован.' }))
    } catch (error) {
      setReplyErrors((current) => ({
        ...current,
        [questionId]: error instanceof ApiError ? error.message : 'Не удалось опубликовать ответ.',
      }))
    } finally {
      replySubmitLocksRef.current.delete(questionId)
      setReplySubmittingId(null)
    }
  }

  return (
    <VirtualMedicPage activeNav="questions">
      <section className="vm-page-section">
        <div className="vm-shell">
          <div className="vm-page-hero">
            <div>
              <h1>Лента открытых вопросов</h1>
              <p>Задайте вопрос и получите ответы от квалифицированных специалистов платформы.</p>
            </div>
          </div>

          <div className="vm-chip-row">
            {categoryOrder.map((category) => (
              <button
                key={category}
                className={`vm-chip ${selectedCategory === category ? 'is-active' : ''}`}
                type="button"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <section className="vm-card vm-compose-card vm-question-card">
            <div className="vm-question-card__row">
              <div>
                <div className="vm-overline">Новый вопрос</div>
                <h2>Спросить врача</h2>
              </div>

              {!auth.isAuthenticated ? (
                <AppLink className="vm-button vm-button--soft" href={withReturnTo(routes.login, currentPageHref)}>
                  Войти для публикации
                </AppLink>
              ) : null}
            </div>

            {questionDraftMessage ? <div className="vm-auth-message is-success">{questionDraftMessage}</div> : null}
            {questionDraftError ? <div className="vm-auth-message is-error">{questionDraftError}</div> : null}

            <form onSubmit={handleQuestionSubmit} className="vm-grid">
              <textarea
                className="vm-textarea"
                placeholder="Опишите симптомы, сроки и что уже предпринимали"
                value={questionDraft}
                onChange={(event) => {
                  setQuestionDraft(event.target.value)
                  setQuestionDraftError('')
                }}
                disabled={isQuestionSubmitting}
              />
              <div className="vm-question-card__footer">
                <span className="vm-helper">Вопрос станет виден в публичной ленте сразу после отправки.</span>
                <button className="vm-button" type="submit" disabled={isQuestionSubmitting}>
                  {isQuestionSubmitting ? 'Публикуем...' : 'Задать вопрос'}
                </button>
              </div>
            </form>
          </section>

          {isLoading ? (
            <section className="vm-card vm-empty-state">
              <h2>Загружаем вопросы</h2>
              <p>Получаем актуальную открытую ленту вопросов.</p>
            </section>
          ) : null}

          {!isLoading && errorMessage ? (
            <section className="vm-card vm-empty-state">
              <h2>Лента не загрузилась</h2>
              <p>{errorMessage}</p>
            </section>
          ) : null}

          {!isLoading && !errorMessage ? (
            <div className="vm-question-list">
              {filteredQuestions.map((question) => {
                const category = getQuestionCategory(question)
                const hasAnswers = question.comments.length > 0

                return (
                  <article className="vm-card vm-question-card" key={question.id}>
                    <div className="vm-question-card__row">
                      <div className="vm-inline-meta">
                        <span className="vm-overline">{category}</span>
                        <span className="vm-muted">{formatRelativeQuestionTime(question.created_at)}</span>
                      </div>
                      <span className={`vm-question-status ${hasAnswers ? 'is-success' : 'is-pending'}`}>
                        <span className="material-symbols-outlined">chat</span>
                        {hasAnswers ? `${question.comments.length} ответа` : 'Ожидает'}
                      </span>
                    </div>

                    <div>
                      <h2 className="vm-question-card__title">{summarizeQuestion(question.text, 72)}</h2>
                      <p className="vm-question-card__summary">{summarizeQuestion(question.text, 180)}</p>
                    </div>

                    <div className="vm-question-card__footer">
                      <div className="vm-inline-meta">
                        <div className="vm-avatar-stack" aria-hidden="true">
                          {(question.comments.length ? question.comments : [question.author]).slice(0, 3).map((item) => {
                            const person = item.author || item

                            return (
                              <span key={item.id || person.username}>
                                <ProfileImage alt="" src={person.avatar_url} />
                              </span>
                            )
                          })}
                        </div>
                        <span className="vm-muted">
                          {hasAnswers ? 'Врачи консультируют' : 'Специалисты изучают вопрос'}
                        </span>
                      </div>

                      <AppLink className="vm-button vm-button--ghost" href={buildQuestionHref(question.id)}>
                        {hasAnswers ? 'Читать подробнее' : 'Перейти к вопросу'}
                      </AppLink>
                    </div>

                    {auth.isReady && auth.hasRole('doctor') ? (
                      <form className="vm-grid" onSubmit={handleReplySubmit(question.id)}>
                        {replyMessages[question.id] ? (
                          <div className="vm-auth-message is-success">{replyMessages[question.id]}</div>
                        ) : null}
                        {replyErrors[question.id] ? (
                          <div className="vm-auth-message is-error">{replyErrors[question.id]}</div>
                        ) : null}
                        <textarea
                          className="vm-textarea"
                          placeholder="Ответить как врач"
                          value={replyDrafts[question.id] || ''}
                          onChange={(event) => setReplyDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                          disabled={replySubmittingId === question.id}
                        />
                        <div className="vm-question-card__footer">
                          <span className="vm-helper">Ответ доступен только верифицированным врачам.</span>
                          <button className="vm-button" type="submit" disabled={replySubmittingId === question.id}>
                            {replySubmittingId === question.id ? 'Отправляем...' : 'Ответить'}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                )
              })}

              {!filteredQuestions.length ? (
                <section className="vm-card vm-empty-state">
                  <h2>Подходящих вопросов не найдено</h2>
                  <p>Смените направление или попробуйте другой поисковый запрос.</p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </VirtualMedicPage>
  )
}

export default PublicQuestionsFeedPage
