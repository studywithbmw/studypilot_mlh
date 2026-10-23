import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
import { PRODUCT_NAME } from '../lib/constants';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="space-y-4 max-w-md">
        <span className="font-mono text-6xl font-black text-emerald-500">404</span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Page Not Found
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          The requested study resource or workspace route does not exist or may have been archived.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Link to="/app">
            <Button size="sm" className="text-xs flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" size="sm" className="text-xs">
              Landing Page
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
