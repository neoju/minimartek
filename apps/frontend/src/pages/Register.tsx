import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LoginResponse, RegisterForm, RegisterFormSchema, RegisterRequest } from "@repo/dto";
import { useMutation } from "@/lib/api-client";
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

import { useAppDispatch } from "@/app/hooks";
import { setCredentials } from "@/features/auth/authSlice";

type ValidationErrors = Partial<Record<keyof RegisterForm, string[]>>;

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const {
    trigger: register,
    isMutating,
    error: mutationError,
    reset,
  } = useMutation<LoginResponse, RegisterRequest>("/auth/register");

  const handleSubmit = async (e: React.ChangeEvent) => {
    e.preventDefault();

    reset();
    setValidationErrors({});

    const payload: RegisterRequest = {
      name,
      email,
      password,
    };

    const result = RegisterFormSchema.safeParse({
      ...payload,
      confirm_password: confirmPassword,
    });

    if (!result.success) {
      setValidationErrors(result.error.flatten().fieldErrors);

      return;
    }

    try {
      const data = await register(payload);

      if (data) {
        dispatch(setCredentials(data));
        navigate("/campaigns");
      }
    } catch (err) {
      console.error("Registration failed:", err);
    }
  };

  const displayError = mutationError ? mutationError.message : null;

  return (
    <div className="flex items-center justify-center pt-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
          <CardDescription>Enter your information below to create your account</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} autoComplete="off">
          <CardContent className="space-y-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="name" className={validationErrors.name ? "text-red-500" : ""}>
                Full Name
              </Label>
              <Input
                id="name"
                placeholder="John Doe"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={validationErrors.name ? "border-red-500" : ""}
              />
              {validationErrors.name && (
                <p className="text-xs text-red-500">{validationErrors.name[0]}</p>
              )}
            </div>
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
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={validationErrors.password ? "border-red-500" : ""}
              />
              {validationErrors.password && (
                <p className="text-xs text-red-500">{validationErrors.password[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className={validationErrors.confirm_password ? "text-red-500" : ""}
              >
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={validationErrors.confirm_password ? "border-red-500" : ""}
              />
              {validationErrors.confirm_password && (
                <p className="text-xs text-red-500">{validationErrors.confirm_password[0]}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {displayError && (
              <div className="p-3 text-sm w-full text-center text-red-500 bg-red-50 border border-red-200 rounded-md">
                {displayError}
              </div>
            )}

            <Button className="w-full gap-2" type="submit" disabled={isMutating}>
              {isMutating ? <LoadingSpinner className="size-4 text-primary-foreground" /> : null}
              {isMutating ? "Creating account..." : "Register"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Login
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
