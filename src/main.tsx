import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './api/queryClient';
import { worker } from './mocks/browser';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

async function bootstrap() {
  // MSW is intentionally enabled for dev and published demo builds unless
  // explicitly disabled. The generated public/mockServiceWorker.js must be
  // present in the published static files.
  if (import.meta.env.VITE_ENABLE_MSW !== 'false') {
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
