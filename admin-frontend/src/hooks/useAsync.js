// src/hooks/useAsync.js
// React 19 use() hook for async data fetching
import { use, useMemo } from 'react';

/**
 * Custom hook using React 19's use() hook for async data fetching
 * This provides better Suspense integration and error handling
 */
export function useAsync(promise) {
  // use() hook automatically suspends until promise resolves
  // and throws to error boundary if promise rejects
  return use(promise);
}

/**
 * Creates a promise from an async function
 * Useful for wrapping async operations to use with use() hook
 */
export function createAsyncPromise(asyncFn, ...args) {
  return asyncFn(...args);
}

/**
 * Hook for fetching data with Suspense support
 */
export function useAsyncData(asyncFn, deps = []) {
  const promise = useMemo(() => {
    return asyncFn();
  }, deps);
  
  return use(promise);
}
