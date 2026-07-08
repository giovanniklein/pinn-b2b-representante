import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export function ProtectedRoute() {
  const { isAuthenticated, user, setMe, clearSession } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || user) {
      return;
    }

    const loadMe = async () => {
      try {
        const { data } = await api.get('/auth/me');
        setMe(data);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          clearSession();
        }
      }
    };

    loadMe();
  }, [clearSession, isAuthenticated, setMe, user]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
