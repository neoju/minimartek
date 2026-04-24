import { Navigate, Outlet, Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { logout, selectAuth } from "@/features/auth/authSlice";
import { Button } from "@/components/ui/button";

export function Layout() {
  const { isAuthenticated } = useAppSelector(selectAuth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background px-6 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight">
          Mini Martech
        </Link>
        <nav className="flex items-center gap-6">
          {isAuthenticated ? (
            <>
              <Link
                to="/campaigns"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                Campaigns
              </Link>
              <Link
                to="/campaigns/new"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                New Campaign
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : null}
        </nav>
      </header>
      <main className="flex-1 container mx-auto py-8 px-4">
        <Outlet />
      </main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        &copy; 2026 Mini Martech Inc.
      </footer>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAppSelector(selectAuth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
