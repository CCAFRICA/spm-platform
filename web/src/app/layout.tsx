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
import { Toaster } from "sonner";
import { getServerAuthState } from "@/lib/auth/server-auth";

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

  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <body
        className={`${dmSans.variable} ${dmMono.variable} antialiased`}
        style={{ background: '#0a0e1a', color: '#e2e8f0', minHeight: '100vh' }}
      >
        <AuthProvider initialAuthState={authState}>
          <TenantProvider>
            <LocaleProvider>
              <SessionProvider>
                <ConfigProvider>
                  <AuthShell>{children}</AuthShell>
                  <Toaster position="top-right" richColors closeButton />
                </ConfigProvider>
              </SessionProvider>
            </LocaleProvider>
          </TenantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
