import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'ChatBot SaaS',
  description: 'AI-powered chatbot platform with agentic capabilities',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0d0f11] text-[#e4e5e7] antialiased">
        {children}
      </body>
    </html>
  );
}
