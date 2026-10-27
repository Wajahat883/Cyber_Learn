import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60';

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
      {children}
      {hint && <span className="text-muted font-normal ml-2">{hint}</span>}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-error text-xs mt-1" role="alert">
      {children}
    </p>
  );
}

type WithLabel = { label?: ReactNode; hint?: ReactNode; error?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & WithLabel>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <input ref={ref} id={inputId} className={cn(control, 'h-10', error && 'border-error')} aria-invalid={Boolean(error)} {...rest} />
      <FieldError>{error}</FieldError>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & WithLabel>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <textarea ref={ref} id={inputId} className={cn(control, 'min-h-[120px] leading-relaxed', error && 'border-error')} aria-invalid={Boolean(error)} {...rest} />
      <FieldError>{error}</FieldError>
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & WithLabel>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      )}
      <select ref={ref} id={inputId} className={cn(control, 'h-10')} {...rest}>
        {children}
      </select>
      <FieldError>{error}</FieldError>
    </div>
  );
});

/** Accessible on/off switch. */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 rounded-full transition-colors shrink-0', checked ? 'bg-primary' : 'bg-border')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Pill-style single choice. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-border bg-bg/60 p-1 gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm transition-colors',
              value === o.value ? 'bg-primary/15 text-primary border border-primary/40' : 'text-muted hover:text-text border border-transparent',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
