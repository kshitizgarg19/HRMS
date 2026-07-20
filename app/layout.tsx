import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NexusHR — People Platform",
  description: "A complete HRMS: attendance, leave, payroll, tasks, reimbursements and people management.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NexusHR" },
  formatDetection: { telephone: false },
};

/** Mobile-app feel: fill the screen edge-to-edge, respect notches, tint the status bar. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // App defaults to dark regardless of the OS scheme, so tint the mobile status bar dark too.
  themeColor: "#020617",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
