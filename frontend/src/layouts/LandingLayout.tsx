import { Outlet } from "react-router-dom";

export function LandingLayout() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Outlet />
    </main>
  );
}

