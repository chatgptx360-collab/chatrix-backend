import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://chatrix.app"),
  title: { default: "Chatrix — Messaging without the phone number", template: "%s · Chatrix" },
  description: "A modern, fast, private messaging app. Connect with @username, not phone numbers.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Chatrix",
    description: "Messaging without the phone number.",
    url: "https://chatrix.app",
    siteName: "Chatrix",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#09090f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
