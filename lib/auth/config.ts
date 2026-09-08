import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export const authConfig = {
  trustHost: true,
  providers: isGoogleOAuthConfigured() ? [Google] : [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
