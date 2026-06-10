import { Outlet, useLocation } from "react-router-dom";
import { PageTransition } from "@/components/common/PageTransition";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <div className="premium-grid pointer-events-none fixed inset-0 opacity-30" />
      <div className="pointer-events-none fixed -right-24 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-24 left-32 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      <AppSidebar />
      <div className="relative lg:pl-64">
        <TopNavbar />
        <main className="p-4 sm:p-6">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
