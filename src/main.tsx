import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { logEvent } from 'firebase/analytics'
import './index.css'
import App from './App'
import { analytics } from '../firebase'

// MathJax 설정은 index.html에서 로드 전에 적용 (스크립트가 덮어쓰지 않도록)

// Firebase Analytics 초기화 및 앱 로드 이벤트 (DebugView 확인용)
logEvent(analytics, 'app_loaded', { timestamp: new Date().toISOString() })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
