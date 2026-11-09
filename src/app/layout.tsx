import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const gellix = localFont({
  src: [
    { path: "../../fonts/gellix/Gellix-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/gellix/Gellix-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/gellix/Gellix-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/gellix/Gellix-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-gellix",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WAEC Prep | Dashboard",
  description: "Your personal WAEC preparation dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={gellix.variable}>{children}</body>
    </html>
  );
}
