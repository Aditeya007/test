// src/components/SuspenseBoundary.js
// React 19 Suspense with error boundary
import React, { Suspense } from 'react';
import ErrorBoundary from './ErrorBoundary';
import Loader from './Loader';

/**
 * Wrapper component that combines Suspense and ErrorBoundary
 * for better error handling and loading states
 */
export function SuspenseBoundary({ children, fallback, errorFallback }) {
  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={fallback || <Loader message="Loading..." />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default SuspenseBoundary;
