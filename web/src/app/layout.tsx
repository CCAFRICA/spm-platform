import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Navbar } from "@/components/navigation/Navbar";
import { AuthProvider } from "@/contexts/auth-context";
import { ConfigProvider } from "@/contexts/config-context";
import { LocaleProvider } from "@/contexts/locale-context";
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
  title: "ClearComp - Sales Performance Management",
  description: "Enterprise Sales Performance Management Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <LocaleProvider>
            <ConfigProvider>
              <Sidebar />
              <div className="md:pl-64">
                <Navbar />
                <main>{children}</main>
              </div>
              <Toaster position="top-right" richColors closeButton />
            </ConfigProvider>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
