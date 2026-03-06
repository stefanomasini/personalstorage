import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { LiveApp } from './app';
import '@/globals.css';

createRoot(document.getElementById('root')!).render(
    <TooltipProvider>
        <LiveApp />
        <Toaster />
    </TooltipProvider>,
);
