import { redirect } from 'next/navigation';

// 루트 접속 시 /chat으로 이동 (로그인 여부는 미들웨어에서 처리)
export default function Home() {
  redirect('/chat');
}
