import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { apiClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { fetchMockTestimonials } from './mocks/testimonials'
import {
  buildDoctorProfileHref,
  buildQuestionHref,
  getDisplayName,
} from './publicPageUtils'
import { AppLink, useRouter } from './router'
import { getDefaultAuthenticatedPath, routes } from './routes'
import {
  formatRelativeQuestionTime,
  getDoctorVisualProfile,
  getQuestionCategory,
  summarizeQuestion,
} from './virtualmedicReference'
import { VirtualMedicFooter, VirtualMedicHeader } from './VirtualMedicLayout'
import { ProfileImage } from './ProfileImage'
import './App.css'

const specialties = [
  { icon: 'stethoscope', name: 'Терапевт' },
  { icon: 'child_care', name: 'Педиатр' },
  { icon: 'favorite', name: 'Кардиолог' },
  { icon: 'psychology', name: 'Невролог' },
  { icon: 'spa', name: 'Дерматолог' },
  { icon: 'groups', name: 'Психолог' },
]

const doctorAvatars = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDyTnpTESvu3uRVqoPZWnsbus0-8BTM7nmkbJ-JoBgcVU9NBLT1Qi0op55n2dEtTdwW4j_CkdKQIDYwlKqDAyzrg49-naQ5IlfNSCPyIGaPHwSQGU-t0MrWf4KTaYEjmsSLOffsD9BecAuwxvIrk4AHngQ9x_zuCkW6zbkiE02Nx1ajbr8NAhJ73Fs0MZdr2gjnc8WI7jDwQ6nL7kss7QipDJgGf9Nakm2XSK1ntQj1a43fE6tUHOIiYuAm76v3cGpCNm98iKaiwnEQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBIpqQ2zc39wEasO3Q4MJoyn4ykFIigI2L-pKKLuXNuwqMPG2PPRPfyYywN9TMrbbefM7Wal7QBtglwMOKNYH3VcsxYtADNWO0mVEtPdd_-wKMxRlQx4T1KlQfNSOvHF22G1gKdPdDzC9XA-NrT6sZcJ1YhTWIx0O-1JgrLJq0inxJbanRJShvZdE1nNGF1K1fjWeI5_Xj01BNiZDFJ0HQegelE6IU6vHlppTOH8I4lSNXKZPhgPns1J6cubeOTWql7b68BZfbeewVQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBgIjv7GLOCFLsrAeQBGYkhV6pIsDcyq51Suut0Dy6ih5COIlIYrKTbuiElHOJP6ZZ_7i0Bg5t3QWYYEM4RxIpnmQiqrp4Oh6ukPo1HAseRuwdozo-6-s8Vz2_m5ULPdeiVUvE596k4xw1e0LkUOylKr7gEdRLaRxIfFQFVCaEwcGNjKLHnvZz5l5xO6zTLOjHWTdOr0_OFns-RjpJQSQ_Z5cVONeurcDc0n0xmg22thODZmqv52xGbYLUed59idsBDktyWolVl6ZQr',
]

const heroImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuASLCrcwMhbPf6PI9C7bCG4ODG2Y903cswwwuV7vK5Cj5m4m9sihcKUCVh-r_p1RI4f9Oe9um9w1gNPQ_CcY8dW9EU2pqYZb6s_tgGDFLhW_sLyaSJLkOmxdbzFpDmKip0wD4bXVkeixcJovKxX7rGkRrYMPepl98gR6NTkU0aFHBED0LvFZax_gAjtDidHzXL78lqKxM_bpq0QIVPEX8S099IbcRqwyknD9SFXNtITh5AWg8TOI503H0NbdjcWWXAhPlSU5crnOENK'

const symptomExamples = [
  'насморк',
  'кашель',
  'боль в горле',
  'головная боль',
  'температура',
  'боль в животе',
]

const LIVE_FEED_QUESTIONS_LIMIT = 8
const LIVE_FEED_DOCTORS_LIMIT = 8
const LIVE_FEED_POLL_INTERVAL_MS = 12_000

function getAnswersLabel(commentsCount) {
  if (commentsCount === 1) {
    return '1 ответ'
  }

  const moduloTen = commentsCount % 10
  const moduloHundred = commentsCount % 100

  if (moduloTen >= 2 && moduloTen <= 4 && (moduloHundred < 12 || moduloHundred > 14)) {
    return `${commentsCount} ответа`
  }

  return `${commentsCount} ответов`
}

function App() {
  const auth = useAuth()
  const { navigate } = useRouter()
  const rootRef = useRef(null)
  const heroVisualRef = useRef(null)
  const mobileTestimonialsTrackRef = useRef(null)
  const [typedSymptom, setTypedSymptom] = useState('')
  const [heroSearchQuery, setHeroSearchQuery] = useState('')
  const [showTypeCursor, setShowTypeCursor] = useState(true)
  const [testimonials, setTestimonials] = useState([])
  const [isTestimonialsLoading, setIsTestimonialsLoading] = useState(true)
  const [activeMobileTestimonial, setActiveMobileTestimonial] = useState(0)
  const [liveQuestions, setLiveQuestions] = useState([])
  const [onlineDoctors, setOnlineDoctors] = useState([])
  const [isLiveFeedLoading, setIsLiveFeedLoading] = useState(true)
  const [liveFeedError, setLiveFeedError] = useState('')
  const [liveFeedUpdatedAt, setLiveFeedUpdatedAt] = useState(null)

  const animatedPlaceholder = `Например: ${typedSymptom}${showTypeCursor ? '|' : ' '}`
  const mobileTestimonialsCount = isTestimonialsLoading ? 3 : testimonials.length
  const dashboardHref = auth.isAuthenticated
    ? getDefaultAuthenticatedPath(auth.user)
    : routes.register
  const totalAnswers = liveQuestions.reduce((total, question) => total + question.comments.length, 0)
  const platformStats = [
    { value: onlineDoctors.length, label: 'врачей онлайн' },
    { value: liveQuestions.length, label: 'открытых вопросов' },
    { value: totalAnswers, label: 'ответов врачей' },
    { value: specialties.length, label: 'направлений' },
  ]

  const handleHeroSearchSubmit = (event) => {
    event.preventDefault()

    const query = heroSearchQuery.trim()
    navigate(query ? `${routes.questions}?search=${encodeURIComponent(query)}` : routes.questions)
  }

  const goToMobileTestimonial = (index) => {
    if (!mobileTestimonialsCount) {
      return
    }

    const clampedIndex = Math.max(0, Math.min(index, mobileTestimonialsCount - 1))
    const track = mobileTestimonialsTrackRef.current

    setActiveMobileTestimonial(clampedIndex)

    if (track) {
      track.scrollTo({
        left: track.clientWidth * clampedIndex,
        behavior: 'smooth',
      })
    }
  }

  const handleMobileTestimonialsScroll = () => {
    const track = mobileTestimonialsTrackRef.current

    if (!track || track.clientWidth === 0) {
      return
    }

    const nextIndex = Math.max(
      0,
      Math.min(
        Math.round(track.scrollLeft / track.clientWidth),
        Math.max(mobileTestimonialsCount - 1, 0),
      ),
    )
    setActiveMobileTestimonial(nextIndex)
  }

  useEffect(() => {
    let exampleIndex = 0
    let charIndex = 0
    let isDeleting = false
    let timerId

    const step = () => {
      const currentExample = symptomExamples[exampleIndex]

      if (!isDeleting) {
        charIndex += 1
        setTypedSymptom(currentExample.slice(0, charIndex))

        if (charIndex >= currentExample.length) {
          isDeleting = true
          timerId = setTimeout(step, 1300)
          return
        }

        timerId = setTimeout(step, 85)
        return
      }

      charIndex -= 1
      setTypedSymptom(currentExample.slice(0, Math.max(charIndex, 0)))

      if (charIndex <= 0) {
        isDeleting = false
        exampleIndex = (exampleIndex + 1) % symptomExamples.length
        timerId = setTimeout(step, 260)
        return
      }

      timerId = setTimeout(step, 45)
    }

    timerId = setTimeout(step, 500)

    return () => clearTimeout(timerId)
  }, [])

  useEffect(() => {
    const cursorTimer = setInterval(() => {
      setShowTypeCursor((prevState) => !prevState)
    }, 460)

    return () => clearInterval(cursorTimer)
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadTestimonials = async () => {
      setIsTestimonialsLoading(true)

      try {
        const data = await fetchMockTestimonials()

        if (!isCancelled) {
          setTestimonials(data)
        }
      } finally {
        if (!isCancelled) {
          setIsTestimonialsLoading(false)
        }
      }
    }

    loadTestimonials()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadLiveFeed = async ({ silent = false } = {}) => {
      if (!silent) {
        setIsLiveFeedLoading(true)
      }

      try {
        const [questionsResponse, doctorsResponse] = await Promise.all([
          apiClient.listQuestions({
            offset: 0,
            limit: LIVE_FEED_QUESTIONS_LIMIT,
          }),
          apiClient.listDoctors({
            offset: 0,
            limit: LIVE_FEED_DOCTORS_LIMIT,
            online_only: true,
          }),
        ])

        if (!isCancelled) {
          setLiveQuestions(questionsResponse)
          setOnlineDoctors(doctorsResponse.filter((doctor) => doctor.is_online))
          setLiveFeedError('')
          setLiveFeedUpdatedAt(new Date())
        }
      } catch {
        if (!isCancelled) {
          setLiveFeedError('Не удалось обновить live-ленту. Повторим автоматически.')
        }
      } finally {
        if (!isCancelled && !silent) {
          setIsLiveFeedLoading(false)
        }
      }
    }

    loadLiveFeed()
    const intervalId = window.setInterval(() => {
      loadLiveFeed({ silent: true })
    }, LIVE_FEED_POLL_INTERVAL_MS)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!mobileTestimonialsCount) {
      setActiveMobileTestimonial(0)
      return
    }

    setActiveMobileTestimonial((current) =>
      Math.max(0, Math.min(current, mobileTestimonialsCount - 1)),
    )
  }, [mobileTestimonialsCount])

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }

    let teardownParallax = () => {}

    const context = gsap.context(() => {
      gsap.from('.js-hero-reveal', {
        y: 28,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.08,
      })

      gsap.utils.toArray('.js-reveal-section').forEach((section) => {
        gsap.from(section, {
          y: 48,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 82%',
            once: true,
          },
        })
      })

      gsap.from('.js-stats-item', {
        scale: 0.92,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'back.out(1.2)',
        scrollTrigger: {
          trigger: '.js-stats-grid',
          start: 'top 82%',
          once: true,
        },
      })

      gsap.from('.js-specialty-item', {
        y: 24,
        opacity: 0,
        duration: 0.65,
        stagger: 0.06,
        ease: 'power2.out',
        immediateRender: false,
        scrollTrigger: {
          trigger: '.js-specialties-grid',
          start: 'top 82%',
          once: true,
        },
      })

      gsap.from('.js-testimonial-item', {
        x: 34,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.js-testimonials-section',
          start: 'top 84%',
          once: true,
        },
      })

      const card = heroVisualRef.current
      const canUseParallax = window.matchMedia(
        '(hover: hover) and (pointer: fine)',
      ).matches

      if (card && canUseParallax) {
        const moveCardX = gsap.quickTo(card, 'x', {
          duration: 0.45,
          ease: 'power3.out',
        })
        const moveCardY = gsap.quickTo(card, 'y', {
          duration: 0.45,
          ease: 'power3.out',
        })

        const handlePointerMove = (event) => {
          const xRatio = event.clientX / window.innerWidth - 0.5
          const yRatio = event.clientY / window.innerHeight - 0.5

          moveCardX(xRatio * 8)
          moveCardY(yRatio * 8)
        }

        const handlePointerLeave = () => {
          moveCardX(0)
          moveCardY(0)
        }

        window.addEventListener('pointermove', handlePointerMove, {
          passive: true,
        })
        document.addEventListener('mouseleave', handlePointerLeave)
        window.addEventListener('blur', handlePointerLeave)

        teardownParallax = () => {
          window.removeEventListener('pointermove', handlePointerMove)
          document.removeEventListener('mouseleave', handlePointerLeave)
          window.removeEventListener('blur', handlePointerLeave)
        }
      }
    }, rootRef)

    return () => {
      teardownParallax()
      context.revert()
    }
  }, [])

  return (
    <div ref={rootRef} className="app-shell bg-background-light text-slate-900">
      <VirtualMedicHeader active="home" />

      <main>
        <section
          className="hero-section relative scroll-mt-20 overflow-hidden px-4 pt-6 pb-8 sm:px-6 sm:pt-10 sm:pb-14 md:pt-12 md:pb-20 lg:px-8 xl:pt-14"
          id="hero"
        >
          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 xl:grid-cols-2 xl:gap-12">
            <div className="relative z-10 flex flex-col gap-5 sm:gap-6 md:gap-8">
              <div className="js-hero-reveal inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-emerald/20 bg-accent-emerald/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-accent-emerald uppercase sm:px-4 sm:py-1.5 sm:text-sm sm:normal-case sm:tracking-normal sm:font-semibold">
                <span className="material-symbols-outlined text-sm sm:text-base">
                  verified_user
                </span>
                <span className="sm:hidden">Гос. лицензия</span>
                <span className="hidden sm:inline">Государственная лицензия</span>
              </div>

              <h2 className="js-hero-reveal hero-title text-[26px] leading-[1.2] font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl lg:text-6xl 2xl:text-7xl">
                Забота о вашем <br className="sm:hidden" /> здоровье в{' '}
                <span className="text-primary">один клик</span>
              </h2>

              <p className="js-hero-reveal hidden max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl md:block">
                Профессиональные медицинские консультации с врачами ведущих
                клиник. Быстро, анонимно и официально.
              </p>

              <form className="js-hero-reveal flex max-w-xl flex-col gap-3 sm:gap-4" onSubmit={handleHeroSearchSubmit}>
                <div className="group relative">
                  <span className="material-symbols-outlined absolute top-1/2 left-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary">
                    search
                  </span>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pr-4 pl-11 text-sm shadow-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:rounded-2xl sm:py-4 sm:pl-12 sm:text-base"
                    placeholder={animatedPlaceholder}
                    type="text"
                    value={heroSearchQuery}
                    onChange={(event) => setHeroSearchQuery(event.target.value)}
                  />
                </div>

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-[#142e70] sm:rounded-2xl sm:px-8 sm:py-4 sm:text-lg sm:shadow-xl sm:shadow-primary/30 sm:hover:scale-[1.02]"
                  type="submit"
                >
                  <span>{heroSearchQuery.trim() ? 'Найти похожие вопросы' : 'Задать вопрос'}</span>
                  <span className="material-symbols-outlined text-lg sm:text-xl">
                    chat_bubble
                  </span>
                </button>
              </form>

              <div className="js-hero-reveal mt-1 hidden items-center gap-4 md:flex">
                <div className="flex -space-x-3">
                  {doctorAvatars.map((avatar, index) => (
                    <img
                      key={avatar}
                      alt={`Doctor ${index + 1}`}
                      className="h-12 w-12 rounded-full border-4 border-white object-cover"
                      src={avatar}
                    />
                  ))}
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-accent-emerald">
                    <span className="material-symbols-outlined fill-1 text-sm">
                      star
                    </span>
                    <span className="font-bold">4.9/5</span>
                  </div>
                  <p className="font-medium text-slate-500">
                    {totalAnswers ? `${totalAnswers} ответов врачей в ленте` : 'специалисты отвечают в открытой ленте'}
                  </p>
                </div>
              </div>
            </div>

            <div
              ref={heroVisualRef}
              className="hero-visual js-hero-reveal js-hero-parallax-card relative mx-auto w-full max-w-[560px] xl:max-w-none"
            >
              <div className="absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-emerald/10 blur-3xl md:-top-20 md:-right-20 md:h-80 md:w-80 md:translate-x-0 md:translate-y-0 md:bg-accent-emerald/10 md:blur-[100px]" />
              <div className="absolute -bottom-20 -left-20 hidden h-80 w-80 rounded-full bg-primary/10 blur-[100px] md:block" />

              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-lg md:aspect-[5/6] md:rounded-[2.5rem] md:border-8 md:shadow-2xl xl:aspect-[4/5]">
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url('${heroImage}')` }}
                />

                <div className="absolute top-3 left-3 rounded-lg border border-white/20 bg-white/90 px-2.5 py-1 shadow-sm backdrop-blur-md sm:top-4 sm:left-4 sm:px-4 sm:py-2 md:top-6 md:left-6 md:rounded-2xl md:px-4 md:py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-emerald sm:h-2 sm:w-2 md:h-3 md:w-3" />
                    <span className="text-[9px] font-bold tracking-wide text-slate-800 uppercase sm:text-xs sm:normal-case sm:tracking-normal md:text-sm">
                      Врачи онлайн
                    </span>
                  </div>
                </div>

                <div className="absolute right-4 bottom-4 left-4 hidden items-center justify-between rounded-2xl bg-primary/95 p-5 text-white backdrop-blur-md sm:right-6 sm:bottom-6 sm:left-6 sm:p-6 md:flex">
                  <div>
                    <p className="text-xs font-medium tracking-widest uppercase opacity-80">
                      Ближайшее окно
                    </p>
                    <p className="text-xl font-bold">Сегодня, 14:30</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                    <span className="material-symbols-outlined">videocam</span>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-center gap-3 md:hidden">
                <div className="flex -space-x-2">
                  {doctorAvatars.map((avatar, index) => (
                    <img
                      key={`${avatar}-mobile`}
                      alt={`Doctor ${index + 1}`}
                      className="h-7 w-7 rounded-full border-2 border-white object-cover"
                      src={avatar}
                    />
                  ))}
                </div>
                <div className="text-[11px]">
                  <div className="flex items-center gap-1 text-accent-emerald">
                    <span className="material-symbols-outlined fill-1 text-[12px]">
                      star
                    </span>
                    <span className="font-bold">4.9/5</span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-500">
                    {totalAnswers ? `${totalAnswers} ответов` : 'открытая лента'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="js-reveal-section px-4 pb-10 sm:px-6 sm:py-10 lg:px-8">
          <div className="js-stats-grid relative mx-auto grid w-full max-w-7xl grid-cols-2 gap-y-6 gap-x-4 overflow-hidden rounded-2xl bg-primary p-5 text-white shadow-xl shadow-primary/20 sm:rounded-[2.5rem] sm:p-8 md:grid-cols-4 md:gap-10 lg:p-12 xl:p-16">
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/5 blur-2xl sm:-top-32 sm:-right-32 sm:h-64 sm:w-64 sm:blur-none" />
            {platformStats.map((stat) => (
              <div
                key={stat.label}
                className="js-stats-item flex flex-col items-center gap-0.5 text-center md:gap-2"
              >
                <span className="text-2xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                  {stat.value}
                </span>
                <span className="text-[10px] leading-none font-semibold tracking-widest text-white/70 uppercase sm:text-xs md:text-sm">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="js-reveal-section scroll-mt-20 bg-slate-50 px-4 py-8 sm:bg-transparent sm:px-6 sm:py-16 lg:px-8 xl:py-24"
          id="specialties"
        >
          <div className="mx-auto w-full max-w-7xl">
            <div className="mb-6 flex flex-col items-end justify-between gap-4 sm:mb-12 sm:gap-6 md:mb-16 md:flex-row">
              <div className="max-w-xl">
                <h3 className="mb-1 text-xl font-extrabold tracking-tight text-slate-900 sm:mb-4 sm:text-3xl lg:text-4xl">
                  Популярные направления
                </h3>
                <p className="text-xs text-slate-500 sm:text-base lg:text-lg">
                  Квалифицированная помощь по более чем 25 медицинским
                  специальностям круглосуточно.
                </p>
              </div>
              <AppLink
                className="hidden items-center gap-2 font-bold text-primary transition-all hover:gap-4 md:flex"
                href={routes.doctors}
              >
                Все направления{' '}
                <span className="material-symbols-outlined">arrow_forward</span>
              </AppLink>
            </div>

            <div className="js-specialties-grid grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {specialties.map((item, index) => (
                <AppLink
                  key={item.name}
                  className={`js-specialty-item group cursor-pointer rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 sm:rounded-[2rem] sm:p-6 lg:p-7 xl:p-8 ${index > 3 ? 'hidden md:block' : ''}`}
                  href={`${routes.doctors}?search=${encodeURIComponent(item.name)}`}
                >
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-primary transition-all group-hover:bg-primary group-hover:text-white sm:mb-6 sm:h-16 sm:w-16 sm:rounded-2xl">
                    <span className="material-symbols-outlined text-2xl sm:text-3xl">
                      {item.icon}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 sm:text-base">
                    {item.name}
                  </h4>
                </AppLink>
              ))}
            </div>

            <AppLink
              className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white py-3 text-sm font-bold text-primary shadow-sm md:hidden"
              href={routes.doctors}
            >
              Все направления{' '}
              <span className="material-symbols-outlined text-base">
                arrow_forward
              </span>
            </AppLink>
          </div>
        </section>

        <section className="js-reveal-section px-4 py-8 sm:px-6 sm:py-16 lg:px-8 xl:py-24">
          <div className="mx-auto w-full max-w-7xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
              <div>
                <h3 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
                  Лента консультаций в реальном времени
                </h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">
                  Новые вопросы и онлайн-врачи появляются автоматически, без перезагрузки страницы.
                </p>
              </div>
              <span className="vm-live-timestamp text-xs font-semibold text-slate-500">
                {liveFeedUpdatedAt
                  ? `Обновлено в ${new Intl.DateTimeFormat('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(liveFeedUpdatedAt)}`
                  : 'Подключаем live-ленту...'}
              </span>
            </div>

            <div className="vm-live-layout">
              <article className="vm-live-panel">
                <header className="vm-live-panel__header">
                  <h4>Последние вопросы</h4>
                  <AppLink className="vm-live-panel__link" href={routes.questions}>
                    Все вопросы
                  </AppLink>
                </header>

                {isLiveFeedLoading ? (
                  <p className="vm-live-panel__state">Загружаем актуальную ленту вопросов...</p>
                ) : null}

                {!isLiveFeedLoading && liveFeedError ? (
                  <p className="vm-live-panel__state vm-live-panel__state--error">{liveFeedError}</p>
                ) : null}

                {!isLiveFeedLoading && !liveFeedError ? (
                  <div className="vm-live-question-list">
                    {liveQuestions.map((question) => {
                      const commentsCount = question.comments.length

                      return (
                        <AppLink
                          key={question.id}
                          className="vm-live-question-item"
                          href={buildQuestionHref(question.id)}
                        >
                          <div className="vm-live-question-item__head">
                            <span className="vm-live-question-item__title">
                              {summarizeQuestion(question.text, 95)}
                            </span>
                            <span className={`vm-live-question-item__badge ${commentsCount ? 'is-success' : ''}`}>
                              {commentsCount ? getAnswersLabel(commentsCount) : 'Ожидает'}
                            </span>
                          </div>
                          <div className="vm-live-question-item__meta">
                            <span>{getQuestionCategory(question)}</span>
                            <span>{formatRelativeQuestionTime(question.created_at)}</span>
                          </div>
                        </AppLink>
                      )
                    })}

                    {!liveQuestions.length ? (
                      <p className="vm-live-panel__state">Пока нет опубликованных вопросов.</p>
                    ) : null}
                  </div>
                ) : null}
              </article>

              <aside className="vm-live-panel vm-live-panel--aside">
                <header className="vm-live-panel__header">
                  <h4>Врачи онлайн</h4>
                  <span className="vm-live-online-count">{onlineDoctors.length}</span>
                </header>

                {isLiveFeedLoading ? (
                  <p className="vm-live-panel__state">Загружаем список онлайн-врачей...</p>
                ) : null}

                {!isLiveFeedLoading && !onlineDoctors.length ? (
                  <p className="vm-live-panel__state">Сейчас нет врачей онлайн.</p>
                ) : null}

                {!isLiveFeedLoading && onlineDoctors.length ? (
                  <div className="vm-live-doctor-list">
                    {onlineDoctors.map((doctor) => {
                      const profile = getDoctorVisualProfile(doctor)

                      return (
                        <AppLink
                          key={doctor.id}
                          className="vm-live-doctor-item"
                          href={buildDoctorProfileHref(doctor.id)}
                        >
                          <span
                            className="vm-live-doctor-item__avatar"
                            style={{ background: profile.theme.background }}
                            aria-hidden="true"
                          >
                            <ProfileImage alt={getDisplayName(doctor)} src={doctor.avatar_url} />
                          </span>
                          <span className="vm-live-doctor-item__body">
                            <strong>{getDisplayName(doctor)}</strong>
                            <span>{doctor.specializations[0]?.name || 'Врач'}</span>
                          </span>
                          <span className="vm-live-doctor-item__online" aria-label="Сейчас онлайн" />
                        </AppLink>
                      )
                    })}
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        </section>

        <section
          className="js-reveal-section js-testimonials-section scroll-mt-20 px-4 py-8 sm:bg-slate-50 sm:px-6 sm:py-16 lg:px-8 xl:py-24"
          id="services"
        >
          <div className="mx-auto w-full max-w-7xl">
            <div className="mb-6 text-left sm:mb-12 sm:text-center md:mb-16">
              <h3 className="mb-1 text-xl font-extrabold tracking-tight sm:mb-4 sm:text-3xl lg:text-4xl">
                Отзывы пациентов
              </h3>
              <p className="text-xs text-slate-500 sm:text-base">
                Нам доверяют самое ценное — свое здоровье
              </p>
            </div>

            <div className="md:hidden">
              <div
                ref={mobileTestimonialsTrackRef}
                className="js-testimonials-track no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
                onScroll={handleMobileTestimonialsScroll}
              >
                {isTestimonialsLoading &&
                  Array.from({ length: mobileTestimonialsCount }).map((_, index) => (
                    <div
                      key={`testimonial-mobile-skeleton-${index + 1}`}
                      className="w-full shrink-0 snap-center"
                    >
                      <article className="js-testimonial-item animate-pulse rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-4 h-5 w-28 rounded bg-slate-100" />
                        <div className="space-y-2">
                          <div className="h-3 w-full rounded bg-slate-100" />
                          <div className="h-3 w-[92%] rounded bg-slate-100" />
                          <div className="h-3 w-[80%] rounded bg-slate-100" />
                        </div>
                        <div className="mt-5 border-t border-slate-100 pt-4">
                          <div className="h-3 w-32 rounded bg-slate-100" />
                        </div>
                      </article>
                    </div>
                  ))}

                {!isTestimonialsLoading &&
                  testimonials.map((item) => (
                    <div key={item.id} className="w-full shrink-0 snap-center">
                      <article className="js-testimonial-item flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-0.5 text-accent-emerald">
                          {Array.from({ length: item.rating }).map((_, starIndex) => (
                            <span
                              key={`${item.id}-star-mobile-${starIndex + 1}`}
                              className="material-symbols-outlined fill-1 text-base"
                            >
                              star
                            </span>
                          ))}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700">
                          "{item.quote}"
                        </p>
                        <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                          <img
                            alt={item.name}
                            className="h-9 w-9 rounded-full object-cover"
                            src={item.image}
                          />
                          <div>
                            <h5 className="text-sm font-bold">{item.name}</h5>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                              {item.role}
                            </p>
                          </div>
                        </div>
                      </article>
                    </div>
                  ))}
              </div>

              {mobileTestimonialsCount > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    aria-label="Предыдущий отзыв"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 disabled:opacity-35"
                    disabled={activeMobileTestimonial === 0}
                    onClick={() => goToMobileTestimonial(activeMobileTestimonial - 1)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">
                      chevron_left
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: mobileTestimonialsCount }).map((_, index) => (
                      <button
                        key={`testimonial-mobile-dot-${index + 1}`}
                        aria-label={`Показать отзыв ${index + 1}`}
                        className={`h-1.5 rounded-full transition-all ${
                          activeMobileTestimonial === index
                            ? 'w-5 bg-primary'
                            : 'w-1.5 bg-slate-300'
                        }`}
                        onClick={() => goToMobileTestimonial(index)}
                        type="button"
                      />
                    ))}
                  </div>

                  <button
                    aria-label="Следующий отзыв"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 disabled:opacity-35"
                    disabled={activeMobileTestimonial >= mobileTestimonialsCount - 1}
                    onClick={() => goToMobileTestimonial(activeMobileTestimonial + 1)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">
                      chevron_right
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="js-testimonials-track hidden gap-6 md:grid md:grid-cols-2 xl:grid-cols-3">
              {isTestimonialsLoading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <article
                    key={`testimonial-desktop-skeleton-${index + 1}`}
                    className="js-testimonial-item animate-pulse rounded-[2.5rem] border border-slate-100 bg-white p-9 shadow-sm"
                  >
                    <div className="mb-6 h-6 w-32 rounded bg-slate-100" />
                    <div className="space-y-3">
                      <div className="h-4 w-full rounded bg-slate-100" />
                      <div className="h-4 w-[92%] rounded bg-slate-100" />
                      <div className="h-4 w-[80%] rounded bg-slate-100" />
                    </div>
                    <div className="mt-8 border-t border-slate-100 pt-6">
                      <div className="h-4 w-40 rounded bg-slate-100" />
                    </div>
                  </article>
                ))}

              {!isTestimonialsLoading &&
                testimonials.map((item) => (
                  <article
                    key={`${item.id}-desktop`}
                    className="js-testimonial-item flex flex-col gap-7 rounded-[2.5rem] border border-slate-100 bg-white p-9 shadow-sm"
                  >
                    <div className="flex items-center gap-1 text-accent-emerald">
                      {Array.from({ length: item.rating }).map((_, starIndex) => (
                        <span
                          key={`${item.id}-star-desktop-${starIndex + 1}`}
                          className="material-symbols-outlined fill-1 text-xl"
                        >
                          star
                        </span>
                      ))}
                    </div>
                    <p className="text-lg leading-relaxed text-slate-700">
                      "{item.quote}"
                    </p>
                    <div className="flex items-center gap-4 border-t border-slate-100 pt-6">
                      <img
                        alt={item.name}
                        className="h-12 w-12 rounded-full object-cover"
                        src={item.image}
                      />
                      <div>
                        <h5 className="text-base font-bold">{item.name}</h5>
                        <p className="text-sm text-slate-500">{item.role}</p>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        </section>

        <section className="js-reveal-section px-4 py-8 sm:px-6 sm:py-16 lg:px-8 xl:py-24">
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-5 overflow-hidden rounded-2xl bg-primary p-6 text-center sm:gap-8 sm:rounded-[3rem] sm:p-12 lg:p-16 xl:p-20">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            <h2 className="relative z-10 text-xl leading-tight font-extrabold text-white sm:text-4xl lg:text-5xl">
              Готовы начать заботиться <br />о своем здоровье?
            </h2>
            <p className="relative z-10 max-w-2xl text-xs text-white/80 sm:text-lg">
              Получите первую консультацию со скидкой 50% после регистрации.
              Наши специалисты на связи прямо сейчас.
            </p>
            <div className="relative z-10 mt-2 flex w-full flex-col gap-3 sm:mt-4 sm:w-auto sm:flex-row sm:gap-4">
              <AppLink
                className="w-full rounded-xl bg-white px-4 py-3.5 text-center text-sm font-bold text-primary shadow-lg shadow-black/20 transition-all hover:bg-slate-50 sm:w-auto sm:rounded-2xl sm:px-10 sm:py-4 sm:text-lg sm:shadow-xl"
                href={routes.doctors}
              >
                Записаться сейчас
              </AppLink>
              <AppLink
                className="w-full rounded-xl border border-white/30 bg-primary/20 px-4 py-3.5 text-center text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/10 sm:w-auto sm:rounded-2xl sm:px-10 sm:py-4 sm:text-lg"
                href={auth.isAuthenticated ? dashboardHref : routes.register}
              >
                {auth.isAuthenticated ? 'Открыть кабинет' : 'Создать аккаунт'}
              </AppLink>
            </div>
          </div>
        </section>
      </main>

      <VirtualMedicFooter />

    </div>
  )
}

export default App
