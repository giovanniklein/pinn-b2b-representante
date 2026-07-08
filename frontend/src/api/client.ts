import axios from 'axios';

import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

const getStoredToken = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStoredToken = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in some mobile/private modes.
  }
};

const removeStoredToken = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in some mobile/private modes.
  }
};

const getAccessToken = () =>
  useAuthStore.getState().accessToken ?? getStoredToken('pinn_representante_access_token');

const getRefreshToken = () =>
  useAuthStore.getState().refreshToken ?? getStoredToken('pinn_representante_refresh_token');

let isRefreshing = false;
let failedQueue: {
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

api.interceptors.request.use((config) => {
  const accessToken = getAccessToken();

  // Controle de loader global
  useUiStore.getState().increment();

  if (accessToken && config.headers) {
    // JWT sempre enviado; backend extrai representante_id do payload
    // para aplicar multi-tenant automaticamente
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Finaliza loader global em respostas de sucesso
    useUiStore.getState().decrement();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Finaliza loader global em erros
    useUiStore.getState().decrement();

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        isRefreshing = false;

        // Sem refresh token, encerramos sessao imediatamente
        useAuthStore.getState().clearSession();
        removeStoredToken('pinn_representante_access_token');
        removeStoredToken('pinn_representante_refresh_token');
        window.location.href = '/login';

        return Promise.reject(error);
      }

      try {
        const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });

        setStoredToken('pinn_representante_access_token', data.access_token);
        setStoredToken('pinn_representante_refresh_token', data.refresh_token);
        useAuthStore.getState().setSession(data);

        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        processQueue(null, data.access_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;

        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);

        // Falha ao renovar token -> limpar sessao e voltar para login
        useAuthStore.getState().clearSession();
        removeStoredToken('pinn_representante_access_token');
        removeStoredToken('pinn_representante_refresh_token');
        window.location.href = '/login';

        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
