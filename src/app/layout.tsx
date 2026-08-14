import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LivePDF Room — Collaborative PDF Study Room",
  description: "Real-time collaborative PDF study room. Create a room, share the code, and solve questions together with synchronized PDF viewing, timers, and live presence.",
  keywords: ["LivePDF", "collaborative PDF", "study room", "real-time", "Socket.IO", "Next.js", "PDF sync"],
  authors: [{ name: "LivePDF Room" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "LivePDF Room",
    description: "Real-time collaborative PDF study room",
    url: "https://chat.z.ai",
    siteName: "LivePDF Room",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LivePDF Room",
    description: "Real-time collaborative PDF study room",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
