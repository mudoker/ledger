'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from '@/components/shared/loading-screen';

const App = dynamic(() => import('@/App'), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

export default function Home() {
  return <App />;
}
