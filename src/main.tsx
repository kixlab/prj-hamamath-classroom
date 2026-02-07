import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// MathJax 설정은 index.html에서 로드 전에 적용 (스크립트가 덮어쓰지 않도록)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
