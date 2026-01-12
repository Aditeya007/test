// src/components/forms/FormStatusButton.js
// React 19 useFormStatus hook component
import { useFormStatus } from 'react-dom';

/**
 * Button component that automatically shows loading state
 * using React 19's useFormStatus hook
 */
export function FormStatusButton({ children, className, ...props }) {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || props.disabled}
      {...props}
    >
      {pending ? 'Processing...' : children}
    </button>
  );
}
