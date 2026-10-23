import { QueryClient } from '@tanstack/react-query';

/** Shared so sign-out can drop every cached query (no data leaks between accounts). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});
