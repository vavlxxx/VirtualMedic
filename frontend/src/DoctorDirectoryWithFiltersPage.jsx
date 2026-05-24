import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiClient } from './api/client'
import { AppLink } from './router'
import { buildDoctorProfileHref, getDisplayName, parsePositiveInteger } from './publicPageUtils'
import { VirtualMedicPage } from './VirtualMedicLayout'
import { getDoctorVisualProfile } from './virtualmedicReference'
import { ProfileImage } from './ProfileImage'

const DOCTORS_FETCH_LIMIT = 100
const DOCTORS_PAGE_SIZE = 6
const PRICE_STEP = 250
const RATING_STEP = 0.1
const DEFAULT_RATING_RANGE = [0, 5]
const DEFAULT_PRICE_RANGE = [0, 10000]

function formatCurrency(value) {
  return `${value.toLocaleString('ru-RU')} ₽`
}

function formatRating(value) {
  return Number(value).toFixed(1)
}

function DoctorDirectoryWithFiltersPage() {
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('search') || '')
  const [draftSpecializationIds, setDraftSpecializationIds] = useState([])
  const [appliedSpecializationIds, setAppliedSpecializationIds] = useState([])
  const [draftMinimumExperience, setDraftMinimumExperience] = useState(0)
  const [appliedMinimumExperience, setAppliedMinimumExperience] = useState(0)
  const [draftRatingRange, setDraftRatingRange] = useState(DEFAULT_RATING_RANGE)
  const [appliedRatingRange, setAppliedRatingRange] = useState(DEFAULT_RATING_RANGE)
  const [draftPriceRange, setDraftPriceRange] = useState(DEFAULT_PRICE_RANGE)
  const [appliedPriceRange, setAppliedPriceRange] = useState(DEFAULT_PRICE_RANGE)
  const [draftOnlineOnly, setDraftOnlineOnly] = useState(false)
  const [appliedOnlineOnly, setAppliedOnlineOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const [specializations, setSpecializations] = useState([])
  const [doctors, setDoctors] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isCancelled = false

    const loadData = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const [specializationsResponse, doctorsResponse] = await Promise.all([
          apiClient.listSpecializations(),
          apiClient.listDoctors({ offset: 0, limit: DOCTORS_FETCH_LIMIT }),
        ])

        if (!isCancelled) {
          setSpecializations(specializationsResponse)
          setDoctors(doctorsResponse)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof ApiError ? error.message : 'Не удалось загрузить каталог врачей')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isCancelled = true
    }
  }, [])

  const enrichedDoctors = useMemo(
    () =>
      doctors.map((doctor) => ({
        ...doctor,
        visualProfile: getDoctorVisualProfile(doctor),
      })),
    [doctors],
  )

  const priceBounds = useMemo(() => {
    if (!enrichedDoctors.length) {
      return DEFAULT_PRICE_RANGE
    }

    const prices = enrichedDoctors.map((doctor) => doctor.visualProfile.price)
    return [Math.min(...prices), Math.max(...prices)]
  }, [enrichedDoctors])

  useEffect(() => {
    setDraftPriceRange(priceBounds)
    setAppliedPriceRange(priceBounds)
  }, [priceBounds])

  useEffect(() => {
    setCurrentPage(1)
  }, [
    appliedMinimumExperience,
    appliedOnlineOnly,
    appliedPriceRange,
    appliedRatingRange,
    appliedSpecializationIds,
    searchQuery,
  ])

  const selectedSpecializations = useMemo(
    () => specializations.filter((item) => appliedSpecializationIds.includes(item.id)),
    [appliedSpecializationIds, specializations],
  )

  const filteredDoctors = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return enrichedDoctors.filter((doctor) => {
      const specializationMatches =
        !appliedSpecializationIds.length ||
        doctor.specializations.some((item) => appliedSpecializationIds.includes(item.id))

      const searchMatches =
        !normalizedSearch ||
        getDisplayName(doctor).toLowerCase().includes(normalizedSearch) ||
        doctor.specializations.some((item) => item.name.toLowerCase().includes(normalizedSearch))

      const experienceValue = parsePositiveInteger(doctor.visualProfile.experience.match(/\d+/)?.[0]) || 0
      const doctorRating = Number(doctor.visualProfile.rating)
      const ratingMatches = doctorRating >= appliedRatingRange[0] && doctorRating <= appliedRatingRange[1]
      const experienceMatches = experienceValue >= appliedMinimumExperience
      const priceMatches =
        doctor.visualProfile.price >= appliedPriceRange[0] &&
        doctor.visualProfile.price <= appliedPriceRange[1]
      const onlineMatches = !appliedOnlineOnly || doctor.is_online

      return specializationMatches && searchMatches && ratingMatches && experienceMatches && priceMatches && onlineMatches
    })
  }, [
    appliedMinimumExperience,
    appliedOnlineOnly,
    appliedPriceRange,
    appliedRatingRange,
    appliedSpecializationIds,
    enrichedDoctors,
    searchQuery,
  ])

  const totalPages = Math.max(1, Math.ceil(filteredDoctors.length / DOCTORS_PAGE_SIZE))
  const visibleDoctors = filteredDoctors.slice(
    (currentPage - 1) * DOCTORS_PAGE_SIZE,
    currentPage * DOCTORS_PAGE_SIZE,
  )

  const updateRange = (setter) => (index, value) => {
    const numericValue = Number(value)

    setter((current) => {
      if (index === 0) {
        return [Math.min(numericValue, current[1]), current[1]]
      }

      return [current[0], Math.max(numericValue, current[0])]
    })
  }

  const updateDraftPriceRange = updateRange(setDraftPriceRange)
  const updateDraftRatingRange = updateRange(setDraftRatingRange)

  const toggleDraftSpecialization = (specializationId) => {
    setDraftSpecializationIds((current) =>
      current.includes(specializationId)
        ? current.filter((id) => id !== specializationId)
        : [...current, specializationId],
    )
  }

  const removeAppliedSpecialization = (specializationId) => {
    setAppliedSpecializationIds((current) => current.filter((id) => id !== specializationId))
    setDraftSpecializationIds((current) => current.filter((id) => id !== specializationId))
  }

  const applyFilters = () => {
    setAppliedSpecializationIds(draftSpecializationIds)
    setAppliedMinimumExperience(draftMinimumExperience)
    setAppliedRatingRange(draftRatingRange)
    setAppliedPriceRange(draftPriceRange)
    setAppliedOnlineOnly(draftOnlineOnly)
    setCurrentPage(1)
  }

  const resetFilters = () => {
    setDraftSpecializationIds([])
    setAppliedSpecializationIds([])
    setDraftMinimumExperience(0)
    setAppliedMinimumExperience(0)
    setDraftRatingRange(DEFAULT_RATING_RANGE)
    setAppliedRatingRange(DEFAULT_RATING_RANGE)
    setDraftPriceRange(priceBounds)
    setAppliedPriceRange(priceBounds)
    setDraftOnlineOnly(false)
    setAppliedOnlineOnly(false)
    setSearchQuery('')
    setCurrentPage(1)
  }

  return (
    <VirtualMedicPage activeNav="doctors">
      <section className="vm-page-section">
        <div className="vm-shell">
          <div className="vm-breadcrumbs">
            <span>Главная</span>
            <span>Каталог врачей</span>
          </div>

          <div className="vm-page-hero">
            <div>
              <h1>Специалисты онлайн</h1>
              <p>Найдите подходящего врача и перейдите в детальную карточку для консультации.</p>
            </div>
          </div>

          <div className="vm-active-filter-row" aria-label="Выбранные специальности">
            {!selectedSpecializations.length ? (
              <span className="vm-active-filter-row__empty">Поиск идёт по всем специальностям</span>
            ) : (
              selectedSpecializations.map((specialization) => (
                <button
                  className="vm-filter-token"
                  key={specialization.id}
                  type="button"
                  onClick={() => removeAppliedSpecialization(specialization.id)}
                >
                  {specialization.name}
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              ))
            )}
          </div>

          <div className="vm-grid vm-directory-layout">
            <aside className="vm-card vm-filter-panel">
              <div className="vm-filter-panel__header">
                <h2>Фильтры</h2>
                <button className="vm-button vm-button--ghost" type="button" onClick={resetFilters}>
                  Сбросить
                </button>
              </div>

              <div className="vm-field-stack">
                <div className="vm-field-block">
                  <span className="vm-field-label">
                    <span className="material-symbols-outlined">medical_services</span>
                    Специальность
                  </span>
                  <details className="vm-multiselect">
                    <summary>
                      {draftSpecializationIds.length
                        ? `Выбрано: ${draftSpecializationIds.length}`
                        : 'Все специальности'}
                      <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
                    </summary>
                    <div className="vm-multiselect__panel">
                      {specializations.map((specialization) => (
                        <label className="vm-multiselect__option" key={specialization.id}>
                          <input
                            type="checkbox"
                            checked={draftSpecializationIds.includes(specialization.id)}
                            onChange={() => toggleDraftSpecialization(specialization.id)}
                          />
                          <span>{specialization.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>

                <div className="vm-field-block">
                  <label className="vm-field-label">
                    <span className="material-symbols-outlined">radio_button_checked</span>
                    Сейчас на сайте
                  </label>
                  <label className="vm-checkbox">
                    <input
                      type="checkbox"
                      checked={draftOnlineOnly}
                      onChange={(event) => setDraftOnlineOnly(event.target.checked)}
                    />
                    Только врачи онлайн
                  </label>
                </div>

                <div className="vm-field-block">
                  <label className="vm-field-label">
                    <span className="material-symbols-outlined">workspace_premium</span>
                    Опыт работы
                  </label>
                  <select
                    className="vm-select"
                    value={draftMinimumExperience}
                    onChange={(event) => setDraftMinimumExperience(Number(event.target.value))}
                  >
                    <option value={0}>Любой стаж</option>
                    <option value={5}>Более 5 лет</option>
                    <option value={10}>Более 10 лет</option>
                    <option value={15}>Более 15 лет</option>
                  </select>
                </div>

                <div className="vm-field-block">
                  <label className="vm-field-label">
                    <span className="material-symbols-outlined">payments</span>
                    Стоимость приема
                  </label>
                  <div className="vm-range-filter">
                    <div className="vm-range-filter__values">
                      <span>{formatCurrency(draftPriceRange[0])}</span>
                      <span>{formatCurrency(draftPriceRange[1])}</span>
                    </div>
                    <div className="vm-range-filter__track">
                      <span
                        className="vm-range-filter__fill"
                        style={{
                          left: `${((draftPriceRange[0] - priceBounds[0]) / Math.max(priceBounds[1] - priceBounds[0], 1)) * 100}%`,
                          right: `${100 - ((draftPriceRange[1] - priceBounds[0]) / Math.max(priceBounds[1] - priceBounds[0], 1)) * 100}%`,
                        }}
                      />
                      <input
                        type="range"
                        min={priceBounds[0]}
                        max={priceBounds[1]}
                        step={PRICE_STEP}
                        value={draftPriceRange[0]}
                        onChange={(event) => updateDraftPriceRange(0, event.target.value)}
                      />
                      <input
                        type="range"
                        min={priceBounds[0]}
                        max={priceBounds[1]}
                        step={PRICE_STEP}
                        value={draftPriceRange[1]}
                        onChange={(event) => updateDraftPriceRange(1, event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="vm-field-block">
                  <label className="vm-field-label">
                    <span className="material-symbols-outlined">star</span>
                    Рейтинг
                  </label>
                  <div className="vm-range-filter">
                    <div className="vm-range-filter__values">
                      <span>{formatRating(draftRatingRange[0])}</span>
                      <span>{formatRating(draftRatingRange[1])}</span>
                    </div>
                    <div className="vm-range-filter__track">
                      <span
                        className="vm-range-filter__fill"
                        style={{
                          left: `${(draftRatingRange[0] / 5) * 100}%`,
                          right: `${100 - (draftRatingRange[1] / 5) * 100}%`,
                        }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step={RATING_STEP}
                        value={draftRatingRange[0]}
                        onChange={(event) => updateDraftRatingRange(0, event.target.value)}
                      />
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step={RATING_STEP}
                        value={draftRatingRange[1]}
                        onChange={(event) => updateDraftRatingRange(1, event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button className="vm-button" type="button" onClick={applyFilters}>
                  Применить
                </button>
              </div>
            </aside>

            <div>
              {isLoading ? (
                <section className="vm-card vm-empty-state">
                  <h2>Загружаем каталог</h2>
                  <p>Подтягиваем список врачей и справочник специализаций.</p>
                </section>
              ) : null}

              {!isLoading && errorMessage ? (
                <section className="vm-card vm-empty-state">
                  <h2>Каталог не загрузился</h2>
                  <p>{errorMessage}</p>
                </section>
              ) : null}

              {!isLoading && !errorMessage ? (
                <>
                  <div className="vm-results-grid">
                    {visibleDoctors.map((doctor) => (
                      <article className="vm-card vm-doctor-card" key={doctor.id}>
                        <div className="vm-doctor-card__visual">
                          <ProfileImage
                            className="vm-doctor-card__photo"
                            alt={getDisplayName(doctor)}
                            src={doctor.avatar_url}
                          />
                          <span className="vm-rating-badge">
                            <span className="material-symbols-outlined">star</span>
                            {doctor.visualProfile.rating}
                          </span>
                          {doctor.is_online ? (
                            <span className="vm-online-badge">
                              <span className="vm-online-dot" aria-hidden="true" />
                              Сейчас на сайте
                            </span>
                          ) : null}
                        </div>

                        <div className="vm-doctor-card__body">
                          <div>
                            <div className="vm-overline">
                              {doctor.specializations[0]?.name || 'Специалист'}
                            </div>
                            <h2 className="vm-doctor-card__title">{getDisplayName(doctor)}</h2>
                            <p className="vm-muted">
                              {doctor.visualProfile.experience} · {doctor.visualProfile.qualification}
                            </p>
                          </div>

                          <div className="vm-price-row">
                            <div>
                              <span className="vm-overline">Прием от</span>
                              <strong className="vm-price-nowrap">
                                {formatCurrency(doctor.visualProfile.price)}
                              </strong>
                            </div>
                            <AppLink className="vm-button vm-button--soft" href={buildDoctorProfileHref(doctor.id)}>
                              Записаться
                            </AppLink>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  {!filteredDoctors.length ? (
                    <section className="vm-card vm-empty-state" style={{ marginTop: '22px' }}>
                      <h2>Ничего не найдено</h2>
                      <p>Измените фильтры или попробуйте другой поисковый запрос.</p>
                    </section>
                  ) : null}

                  {filteredDoctors.length > 0 && totalPages > 1 ? (
                    <div className="vm-pagination">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      >
                        ‹
                      </button>
                      {Array.from({ length: totalPages }).map((_, index) => {
                        const page = index + 1

                        return (
                          <button
                            className={currentPage === page ? 'is-active' : ''}
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </VirtualMedicPage>
  )
}

export default DoctorDirectoryWithFiltersPage
