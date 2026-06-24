import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore, useNotifStore, useSettingsStore } from '@/store'
import { api } from '@/services/api'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const NAV_ITEMS = [
  { to: '/',         icon: 'dashboard',     label: 'Dashboard',    end: true },
  { to: '/patients', icon: 'group',         label: 'Pacientes',    end: false },
]

function greeting(name) {
  const h = new Date().getHours()
  const salut = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const first = name?.split(' ')[0] ?? 'Especialista'
  return `${salut}, ${first}`
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen,   setNotifOpen]   = useState(false)
  const notifRef = useRef(null)

  const { agent, logout, isAdmin } = useAuthStore()
  const { notifications, unreadCount, setNotifications, markRead, markAllRead } = useNotifStore()
  const { settings } = useSettingsStore()

  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    function fetchNotifs() {
      api.notifications.list({ limit: 20 }).then(data => {
        if (data) setNotifications(data.notifications ?? data, data.unread_count ?? 0)
      }).catch(() => {})
    }
    fetchNotifs()
    const id = setInterval(fetchNotifs, 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleMarkRead(id) {
    await api.notifications.markRead(id).catch(() => {})
    markRead(id)
  }

  async function handleMarkAll() {
    await api.notifications.markAllRead().catch(() => {})
    markAllRead()
  }

  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Mobile overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <nav className={`
        fixed inset-y-0 left-0 z-30 w-[260px] flex flex-col
        bg-surface border-r border-outline-variant shadow-sm
        transition-transform duration-300 md:translate-x-0 md:relative md:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand */}
        <div className="px-6 py-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center shrink-0">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-primary font-bold text-sm">
                {(settings.clinic_name || 'C')[0].toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-display-md font-display-md font-bold text-primary">
              {settings.clinic_name || 'CareDesk'}
            </h1>
            <p className="text-label-sm font-label-sm text-on-surface-variant">CS Portal</p>
          </div>
          <button
            className="ml-auto md:hidden text-on-surface-variant hover:text-on-surface"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Nav links */}
        <ul className="flex flex-col flex-grow mt-2">
          {NAV_ITEMS.map(({ to, icon, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-6 py-4 text-label-md font-label-md transition-all duration-150 ` +
                  (isActive
                    ? 'text-primary font-bold border-l-4 border-primary bg-primary/5'
                    : 'text-on-surface-variant border-l-4 border-transparent hover:bg-surface-container-high')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`material-symbols-outlined mr-3 ${isActive ? 'fill-icon' : ''}`}>{icon}</span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}

          {isAdmin() && (
            <li>
              <NavLink
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-6 py-4 text-label-md font-label-md transition-all duration-150 ` +
                  (isActive
                    ? 'text-primary font-bold border-l-4 border-primary bg-primary/5'
                    : 'text-on-surface-variant border-l-4 border-transparent hover:bg-surface-container-high')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`material-symbols-outlined mr-3 ${isActive ? 'fill-icon' : ''}`}>settings</span>
                    Admin
                  </>
                )}
              </NavLink>
            </li>
          )}
        </ul>

        {/* Logout footer */}
        <div className="p-6 mt-auto border-t border-outline-variant/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-semibold">
                {agent?.name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-label-md font-label-md text-on-surface truncate">{agent?.name}</p>
              <p className="text-label-sm font-label-sm text-on-surface-variant">
                {agent?.role === 'admin' ? 'Administrador' : 'Agente'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full py-2 px-4 flex items-center justify-center gap-2 text-on-surface-variant hover:bg-surface-container-high transition-colors text-label-md font-label-md"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
            Sair
          </button>
        </div>
      </nav>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top App Bar */}
        <header className="sticky top-0 z-30 flex justify-between items-center px-6 py-4 bg-surface/90 backdrop-blur-md border-b border-surface-container-high flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-on-surface-variant hover:text-on-surface p-1"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div>
              <h2 className="text-display-md font-display-md text-on-surface">
                {greeting(agent?.name)} <span className="inline-block hover:animate-bounce">👋</span>
              </h2>
              <p className="text-body-md font-body-md text-on-surface-variant mt-0.5 capitalize">{today}</p>
            </div>
          </div>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors relative"
            >
              <span className="material-symbols-outlined">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full ring-2 ring-surface" />
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: .96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: .96, y: -4 }}
                  transition={{ duration: .15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-surface shadow-modal border border-outline-variant z-50"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/50">
                    <span className="text-label-md font-label-md text-on-surface">Notificações</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAll}
                        className="text-label-sm font-label-sm text-primary hover:text-primary-fixed-dim flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>done_all</span>
                        Marcar todas
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center text-body-md font-body-md text-on-surface-variant py-8">
                        Nenhuma notificação
                      </p>
                    ) : (
                      notifications.slice(0, 15).map(n => (
                        <NotifItem key={n.id} notif={n} onRead={handleMarkRead} />
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
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
      className={`w-full text-left px-4 py-3 border-b border-outline-variant/30 hover:bg-surface-container-low transition-colors ${!notif.is_read ? 'bg-primary/5' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-error' : 'bg-tertiary-container'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-label-md font-label-md text-on-surface line-clamp-2">
            {isOverdue ? 'Atrasado' : 'Follow-up pendente'}
            {notif.patient_name && ` — ${notif.patient_name}`}
          </p>
          <p className="text-label-sm font-label-sm text-outline mt-0.5">
            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
        {!notif.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1" />}
      </div>
    </button>
  )
}
