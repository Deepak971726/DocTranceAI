import { api } from "./axios";
import type {
  ForgotPasswordPayload,
  LoginPayload,
  MessageResponse,
  RefreshPayload,
  RegisterPayload,
  ResetPasswordPayload,
  TokenResponse,
  User,
} from "@/types/api";

export const authApi = {
  register: async (payload: RegisterPayload): Promise<User> => {
    const { data } = await api.post<User>("/auth/register", payload);
    return data;
  },
  login: async (payload: LoginPayload): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/login", payload);
    return data;
  },
  refresh: async (payload: RefreshPayload): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/refresh", payload);
    return data;
  },
  logout: async (refreshToken: string | null): Promise<MessageResponse> => {
    const { data } = await api.post<MessageResponse>("/auth/logout", {
      refresh_token: refreshToken ?? "",
    });
    return data;
  },
  forgotPassword: async (payload: ForgotPasswordPayload): Promise<MessageResponse> => {
    const { data } = await api.post<MessageResponse>("/auth/forgot-password", payload);
    return data;
  },
  resetPassword: async (payload: ResetPasswordPayload): Promise<MessageResponse> => {
    const { data } = await api.post<MessageResponse>("/auth/reset-password", payload);
    return data;
  },
};
