import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { AppLink, useRouter } from './router'
import { routes } from './routes'
import { formatDateTime, getDisplayName, parsePositiveInteger } from './publicPageUtils'
import { VirtualMedicPage } from './VirtualMedicLayout'
import { getDoctorVisualProfile } from './virtualmedicReference'
import { ProfileImage } from './ProfileImage'

const profileTabs = [
  { key: 'about', label: 'О враче' },
  { key: 'reviews', label: 'Отзывы' },
  { key: 'consultations', label: 'Консультации' },
  { key: 'certificates', label: 'Сертификаты' },
]

const numberFormatter = new Intl.NumberFormat('ru-RU')

function StarRating({ rating, small = false }) {
  const roundedRating = Math.round(Number(rating) || 0)

  return (
    <span className={`vm-star-rating ${small ? 'vm-star-rating--small' : ''}`} aria-label={`Rating ${rating} of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span className={`material-symbols-outlined ${index < roundedRating ? 'is-filled' : ''}`} key={index}>
          star
        </span>
      ))}
      <strong>{rating}</strong>
    </span>
  )
}

function DoctorPublicProfilePage() {
  const { location } = useRouter()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const doctorId = parsePositiveInteger(searchParams.get('doctor_id'))

  const [doctor, setDoctor] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(doctorId))
  const [errorMessage, setErrorMessage] = useState('')
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || profileTabs[0].key)
  const [showAllReviews, setShowAllReviews] = useState(false)

  useEffect(() => {
    let isCancelled = false

    if (!doctorId) {
      setDoctor(null)
      setIsLoading(false)
      return undefined
    }

    const loadDoctor = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await apiClient.getDoctor(doctorId)

        if (!isCancelled) {
          setDoctor(response)
        }
      } catch (error) {
        if (!isCancelled) {
          setDoctor(null)
          setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить профиль врача')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadDoctor()

    return () => {
      isCancelled = true
    }
  }, [doctorId])

  const visualProfile = doctor ? getDoctorVisualProfile(doctor) : null
  const mainSpecialization = doctor?.specializations[0]?.name || 'Врач'
  const baseReviewCards = doctor
    ? [
        {
          author: 'Елена М.',
          rating: 5,
          text: `Очень внимательный врач. ${getDisplayName(doctor)} подробно объяснил рекомендации и дальнейшие шаги.`,
        },
        {
          author: 'Игорь П.',
          rating: 5,
          text: 'Консультация прошла структурированно, получил понятный план обследования и лечения.',
        },
        {
          author: 'Марина С.',
          rating: 4,
          text: 'Получила понятные рекомендации и список обследований, которые нужно подготовить перед очным приемом.',
        },
        {
          author: 'Алексей Р.',
          rating: 5,
          text: 'Врач внимательно разобрал симптомы, объяснил возможные причины и помог выбрать дальнейшую тактику.',
        },
      ]
    : []
  const reviewCards =
    doctor && visualProfile
      ? Array.from({ length: visualProfile.reviewsCount }, (_, index) => {
          const review = baseReviewCards[index % baseReviewCards.length]

          return {
            ...review,
            author: index < baseReviewCards.length ? review.author : `${review.author} ${index + 1}`,
          }
        })
      : []
  const visibleReviewCards = showAllReviews ? reviewCards : reviewCards.slice(0, 4)
  const tabBadges = visualProfile
    ? {
        reviews: visualProfile.reviewsCount,
        consultations: visualProfile.consultationsCount,
        certificates: visualProfile.certificatesCount,
      }
    : {}

  const renderTabContent = () => {
    if (!doctor || !visualProfile) {
      return null
    }

    if (activeTab === 'reviews') {
      return (
        <section className="vm-profile-tab-panel">
          <div className="vm-question-card__row">
            <h2>Отзывы пациентов</h2>
            <button className="vm-link vm-link-button" type="button" onClick={() => setShowAllReviews(true)}>
              {numberFormatter.format(visualProfile.reviewsCount)} {'\u043e\u0442\u0437\u044b\u0432\u043e\u0432'}
            </button>
          </div>

          <div className="vm-review-grid">
            {visibleReviewCards.map((review) => (
              <article className="vm-card vm-review-card" key={review.author}>
                <div className="vm-inline-meta">
                  <div className="vm-doctor-portrait vm-review-card__avatar">
                    {review.author.split(' ').map((part) => part[0]).join('')}
                  </div>
                  <div>
                    <strong>{review.author}</strong>
                    <div className="vm-muted">{formatDateTime(new Date().toISOString())}</div>
                  </div>
                  <StarRating rating={review.rating} small />
                </div>
                <p>{review.text}</p>
              </article>
            ))}
          </div>
        </section>
      )
    }

    if (activeTab === 'consultations') {
      return (
        <section className="vm-profile-tab-panel">
          <h2>Консультации</h2>
          <div className="vm-profile-info-grid">
            <div>
              <span className="vm-overline">Формат</span>
              <strong>Видео, аудио или чат</strong>
              <p className="vm-muted">Подходит для первичной консультации, разбора анализов и уточнения тактики лечения.</p>
            </div>
            <div>
              <span className="vm-overline">Ближайший слот</span>
              <strong>{visualProfile.eta}, 14:30 (мск)</strong>
              <p className="vm-muted">После записи пациент получает подтверждение и ссылку на онлайн-прием.</p>
            </div>
          </div>
        </section>
      )
    }

    if (activeTab === 'certificates') {
      return (
        <section className="vm-profile-tab-panel">
          <h2>Сертификаты</h2>
          <div className="vm-profile-certificate-list">
            <div>
              <span className="material-symbols-outlined">workspace_premium</span>
              <div>
                <strong>Действующий сертификат специалиста</strong>
                <p className="vm-muted">Подтвержден платформой при модерации профиля врача.</p>
              </div>
            </div>
            <div>
              <span className="material-symbols-outlined">verified_user</span>
              <div>
                <strong>Документы об образовании</strong>
                <p className="vm-muted">Проверено документов: {visualProfile.certificatesCount}.</p>
              </div>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="vm-profile-tab-panel">
        <h2>О враче</h2>
        <p>
          {mainSpecialization} помогает пациентам дистанционно: оценивает симптомы, разбирает результаты
          исследований, объясняет риски и формирует понятный план дальнейших действий.
        </p>

        <h2>Специализация в лечении пациентов</h2>
        <p>
          Консультации проходят по направлениям: {doctor.specializations.map((item) => item.name).join(', ') || 'общая медицина'}.
          Врач работает с повторными обращениями, подготовкой к очному приему и сопровождением после назначений.
        </p>

        <h2>Опыт и образование</h2>
        <div className="vm-timeline">
          <div className="vm-timeline-item">
            <span className="vm-overline">2018 — наст. время</span>
            <h3>Ведущий специалист онлайн-консультаций</h3>
            <p className="vm-muted">Практика по направлению {mainSpecialization.toLowerCase()}.</p>
          </div>
          <div className="vm-timeline-item">
            <span className="vm-overline">2013 — 2018</span>
            <h3>Врач амбулаторного приема</h3>
            <p className="vm-muted">Работа с хроническими пациентами и сопровождением после лечения.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <VirtualMedicPage activeNav="doctors">
      <section className="vm-page-section">
        <div className="vm-shell">
          <div className="vm-breadcrumbs">
            <span>Главная</span>
            <span>Кардиология</span>
            <span>{doctor ? getDisplayName(doctor) : 'Профиль врача'}</span>
          </div>

          {!doctorId ? (
            <section className="vm-card vm-empty-state">
              <h2>Врач не выбран</h2>
              <p>Вернитесь в каталог и откройте карточку нужного врача.</p>
              <AppLink className="vm-button" href={routes.doctors}>
                В каталог врачей
              </AppLink>
            </section>
          ) : null}

          {isLoading ? (
            <section className="vm-card vm-empty-state">
              <h2>Загружаем профиль врача</h2>
              <p>Подготавливаем карточку специалиста.</p>
            </section>
          ) : null}

          {!isLoading && errorMessage ? (
            <section className="vm-card vm-empty-state">
              <h2>Профиль не открылся</h2>
              <p>{errorMessage}</p>
              <AppLink className="vm-button" href={routes.doctors}>
                Назад к каталогу
              </AppLink>
            </section>
          ) : null}

          {doctor && visualProfile ? (
            <div className="vm-profile-modern">
              <section className="vm-card vm-modern-profile-hero">
                <div className="vm-modern-profile-photo">
                  <ProfileImage alt={getDisplayName(doctor)} src={doctor.avatar_url} />
                </div>

                <div className="vm-modern-profile-main">
                  <div className="vm-inline-meta">
                    <span className="vm-verified-strip">
                      <span className="material-symbols-outlined">verified</span>
                      Проверенный врач
                    </span>
                    <span className={doctor.is_online ? 'vm-online-chip' : 'vm-online-chip is-muted'}>
                      <span className="vm-online-dot" aria-hidden="true" />
                      {doctor.is_online ? 'Онлайн' : `Был(a): ${visualProfile.eta}`}
                    </span>
                  </div>
                  <h1 className="vm-profile-hero__title">{getDisplayName(doctor)}</h1>
                  <p className="vm-muted">
                    {doctor.specializations.map((item) => item.name).join(', ') || 'Врач'} · {visualProfile.qualification}
                  </p>
                  <dl className="vm-profile-facts-list">
                    <div>
                      <dt>{'\u0421\u0442\u0430\u0436'}</dt>
                      <dd>{parsePositiveInteger(visualProfile.experience.match(/\d+/)?.[0]) || 0} {'\u043b\u0435\u0442'}</dd>
                    </div>
                    <div>
                      <dt>{'\u0420\u0435\u0439\u0442\u0438\u043d\u0433'}</dt>
                      <dd><StarRating rating={visualProfile.rating} /></dd>
                    </div>
                    <div>
                      <dt>{'\u041e\u0442\u0437\u044b\u0432\u044b'}</dt>
                      <dd>{numberFormatter.format(visualProfile.reviewsCount)}</dd>
                    </div>
                  </dl>
                </div>

                <aside className="vm-modern-booking-card">
                  <div>
                    <span className="vm-overline">Стоимость консультации</span>
                    <strong>{visualProfile.price.toLocaleString('ru-RU')} ₽</strong>
                  </div>
                  <div className="vm-booking-note">
                    <span className="material-symbols-outlined">bolt</span>
                    Ближайший слот: {visualProfile.eta}, 14:30
                  </div>
                  <button className="vm-button" type="button" onClick={() => setActiveTab('consultations')}>
                    Записаться
                  </button>
                  <button className="vm-button vm-button--dark" type="button" onClick={() => setActiveTab('reviews')}>
                    Смотреть отзывы
                  </button>
                </aside>
              </section>

              <article className="vm-card vm-detail-card vm-modern-detail-card">
                <div className="vm-tabbar" role="tablist" aria-label="Разделы профиля врача">
                  {profileTabs.map((item) => (
                    <button
                      className={activeTab === item.key ? 'is-active' : ''}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === item.key}
                      key={item.key}
                      onClick={() => setActiveTab(item.key)}
                    >
                      <span>{item.label}</span>
                      {tabBadges[item.key] ? <strong>{numberFormatter.format(tabBadges[item.key])}</strong> : null}
                    </button>
                  ))}
                </div>

                {renderTabContent()}
              </article>
            </div>
          ) : null}
        </div>
      </section>
    </VirtualMedicPage>
  )
}

export default DoctorPublicProfilePage
