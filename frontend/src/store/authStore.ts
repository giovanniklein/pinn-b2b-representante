import { create } from 'zustand';

interface UserInfo {
  id: string;
  nome: string;
  email: string;
  representante_id: string;
}

interface MeResponse {
  user: UserInfo;
  representante_razao_social?: string | null;
  representante_nome_fantasia?: string | null;
  representante_cnpj?: string | null;
  representante_id: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserInfo | null;
  representanteRazaoSocial: string | null;
  representanteNomeFantasia: string | null;
  representanteCnpj: string | null;
  isAuthenticated: boolean;
  setSession: (tokens: { access_token: string; refresh_token: string; expires_in?: number }) => void;
  setMe: (me: MeResponse) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('pinn_representante_access_token'),
  refreshToken: localStorage.getItem('pinn_representante_refresh_token'),
  user: null,
  representanteRazaoSocial: null,
  representanteNomeFantasia: null,
  representanteCnpj: null,
  isAuthenticated: !!localStorage.getItem('pinn_representante_access_token'),

  setSession: ({ access_token, refresh_token }) => {
    localStorage.setItem('pinn_representante_access_token', access_token);
    localStorage.setItem('pinn_representante_refresh_token', refresh_token);

    set({
      accessToken: access_token,
      refreshToken: refresh_token,
      isAuthenticated: true,
    });
  },

  setMe: (me) => {
    set({
      user: me.user,
      representanteRazaoSocial: me.representante_razao_social ?? null,
      representanteNomeFantasia: me.representante_nome_fantasia ?? me.representante_razao_social ?? null,
      representanteCnpj: me.representante_cnpj ?? null,
    });
  },

  clearSession: () => {
    localStorage.removeItem('pinn_representante_access_token');
    localStorage.removeItem('pinn_representante_refresh_token');

    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      representanteRazaoSocial: null,
      representanteNomeFantasia: null,
      representanteCnpj: null,
      isAuthenticated: false,
    });
  },
}));
