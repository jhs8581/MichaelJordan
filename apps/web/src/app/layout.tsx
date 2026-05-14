import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MichaelJordan Chat',
  description: '실시간 채팅 애플리케이션',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-100 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
