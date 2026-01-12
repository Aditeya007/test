// src/hooks/useOptimisticUpdate.js
// React 19 useOptimistic hook wrapper for common patterns
import { useOptimistic } from 'react';

/**
 * Custom hook for optimistic updates with error handling
 * @param {*} currentState - Current state value
 * @param {Function} reducer - Reducer function (currentState, optimisticValue) => newState
 * @returns {Array} [optimisticState, addOptimistic]
 */
export function useOptimisticUpdate(currentState, reducer) {
  return useOptimistic(currentState, reducer);
}

/**
 * Optimistic update reducer for arrays (add item)
 */
export function addItemReducer(current, newItem) {
  return [...current, newItem];
}

/**
 * Optimistic update reducer for arrays (remove item)
 */
export function removeItemReducer(current, itemId) {
  return current.filter(item => (item.id || item._id) !== itemId);
}

/**
 * Optimistic update reducer for arrays (update item)
 */
export function updateItemReducer(current, updatedItem) {
  return current.map(item => 
    (item.id || item._id) === (updatedItem.id || updatedItem._id) 
      ? { ...item, ...updatedItem }
      : item
  );
}
