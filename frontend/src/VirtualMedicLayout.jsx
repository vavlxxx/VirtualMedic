import { AppLink, useRouter } from './router'
import { useAuth } from './auth/AuthContext'
import { getDisplayName } from './publicPageUtils'
import { routes } from './routes'
import virtualmedicIcon from './assets/virtualmedic-icon.png'
import { ProfileImage } from './ProfileImage'

function VirtualMedicLogo() {
  return (
    <span className="vm-logo">
      <img alt="VirtualMedic" className="vm-logo__icon" src={virtualmedicIcon} />
      <span className="vm-logo__text">VirtualMedic</span>
    </span>
  )
}

export function VirtualMedicHeader({
  active = 'doctors',
}) {
  const auth = useAuth()
  const { navigate } = useRouter()
  const navItems = [
    { key: 'home', label: '\u0413\u043b\u0430\u0432\u043d\u0430\u044f', href: routes.landing },
    { key: 'doctors', label: '\u0412\u0440\u0430\u0447\u0438', href: routes.doctors },
    { key: 'questions', label: '\u0412\u043e\u043f\u0440\u043e\u0441\u044b', href: routes.questions },
    { key: 'specialties', label: '\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438', href: '/#specialties' },
    { key: 'about', label: '\u041e \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0435', href: '/#about' },
    { key: 'qa', label: 'Q&A', href: routes.questions },
  ]
  const displayName = getDisplayName(auth.user)

  const handleLogout = async () => {
    await auth.logout()
    navigate(routes.login, { replace: true })
  }

  return (
    <header className="vm-header">
      <div className="vm-shell vm-header__inner">
        <AppLink href={routes.landing} className="vm-header__brand">
          <VirtualMedicLogo />
        </AppLink>

        <nav className="vm-header__nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <AppLink
              key={item.key}
              href={item.href}
              className={`vm-header__link ${active === item.key ? 'is-active' : ''}`}
            >
              {item.label}
            </AppLink>
          ))}
        </nav>

        <div className="vm-header__actions">
          {auth.isAuthenticated ? (
            <details className="vm-header__account-menu">
              <summary className="vm-header__profile">
                <span className="vm-header__profile-text" title={displayName}>{displayName}</span>
                <span className="vm-header__avatar" aria-hidden="true">
                  <ProfileImage alt="" src={auth.user?.avatar_url} />
                </span>
                <span className="material-symbols-outlined vm-header__chevron" aria-hidden="true">expand_more</span>
              </summary>
              <div className="vm-header__menu" role="menu">
                <AppLink href={routes.account} role="menuitem">{'\u041f\u0440\u043e\u0444\u0438\u043b\u044c'}</AppLink>
                {auth.hasRole('admin', 'superuser') ? (
                  <AppLink href={routes.admin} role="menuitem">{'\u0410\u0434\u043c\u0438\u043d \u043f\u0430\u043d\u0435\u043b\u044c'}</AppLink>
                ) : null}
                <button type="button" onClick={handleLogout} role="menuitem">{'\u0412\u044b\u0439\u0442\u0438'}</button>
              </div>
            </details>
          ) : (
            <AppLink href={routes.login} className="vm-button vm-button--dark">
              {'\u0412\u043e\u0439\u0442\u0438'}
            </AppLink>
          )}
        </div>
      </div>
    </header>
  )
}

export function VirtualMedicFooter() {
  return (
    <footer className="vm-footer" id="about">
      <div className="vm-shell vm-footer__inner">
        <div className="vm-footer__brand">
          <VirtualMedicLogo />
          <p>{'\u041e\u043d\u043b\u0430\u0439\u043d-\u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0430\u0446\u0438\u0438 \u0441 \u0432\u0440\u0430\u0447\u0430\u043c\u0438, \u043e\u0442\u043a\u0440\u044b\u0442\u0430\u044f \u043b\u0435\u043d\u0442\u0430 \u0432\u043e\u043f\u0440\u043e\u0441\u043e\u0432 \u0438 \u043f\u0440\u043e\u0444\u0438\u043b\u0438 \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442\u043e\u0432 \u0434\u043b\u044f \u0431\u044b\u0441\u0442\u0440\u043e\u0433\u043e \u0432\u044b\u0431\u043e\u0440\u0430 \u0432\u0440\u0430\u0447\u0430.'}</p>
        </div>

        <div className="vm-footer__column">
          <h3>{'\u041f\u0430\u0446\u0438\u0435\u043d\u0442\u0430\u043c'}</h3>
          <AppLink href={routes.doctors}>{'\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0432\u0440\u0430\u0447\u0435\u0439'}</AppLink>
          <AppLink href={routes.questions}>{'\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435 \u0432\u043e\u043f\u0440\u043e\u0441\u044b'}</AppLink>
          <AppLink href={routes.account}>{'\u041b\u0438\u0447\u043d\u044b\u0439 \u043a\u0430\u0431\u0438\u043d\u0435\u0442'}</AppLink>
        </div>

        <div className="vm-footer__column">
          <h3>{'\u041f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0430'}</h3>
          <AppLink href={routes.landing}>{'\u0413\u043b\u0430\u0432\u043d\u0430\u044f'}</AppLink>
          <a href="/#specialties">{'\u0421\u043f\u0435\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438'}</a>
          <AppLink href={routes.register}>{'\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f'}</AppLink>
        </div>

        <div className="vm-footer__column">
          <h3>{'\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430'}</h3>
          <a href="tel:88005553535">8 (800) 555-35-35</a>
          <a href="mailto:help@virtualmedic.ru">help@virtualmedic.ru</a>
          <span>{'\u0415\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u043e 08:00-22:00'}</span>
        </div>

        <div className="vm-footer__bottom">
          <span>{'\u00a9 2026 VirtualMedic. \u0412\u0441\u0435 \u0440\u0430\u0437\u0434\u0435\u043b\u044b \u0441\u0430\u0439\u0442\u0430 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u044e\u0442 \u0435\u0434\u0438\u043d\u044b\u0439 \u0444\u0443\u0442\u0435\u0440.'}</span>
        </div>
      </div>
    </footer>
  )
}

export function VirtualMedicPage({
  activeNav,
  children,
}) {
  return (
    <div className="vm-page">
      <VirtualMedicHeader active={activeNav} />
      <main className="vm-main">{children}</main>
      <VirtualMedicFooter />
    </div>
  )
}

export function VirtualMedicAuthFrame({ children, subtitle, title }) {
  return (
    <main className="vm-auth">
      <div className="vm-auth__topbar">
        <div className="vm-auth__topbar-inner">
          <AppLink href={routes.landing} className="vm-auth__brand">
            <VirtualMedicLogo />
          </AppLink>
          <span className="vm-auth__support">Помощь</span>
        </div>
      </div>

      <div className="vm-auth__body">
        <section className="vm-auth__card">
          <div className="vm-auth__card-brand">
            <VirtualMedicLogo />
          </div>
          <header className="vm-auth__header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}
