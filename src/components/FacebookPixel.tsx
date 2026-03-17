'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import Script from 'next/script'

const PIXEL_ID = '1490888182599053'

function PixelEvents() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).fbq) {
      // Track page views on route change
      (window as any).fbq('track', 'PageView')
    }
  }, [pathname, searchParams])

  useEffect(() => {
    const success = searchParams.get('success')
    if (success === 'true' && typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'Purchase', {
        currency: 'BRL',
        value: 1.0, // Default value, can be improved if needed
      })
      console.log('🚀 Meta Pixel: Purchase tracked successfully!')
    }
  }, [searchParams])

  return null
}

export function FacebookPixel() {
  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${PIXEL_ID}');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
      <Suspense fallback={null}>
        <PixelEvents />
      </Suspense>
    </>
  )
}
