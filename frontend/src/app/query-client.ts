import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api';

/**
 * A 401 with UNAUTHORIZED means the session expired or was revoked. Clearing
 * ['me'] makes AppLayout redirect to the login page instead of leaving the user
 * staring at error states. Other 401s (e.g. INVALID_CREDENTIALS for a wrong
 * password) are ordinary form errors and must not log the user out.
 */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401 && err.code === 'UNAUTHORIZED';
}

function handleError(err: unknown) {
  if (isSessionExpired(err) && queryClient.getQueryData(['me'])) queryClient.setQueryData(['me'], null);
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});
