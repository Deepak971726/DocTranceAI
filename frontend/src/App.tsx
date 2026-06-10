import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PageLoader } from "./components/common/PageLoader";
import { AppLayout } from "./layouts/AppLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { LandingLayout } from "./layouts/LandingLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const DashboardPage = lazy(() => import("./pages/app/DashboardPage"));
const DocumentsPage = lazy(() => import("./pages/app/DocumentsPage"));
const DocumentDetailsPage = lazy(() => import("./pages/app/DocumentDetailsPage"));
const UploadDocumentPage = lazy(() => import("./pages/app/UploadDocumentPage"));
const ChatPage = lazy(() => import("./pages/app/ChatPage"));
const SummaryPage = lazy(() => import("./pages/app/SummaryPage"));
const FaqPage = lazy(() => import("./pages/app/FaqPage"));
const SettingsPage = lazy(() => import("./pages/app/SettingsPage"));
const BillingPage = lazy(() => import("./pages/app/BillingPage"));
const AnalyticsPage = lazy(() => import("./pages/app/AnalyticsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader label="Loading DocTraceAI" />}>
        <Routes>
          <Route element={<LandingLayout />}>
            <Route index element={<LandingPage />} />
          </Route>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/app" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/documents/upload" element={<UploadDocumentPage />} />
              <Route path="/documents/:documentId" element={<DocumentDetailsPage />} />
              <Route path="/documents/:documentId/summary" element={<SummaryPage />} />
              <Route path="/documents/:documentId/faqs" element={<FaqPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
