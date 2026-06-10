import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { store } from "../store";
import { logout, setCredentials } from "../store/slices/authSlice";
import type { ApiErrorResponse, TokenResponse } from "../types/api";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL,
  withCredentials: false,
});

let refreshPromise: Promise<TokenResponse> | null = null;

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = store.getState().auth.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isUnauthorized = error.response?.status === 401;
    const refreshToken = store.getState().auth.refreshToken;

    if (isUnauthorized && originalRequest && !originalRequest._retry && refreshToken) {
      originalRequest._retry = true;
      try {
        refreshPromise ??= api
          .post<TokenResponse>("/auth/refresh", { refresh_token: refreshToken })
          .then((response) => response.data)
          .finally(() => {
            refreshPromise = null;
          });

        const tokens = await refreshPromise;
        store.dispatch(setCredentials(tokens));
        originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        store.dispatch(logout());
        refreshPromise = null;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data.error?.message ?? error.message ?? "Request failed.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
}
