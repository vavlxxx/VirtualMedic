import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { AppLink } from './router'
import { routes, withReturnTo } from './routes'
import { buildQuestionHref, trimMultilineText } from './publicPageUtils'
import { AskDoctorWizardModal } from './AskDoctorWizardModal'
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

function PublicQuestionsFeedPage() {
  const auth = useAuth()
  const currentPageHref = routes.questions
  const replySubmitLocksRef = useRef(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Все направления')
  const [questions, setQuestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isWizardOpen, setIsWizardOpen] = useState(false)

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

  const categoryToSpecializationLabel = {
    Терапия: 'Терапия',
    Педиатрия: 'Педиатрия',
    Дерматология: 'Дерматология',
    Неврология: 'Неврология',
    Гастроэнтерология: 'Гастроэнтерология',
    Кардиология: 'Кардиология',
  }

  const preferredSpecializationLabel = categoryToSpecializationLabel[selectedCategory] || ''

  return (
    <VirtualMedicPage
      activeNav="questions"
      actionLabel={auth.isAuthenticated ? 'Личный кабинет' : 'Войти'}
      actionHref={auth.isAuthenticated ? routes.account : withReturnTo(routes.login, currentPageHref)}
      searchPlaceholder="Поиск вопросов..."
      searchValue={searchQuery}
      onSearchChange={(event) => setSearchQuery(event.target.value)}
    >
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

          <section className="vm-card vm-question-launch-card">
            <div className="vm-question-launch-card__content">
              <div>
                <div className="vm-overline">Новый вопрос</div>
                <h2>Спросить врача</h2>
                <p className="vm-muted">Откроется пошаговая форма с выбором специализации и дальнейшими шагами.</p>
              </div>
              <button className="vm-button" type="button" onClick={() => setIsWizardOpen(true)}>
                Задать вопрос
              </button>
            </div>
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

        <button
          className="vm-floating-ask-button"
          onClick={() => setIsWizardOpen(true)}
          type="button"
        >
          <span className="material-symbols-outlined">chat</span>
          Спросить врача
        </button>

        <AskDoctorWizardModal
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          preferredSpecializationLabel={preferredSpecializationLabel}
          onQuestionCreated={() => setIsWizardOpen(false)}
        />
      </section>
    </VirtualMedicPage>
  )
}

export default PublicQuestionsFeedPage
