import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, Bell, Settings, LogOut,
  Menu, X, ChevronRight, CheckCheck
} from 'lucide-react'
import { useAuthStore, useNotifStore, useSettingsStore } from '@/store'
import { api } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/patients', icon: Users,           label: 'Pacientes' },
]

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)
  const notifRef = useRef(null)

  const { agent, logout, isAdmin } = useAuthStore()
  const { notifications, unreadCount, setNotifications, markRead, markAllRead } = useNotifStore()
  const { settings } = useSettingsStore()

  // Fechar notif ao clicar fora
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Polling de notificações a cada 60s
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

  return (
    <div className="flex h-screen bg-surface-subtle overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-white border-r border-surface-border
        transition-transform duration-300 lg:translate-x-0 lg:relative lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-border">
          <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">C</span>
          </div>
          <span className="font-semibold text-slate-800">
            {settings.clinic_name || 'CareDesk'}
          </span>
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 group
                ${isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}
              `}
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'} />
                  {label}
                  {isActive && <ChevronRight size={14} className="ml-auto text-primary-400" />}
                </>
              )}
            </NavLink>
          ))}

          {isAdmin() && (
            <NavLink
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 group
                ${isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}
              `}
            >
              {({ isActive }) => (
                <>
                  <Settings size={18} className={isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'} />
                  Admin
                  {isActive && <ChevronRight size={14} className="ml-auto text-primary-400" />}
                </>
              )}
            </NavLink>
          )}
        </nav>

        {/* User info */}
        <div className="px-3 py-4 border-t border-surface-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-primary-700 text-xs font-semibold">
                {agent?.name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{agent?.name}</p>
              <p className="text-xs text-slate-400 truncate">{agent?.role === 'admin' ? 'Administrador' : 'Agente'}</p>
            </div>
            <button
              onClick={logout}
              className="text-slate-400 hover:text-red-500 transition-colors p-1"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center gap-3 px-4 bg-white border-b border-surface-border flex-shrink-0">
          <button
            className="lg:hidden text-slate-500 hover:text-slate-700 p-1"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          {/* Notificações */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: .96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: .96, y: -4 }}
                  transition={{ duration: .15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-modal border border-surface-border z-50"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                    <span className="text-sm font-semibold text-slate-700">Notificações</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAll}
                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        <CheckCheck size={13} /> Marcar todas
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center text-sm text-slate-400 py-8">Nenhuma notificação</p>
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
      className={`w-full text-left px-4 py-3 border-b border-surface-border/50 hover:bg-slate-50 transition-colors
        ${!notif.is_read ? 'bg-primary-50/40' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-700 line-clamp-2">
            {isOverdue ? 'Atrasado' : 'Follow-up pendente'}
            {notif.patient_name && ` — ${notif.patient_name}`}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
        {!notif.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0 mt-1" />}
      </div>
    </button>
  )
}
