import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@/styles/wayfinder.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ConfigProvider } from "@/contexts/config-context";
import { LocaleProvider } from "@/contexts/locale-context";
import { TenantProvider } from "@/contexts/tenant-context";
import { AuthShell } from "@/components/layout/auth-shell";
import { Toaster } from "sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ViaLuce - Performance Management",
  description: "Enterprise Performance Management Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <TenantProvider>
            <LocaleProvider>
              <ConfigProvider>
                <AuthShell>{children}</AuthShell>
                <Toaster position="top-right" richColors closeButton />
              </ConfigProvider>
            </LocaleProvider>
          </TenantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
