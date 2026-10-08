import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './api/queryClient';
import { worker } from './mocks/browser';
import './styles.css';

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  if (import.meta.env.VITE_ENABLE_MSW !== 'false') {
    await worker.start({ onUnhandledFrame: 'bypass' });
  }

  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
