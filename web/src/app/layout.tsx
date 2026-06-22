import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import "@/styles/wayfinder.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ConfigProvider } from "@/contexts/config-context";
import { LocaleProvider } from "@/contexts/locale-context";
import { TenantProvider } from "@/contexts/tenant-context";
import { SessionProvider } from "@/contexts/session-context";
import { AuthShell } from "@/components/layout/auth-shell";
import { PrivacyNoticeFooter } from "@/components/privacy/PrivacyNoticeFooter";
import { ClientErrorReporter } from "@/components/observability/ClientErrorReporter"; // OB-230 3A
import { NavigationBreadcrumbs } from "@/components/observability/NavigationBreadcrumbs"; // OB-230 3C
import { Toaster } from "sonner";
import { cookies } from "next/headers";
import { getServerAuthState } from "@/lib/auth/server-auth";
import { getResolvedTheme, type AppTheme } from "@/lib/theme/active-theme";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Vialuce",
  description: "Performance Intelligence Platform — Intelligence. Acceleration. Performance.",
};

// OB-178: Server Component — resolves auth state server-side, passes to client AuthProvider
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authState = await getServerAuthState();
  // HF-309: three-level theme resolution. Authenticated → the user's profiles.preferences theme;
  // pre-auth (login) → the vl-theme cookie; else the global platform_settings default, else 'current'.
  // Emitted server-side as data-theme in the initial HTML (no FOUC, OB-201 mechanism).
  const cookieTheme = (await cookies()).get("vl-theme")?.value as AppTheme | undefined;
  const explicitTheme = authState.isAuthenticated
    ? authState.profile?.themePreference ?? null
    : cookieTheme ?? null;
  const activeTheme = await getResolvedTheme(explicitTheme);

  return (
    <html
      lang="en"
      /* HF-313 Defect 1: darkMode is 'class', so the always-on `dark` class made every Tailwind
         `dark:` variant in content components fire under Vialuce (a light theme) → dark cards on the
         light bg ("washed out"). The Vialuce tokens were already correct white; the root cause was the
         class, not the OKLCH. Drop `dark` for vialuce only (current keeps dark; bliss unchanged — OOS). */
      className={activeTheme === 'vialuce' ? undefined : 'dark'}
      data-theme={activeTheme}
      style={{ colorScheme: (activeTheme === 'bliss' || activeTheme === 'vialuce') ? 'light' : 'dark' }}
    >
      <body
        className={`${dmSans.variable} ${dmMono.variable} antialiased`}
        /* OB-201: body shell reads theme tokens. At [data-theme="current"] these equal the
           prior literals (#0a0e1a / #e2e8f0) exactly — pixel-identical. backgroundColor (not
           the `background` shorthand) so the bliss diamond background-image can coexist. */
        style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-fg)', minHeight: '100vh' }}
      >
        <AuthProvider initialAuthState={authState}>
          <TenantProvider>
            <LocaleProvider>
              <SessionProvider>
                <ConfigProvider>
                  <AuthShell>{children}</AuthShell>
                  <PrivacyNoticeFooter />
                  <Toaster position="top-right" richColors closeButton />
                  {/* OB-230 Objective 3 — diagnostic signal capture (render nothing). */}
                  <ClientErrorReporter />
                  <NavigationBreadcrumbs />
                </ConfigProvider>
              </SessionProvider>
            </LocaleProvider>
          </TenantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
