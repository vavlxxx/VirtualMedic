import { AppLink, useRouter } from './router'
import { routes } from './routes'

function NotFoundPage() {
  const { location } = useRouter()
  const requestedPath = location.pathname === routes.notFound ? location.search : location.pathname

  return (
    <main className="public-page">
      <div className="public-page__ambient public-page__ambient--blue" />
      <div className="public-page__ambient public-page__ambient--emerald" />

      <div className="public-shell">
        <section className="public-hero">
          <div className="public-hero__header">
            <div>
              <span className="public-kicker">
                <span className="material-symbols-outlined">error</span>
                404
              </span>
              <h1 className="public-title">Страница не найдена</h1>
              <p className="public-subtitle">
                Запрашиваемая страница не найдена. Возможно, она была удалена или перенесена. Воспользуйтесь меню или ссылками ниже.
              </p>
            </div>
          </div>
        </section>

        <section className="state-card state-card--error">
          <h2 className="state-card__title">Неизвестный адрес</h2>
          <p className="state-card__text">
            {requestedPath ? `Маршрут ${requestedPath} не найден.` : 'Маршрут не найден.'}
          </p>
          <div className="public-actions">
            <AppLink className="public-link-button" href={routes.landing}>
              На главную
            </AppLink>
            <AppLink className="public-link-button public-link-button--secondary" href={routes.doctors}>
              Каталог врачей
            </AppLink>
            <AppLink className="public-link-button public-link-button--secondary" href={routes.questions}>
              Лента консультаций
            </AppLink>
          </div>
        </section>
      </div>
    </main>
  )
}

export default NotFoundPage
