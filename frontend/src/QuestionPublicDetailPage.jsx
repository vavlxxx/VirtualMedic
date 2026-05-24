import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { AppLink, useRouter } from './router'
import { routes } from './routes'
import { buildDoctorProfileHref, formatDateTime, getDisplayName, parsePositiveInteger } from './publicPageUtils'
import { VirtualMedicPage } from './VirtualMedicLayout'
import { ProfileImage } from './ProfileImage'
import {
  formatRelativeQuestionTime,
  getDoctorVisualProfile,
  getQuestionCategory,
  getQuestionPatientMeta,
} from './virtualmedicReference'

function QuestionPublicDetailPage() {
  const auth = useAuth()
  const { location } = useRouter()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const questionId = parsePositiveInteger(searchParams.get('question_id'))

  const [question, setQuestion] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(questionId))
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isCancelled = false

    if (!questionId) {
      setQuestion(null)
      setIsLoading(false)
      setErrorMessage('')
      return undefined
    }

    const loadQuestion = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await apiClient.getQuestion(questionId)

        if (!isCancelled) {
          setQuestion(response)
        }
      } catch (error) {
        if (!isCancelled) {
          setQuestion(null)
          setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить вопрос')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadQuestion()

    return () => {
      isCancelled = true
    }
  }, [questionId])

  const category = question ? getQuestionCategory(question) : ''
  const patientMeta = question ? getQuestionPatientMeta(question) : null

  return (
    <VirtualMedicPage activeNav="questions">
      <section className="vm-page-section">
        <div className="vm-shell">
          <div className="vm-breadcrumbs">
            <span>Главная</span>
            <span>Вопросы</span>
            <span>Вопрос #{questionId || '...'}</span>
          </div>

          {!questionId ? (
            <section className="vm-card vm-empty-state">
              <h2>Вопрос не выбран</h2>
              <p>Откройте ленту открытых вопросов и перейдите в конкретное обсуждение.</p>
              <AppLink className="vm-button" href={routes.questions}>
                К ленте вопросов
              </AppLink>
            </section>
          ) : null}

          {isLoading ? (
            <section className="vm-card vm-empty-state">
              <h2>Загружаем обсуждение</h2>
              <p>Получаем вопрос и ответы специалистов из backend.</p>
            </section>
          ) : null}

          {!isLoading && errorMessage ? (
            <section className="vm-card vm-empty-state">
              <h2>Не удалось открыть вопрос</h2>
              <p>{errorMessage}</p>
              <AppLink className="vm-button" href={routes.questions}>
                Вернуться в ленту
              </AppLink>
            </section>
          ) : null}

          {question ? (
            <div className="vm-question-detail-layout">
              <article className="vm-card vm-question-card">
                <div className="vm-inline-meta">
                  <span className="vm-overline">Вопрос пациента</span>
                  <span className="vm-muted">{formatRelativeQuestionTime(question.created_at)}</span>
                </div>

                <h1 className="vm-question-card__title">{question.text}</h1>

                <div className="vm-question-detail-meta">
                  <span>{getDisplayName(question.author)}</span>
                  <span>{patientMeta.age} года</span>
                  <span>{patientMeta.city}</span>
                  <span>{category}</span>
                </div>



                <div className="vm-card vm-detail-card">
                  {/* <h2>Контекст обращения</h2>
                  <p>
                    Если у пациента есть результаты обследований или назначения, врач может учесть
                    их при очной консультации. На странице вопроса отображается основное описание
                    ситуации и ответы специалистов.
                  </p> */}

                  <p>{question.text}</p>
                </div>
              </article>

              <section className="vm-response-list">
                <div className="vm-question-card__row">
                  <h2>Ответы специалистов ({question.comments.length})</h2>
                  <span className="vm-muted">Обновлено {formatDateTime(question.created_at)}</span>
                </div>

                {question.comments.length ? (
                  question.comments.map((comment) => {
                    const visualProfile = getDoctorVisualProfile(comment.author)

                    return (
                      <article className="vm-card vm-response-card" key={comment.id}>
                        <div className="vm-response-card__head">
                          <div
                            className="vm-doctor-portrait vm-response-card__avatar"
                            style={{ background: visualProfile.theme.background }}
                            aria-hidden="true"
                          >
                            <ProfileImage
                              className="vm-doctor-avatar-img"
                              alt={getDisplayName(comment.author)}
                              src={comment.author?.avatar_url}
                            />
                          </div>

                          <div>
                            <h3>{getDisplayName(comment.author)}</h3>
                            <div className="vm-inline-meta">
                              <span className="vm-muted">{category}</span>
                              <span className="vm-muted">{visualProfile.experience}</span>
                              <span className="vm-rating-badge">
                                <span className="material-symbols-outlined">star</span>
                                {visualProfile.rating}
                              </span>
                            </div>
                          </div>

                          <span className="vm-verified-strip">Доступен онлайн</span>
                        </div>

                        <p>{comment.text}</p>

                        <ul className="vm-recommendations">
                          <li>Записать ключевые симптомы и время их появления.</li>
                          <li>Подготовить предыдущие обследования перед консультацией.</li>
                          <li>При ухудшении состояния обратиться за очной помощью.</li>
                        </ul>

                        <div className="vm-response-card__footer">
                          <span className="vm-muted">Ответ опубликован {formatDateTime(comment.created_at)}</span>
                          <AppLink
                            className="vm-button vm-button--dark"
                            href={`${buildDoctorProfileHref(comment.author.id)}&tab=consultations`}
                          >
                            {auth.isAuthenticated ? 'Открыть консультацию' : 'Профиль врача'}
                          </AppLink>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <section className="vm-card vm-empty-state">
                    <h2>Ответов пока нет</h2>
                    <p>Вопрос опубликован и ожидает комментариев верифицированных врачей.</p>
                  </section>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </VirtualMedicPage>
  )
}

export default QuestionPublicDetailPage
