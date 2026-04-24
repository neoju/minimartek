import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LoginResponse, LoginRequest, LoginRequestSchema } from "@repo/dto";
import { useMutation } from "@/lib/api-client";
import { useAppDispatch } from "@/app/hooks";
import { setCredentials } from "@/features/auth/authSlice";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type LoginValidationErrors = Partial<Record<keyof LoginRequest, string[]>>;

export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [email, setEmail] = useState(import.meta.env.VITE_TEST_USER_EMAIL || "");
  const [password, setPassword] = useState(import.meta.env.VITE_TEST_USER_PWD || "");
  const [validationErrors, setValidationErrors] = useState<LoginValidationErrors>({});

  const {
    trigger: login,
    isMutating,
    error: apiError,
    reset,
  } = useMutation<LoginResponse, LoginRequest>("/auth/login");

  const handleSubmit = async (e: React.ChangeEvent) => {
    e.preventDefault();
    reset();
    setValidationErrors({});

    const payload: LoginRequest = { email, password };
    const result = LoginRequestSchema.safeParse(payload);

    if (!result.success) {
      setValidationErrors(result.error.flatten().fieldErrors);

      return;
    }

    try {
      const data = await login(payload);

      if (data) {
        dispatch(setCredentials(data));
        navigate("/campaigns");
      }
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  return (
    <div className="flex items-center justify-center pt-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>Enter your email and password to access your account</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} autoComplete="off">
          <CardContent className="space-y-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="email" className={validationErrors.email ? "text-red-500" : ""}>
                Email
              </Label>
              <Input
                id="email"
                type="text"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={validationErrors.email ? "border-red-500" : ""}
              />
              {validationErrors.email && (
                <p className="text-xs text-red-500">{validationErrors.email[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className={validationErrors.password ? "text-red-500" : ""}>
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                className={validationErrors.password ? "border-red-500" : ""}
              />
              {validationErrors.password && (
                <p className="text-xs text-red-500">{validationErrors.password[0]}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {apiError && (
              <div className="p-3 w-full text-center text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                {apiError instanceof Error ? apiError.message : "Login failed"}
              </div>
            )}

            <Button className="w-full gap-2" type="submit" disabled={isMutating}>
              {isMutating ? (
                <>
                  <LoadingSpinner className="size-4 text-primary-foreground" />
                  <span>Logging in...</span>
                </>
              ) : (
                "Login"
              )}
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Register
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
