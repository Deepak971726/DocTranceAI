import { type ReactNode } from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AppErrorBoundary } from "../app/AppErrorBoundary";
import { queryClient } from "../app/queryClient";
import { persistor, store } from "../store";
import { ThemeProvider } from "./ThemeProvider";

interface Props {
  children: ReactNode;
}

export function AppProviders({ children }: Props) {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppErrorBoundary>
              {children}
              <Toaster richColors position="top-right" expand />
            </AppErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  );
}
