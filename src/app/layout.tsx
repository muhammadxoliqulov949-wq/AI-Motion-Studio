import { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "../../styles/global.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "AI Motion Studio — AI bilan video montaj",
  description: "Videongizni so'z bilan montaj qiling: AI kesadi, rang beradi, musiqa va subtitr qo'shadi.",
  applicationName: "AI Motion Studio",
  // Installed on a phone's home screen it opens full-screen like a native app.
  appleWebApp: { capable: true, title: "Motion Studio", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Draw under the notch / home indicator; layouts add env(safe-area-inset-*) padding where needed.
  viewportFit: "cover",
  themeColor: "#0a0a0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className={`${inter.variable} ${display.variable}`}>
      <body className="bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
