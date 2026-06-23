import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store'
import AppLayout    from '@/components/layout/AppLayout'
import Login        from '@/pages/Login'
import Dashboard    from '@/pages/Dashboard'
import Patients     from '@/pages/Patients'
import PatientDetail from '@/pages/PatientDetail'
import NewPatient   from '@/pages/NewPatient'
import Admin        from '@/pages/Admin'

function PrivateRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin } = useAuthStore()
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin()) return <Navigate to="/" replace />
  return children
}

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <PrivateRoute><AppLayout /></PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/new" element={<NewPatient />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="admin" element={
            <PrivateRoute adminOnly><Admin /></PrivateRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
