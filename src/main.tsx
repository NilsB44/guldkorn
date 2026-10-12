import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isNative } from './lib/native'

// Ask the browser not to evict our data under storage pressure (best effort).
navigator.storage?.persist?.().catch(() => {})

// Offline support + push for the web app. The native app ships its files inside the app,
// and a service worker there could keep serving old files after an app update.
if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
