import dynamic from 'next/dynamic'
const ChurnApp = dynamic(() => import('@/components/ChurnApp'), { ssr: false })
export default function Page() { return <ChurnApp /> }
