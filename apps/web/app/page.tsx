import { redirect } from 'next/navigation';

export default function Home() {
  // TODO: Check auth status, redirect to /chat or /auth
  redirect('/chat');
}
