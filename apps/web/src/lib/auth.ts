import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import type { Adapter } from 'next-auth/adapters';
import { prisma } from './prisma';
import { env, features } from './env';
import { logger } from './logger';
import { signInSchema } from '@/schemas/auth';

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Email and password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const parsed = signInSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (!user?.passwordHash) {
        // Constant-time-ish dummy compare to slow enumeration.
        await bcrypt.compare(parsed.data.password, '$2a$12$abcdefghijklmnopqrstuv');
        return null;
      }

      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) {
        logger.warn({ email: parsed.data.email }, 'auth.signin.bad_password');
        return null;
      }
      return { id: user.id, email: user.email, name: user.name, role: user.role, image: user.image };
    },
  }),
];

if (features.google) {
  providers.push(
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  secret: env.NEXTAUTH_SECRET,
  pages: { signIn: '/sign-in' },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: 'USER' | 'ADMIN' }).role ?? 'USER';
      } else if (token.email && !token.role) {
        // Refresh role from DB once per session boot.
        const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? '';
        session.user.role = (token.role as 'USER' | 'ADMIN') ?? 'USER';
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      logger.info({ userId: user.id }, 'auth.signin.success');
    },
  },
};
