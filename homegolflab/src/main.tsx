import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* VITE_HASH_ROUTER=1: para alojarla donde no hay servidor que devuelva index.html en cada ruta (la ruta va tras el #). */}
    {import.meta.env.MODE === 'static' || import.meta.env.VITE_HASH_ROUTER ? (
      <HashRouter><App /></HashRouter>
    ) : (
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
);
