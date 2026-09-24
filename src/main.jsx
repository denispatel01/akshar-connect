import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { dataService } from './services/dataService'

const root = createRoot(document.getElementById('root'))

function Loading() {
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:'#003158',color:'#fff',fontFamily:'system-ui, sans-serif',flexDirection:'column',gap:'16px'}}>
      <div style={{width:'44px',height:'44px',border:'4px solid rgba(255,255,255,.25)',
        borderTopColor:'#fff',borderRadius:'50%',animation:'acspin 1s linear infinite'}} />
      <div style={{fontSize:'15px',opacity:.9}}>Loading Akshar Connect…</div>
      <style>{`@keyframes acspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

root.render(<Loading />)

dataService.bootstrap().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Register the service worker for PWA / offline support.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => {
      // ignore registration failures — app still works without the SW
    })
  })
}
