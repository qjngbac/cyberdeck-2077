import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Root boundary: without it, a throw inside GameProvider's tick, the status bar,
// the taskbar or the background canvas unmounts the whole tree and leaves a blank
// page with no way out but DevTools.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallbackTitle="CyberDeck 内核异常"
      onReset={() => window.location.reload()}
      secondaryAction={{
        label: '清除本地存档后重启（进度会丢失）',
        onClick: () => {
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith('CYBERDECK_'))
              .forEach((k) => localStorage.removeItem(k));
          } catch {
            // storage unavailable — reloading is still the best option
          }
          window.location.reload();
        },
      }}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
