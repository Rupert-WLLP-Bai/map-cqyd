import dynamic from 'next/dynamic';

const ViewRouter = dynamic(
  () => import('@/components/view-router').then((m) => m.ViewRouter),
  { ssr: false },
);

export default function Page() {
  return <ViewRouter />;
}
