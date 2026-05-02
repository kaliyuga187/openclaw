import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().max(254).toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
