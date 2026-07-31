import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuthStore, useNotifStore, useSettingsStore, useThemeStore } from '@/store'
import { api } from '@/services/api'
import { getBranding } from '@/theme/branding'
import Avatar from '@/components/common/Avatar'

const NAV_ITEMS = [
  { to: '/', icon: 'dashboard', label: 'Visao Geral', end: true },
  { to: '/patients', icon: 'group', label: 'Pacientes', end: false },
  { to: '/historico', icon: 'history', label: 'Historico', end: false },
]

// Itens visiveis so pra admin — mesma restricao aplicada nas rotas (router) e
// na API (adminOnly).
const ADMIN_NAV_ITEMS = [
  { to: '/logs', icon: 'bug_report', label: 'Logs', end: false },
  { to: '/admin', icon: 'settings', label: 'Configuracoes', end: false },
]

function navLinkClass({ isActive }) {
  return `
    flex items-center gap-3 rounded-2xl py-3 text-sm transition-all
    ${isActive
      ? 'border-l-4 border-hero-strong bg-hero-strong/15 pl-3 pr-4 text-hero-strong shadow-card'
      : 'px-4 text-[#f3e6d2]/86 hover:bg-white/10 hover:text-white'}
  `
}

function greeting(name) {
  const hour = new Date().getHours()
  const salute = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = name?.split(' ')[0] ?? 'Equipe'
  return `${salute}, ${firstName}`
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  const { agent, logout, isAdmin } = useAuthStore()

  async function handleLogout() {
    try { await api.auth.logout() } catch { /* cookie expira sozinho mesmo se a chamada falhar */ }
    logout()
  }
  const { notifications, unreadCount, setNotifications, markRead, markAllRead } = useNotifStore()
  const { settings } = useSettingsStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const branding = getBranding(settings)

  useEffect(() => {
    function handleOutsideClick(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    function fetchNotifications() {
      api.notifications.list({ limit: 20 }).then((data) => {
        if (data) setNotifications(data.notifications ?? data, data.unread_count ?? 0)
      }).catch(() => {})
    }

    fetchNotifications()
    const intervalId = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(intervalId)
  }, [setNotifications])

  async function handleMarkRead(id) {
    await api.notifications.markRead(id).catch(() => {})
    markRead(id)
  }

  async function handleMarkAll() {
    await api.notifications.markAllRead().catch(() => {})
    markAllRead()
  }

  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
  const sidebarHeroStyle = branding.backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgb(var(--color-hero) / 0.76), rgb(var(--color-hero) / 0.94)), url("${branding.backgroundImageUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  // `h-screen`, não `min-h-screen`: com altura mínima o shell cresce junto com a
  // página, a sidebar estica junto e o bloco do agente (ancorado por `mt-auto`)
  // escorrega para fora da viewport em telas longas. Altura fixa prende a
  // sidebar na tela; quem rola é o <main>, que já tem overflow próprio.
  return (
    <div className="relative flex h-screen bg-background text-on-surface overflow-hidden">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-[#1d1a15]/45 backdrop-blur-[2px] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <nav
        className={`
          fixed inset-y-0 left-0 z-30 w-[292px] border-r border-white/10
          bg-hero text-[#f7efe3] shadow-glow transition-transform duration-300
          md:translate-x-0 md:relative md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={sidebarHeroStyle}
      >
        <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(0,0,0,0.14),rgba(0,0,0,0.36))] px-5 pb-6 pt-5 backdrop-blur-[1px]">
          <div className="shrink-0 rounded-[28px] border border-white/10 bg-white/8 p-5 shadow-card backdrop-blur-sm">
            <div className="flex items-start gap-4">
              <img
                src={branding.logoUrl}
                alt={`Logo da clinica ${branding.clinicName}`}
                className="h-16 w-16 rounded-[22px] border border-white/20 bg-white/15 object-cover shadow-card"
              />
              <div className="min-w-0 flex-1 pt-1">
                <h1 className="text-[2rem] leading-none text-hero-strong">{branding.clinicName}</h1>
                <p className="mt-3 text-sm leading-6 text-[#ebddc8]/88">{branding.tagline}</p>
              </div>
              <button
                className="rounded-full border border-white/12 p-2 text-[#ebddc8] md:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          {/* `min-h-0` permite este bloco encolher dentro do flex e rolar sozinho
              em telas baixas — sem ele, o menu empurraria o rodapé para fora. */}
          <div className="mt-6 min-h-0 overflow-y-auto rounded-[28px] border border-white/8 bg-black/10 p-3 backdrop-blur-sm">
            <p className="px-3 pb-2 text-[11px] uppercase tracking-[0.26em] text-hero-label">Navegacao</p>
            <ul className="space-y-1.5">
              {[...NAV_ITEMS, ...(isAdmin() ? ADMIN_NAV_ITEMS : [])].map(({ to, icon, label, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={() => setSidebarOpen(false)}
                    className={navLinkClass}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`material-symbols-outlined ${isActive ? 'fill-icon' : ''}`}>{icon}</span>
                        <span className="font-semibold">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Ancorado no rodapé da sidebar. `shrink-0` impede que ele seja
              comprimido quando o menu acima cresce. */}
          <div className="mt-auto shrink-0 rounded-[28px] border border-white/8 bg-black/16 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Avatar
                name={agent?.name}
                src={agent?.avatar_url}
                size="md"
                className="shrink-0 border border-white/10"
                fallbackClassName="bg-[#f4ebdd] text-[#19372f]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{agent?.name}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-hero-label">
                  {agent?.role === 'admin' ? 'Administrador' : 'Agente'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-[#f7efe3] hover:bg-white/10"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
              Sair
            </button>
          </div>
        </div>
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-outline-variant/40 bg-surface-container-low/85 px-4 py-4 backdrop-blur-xl md:px-8">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                className="rounded-full border border-outline-variant/70 bg-surface px-3 py-2 text-on-surface md:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-on-surface-variant">Painel institucional</p>
                <h2 className="mt-1 text-display-md text-on-surface">
                  {greeting(agent?.name)} <span className="inline-block">👋</span>
                </h2>
                <p className="text-sm capitalize text-on-surface-variant">{today}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleDark}
                title={dark ? 'Modo claro' : 'Modo escuro'}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/70 bg-surface text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">{dark ? 'light_mode' : 'dark_mode'}</span>
              </button>

              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((current) => !current)}
                  className="relative flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/70 bg-surface text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined">notifications</span>
                  {unreadCount > 0 && (
                    <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-surface-container-low" />
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -6 }}
                      className="absolute right-0 top-full mt-3 w-[360px] overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-low shadow-modal"
                    >
                      <div className="flex items-center justify-between border-b border-outline-variant/50 px-5 py-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Notificacoes</p>
                          <h3 className="mt-1 text-headline-sm text-on-surface">Atividade recente</h3>
                        </div>
                        {unreadCount > 0 && (
                          <button onClick={handleMarkAll} className="text-sm font-semibold text-primary hover:opacity-80">
                            Marcar todas
                          </button>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="px-5 py-8 text-center text-sm text-on-surface-variant">Nenhuma notificacao no momento.</p>
                        ) : (
                          notifications.slice(0, 15).map((notification) => (
                            <NotifItem key={notification.id} notif={notification} onRead={handleMarkRead} />
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function NotifItem({ notif, onRead }) {
  const isOverdue = notif.type === 'followup_overdue'

  return (
    <button
      onClick={() => !notif.is_read && onRead(notif.id)}
      className={`w-full border-b border-outline-variant/35 px-5 py-4 text-left hover:bg-surface ${!notif.is_read ? 'bg-primary/5' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${isOverdue ? 'bg-error' : 'bg-secondary'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">
            {isOverdue ? 'Contato em atraso' : 'Contato pendente'}
            {notif.patient_name && ` - ${notif.patient_name}`}
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
        {!notif.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
      </div>
    </button>
  )
}
