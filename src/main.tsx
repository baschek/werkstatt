import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { bootstrap, needsLogin } from './app'
import App from './ui/App'
import { setApp, setUI } from './ui/store'

async function main() {
  const app = await bootstrap()
  setApp(app)
  if (await needsLogin(app)) setUI({ loggedOut: true })
  createRoot(document.getElementById('root')!).render(<App />)
  try { registerSW({ immediate: true }) } catch { /* ohne Service Worker */ }
}
void main()
