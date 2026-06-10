import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authApi } from "@/api/auth.api";
import { getApiErrorMessage } from "@/api/axios";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout, setCredentials } from "@/store/slices/authSlice";

export function useAuth() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const auth = useAppSelector((state) => state.auth);

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (tokens) => {
      dispatch(setCredentials(tokens));
      toast.success("Welcome back to DocTraceAI.");
      navigate("/dashboard");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const register = useMutation({
    mutationFn: async (values: Parameters<typeof authApi.register>[0]) => {
      await authApi.register(values);
      return authApi.login({ email: values.email, password: values.password });
    },
    onSuccess: (tokens) => {
      dispatch(setCredentials(tokens));
      toast.success("Welcome to DocTraceAI!");
      navigate("/dashboard");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const forgotPassword = useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: (response) => toast.success(response.message),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const resetPassword = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success("Password reset complete.");
      navigate("/login");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const signOut = () => {
    dispatch(logout());
    navigate("/");
  };

  return { auth, login, register, forgotPassword, resetPassword, signOut };
}
