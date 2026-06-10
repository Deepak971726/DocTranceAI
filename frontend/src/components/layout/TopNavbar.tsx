import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, Upload } from "lucide-react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/slices/authSlice";
import { setMobileMenuOpen } from "@/store/slices/uiSlice";

export function TopNavbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/80 px-4 shadow-sm backdrop-blur-xl sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => dispatch(setMobileMenuOpen(true))}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link to="/documents/upload">
            <Upload className="h-4 w-4" />
            Upload
          </Link>
        </Button>

        <ThemeToggle compact />

        <div className="hidden text-right text-sm sm:block">
          <p className="font-medium">{user?.full_name ?? "User"}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => { dispatch(logout()); navigate("/"); }}
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
