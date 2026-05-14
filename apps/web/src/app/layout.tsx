import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '마이클조던',
  description: '마이클조던 채팅 애플리케이션',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-100 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
