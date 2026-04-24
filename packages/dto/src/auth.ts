import { z } from "zod";

const EmailSchema = z.string().trim().toLowerCase().email();

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterFormSchema = RegisterRequestSchema.extend({
  confirm_password: z.string().min(1),
}).refine((data) => data.password === data.confirm_password, {
  path: ["confirm_password"],
  message: "Passwords do not match",
});

export type RegisterForm = z.infer<typeof RegisterFormSchema>;

export type LoginResponse = {
  access_token: string;
};
