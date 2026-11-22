import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThesisLens | Investment workspace",
  description:
    "Explore a portfolio, value a company, plan household finances, and review the evidence with an investment committee.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
