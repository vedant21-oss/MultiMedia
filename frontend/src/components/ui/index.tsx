/** Small, dependency-light UI primitives in the shadcn/ui spirit. */
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Check, Copy, Loader2, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
  forwardRef, useEffect, useState,
} from 'react';
import { cn } from '@/lib/cn';

/* ------------------------------- Button ------------------------------- */

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all ' +
    'disabled:pointer-events-none disabled:opacity-50 active:scale-[.985] whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-surface-0 hover:bg-ink/85',
        secondary: 'border border-line bg-surface-1 text-ink hover:bg-surface-2',
        ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
        outline: 'border border-brand/50 text-brand hover:bg-brand/10',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* -------------------------------- Card -------------------------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start gap-3 border-b border-line px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-ink', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/* ------------------------------- Inputs ------------------------------- */

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  ({ label, error, hint, className, id, ...props }, ref) => (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        aria-invalid={!!error}
        className={cn('input', error && 'border-danger', className)}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(({ label, error, hint, className, id, ...props }, ref) => (
  <div>
    {label && (
      <label htmlFor={id} className="label">
        {label}
      </label>
    )}
    <textarea
      ref={ref}
      id={id}
      className={cn('input min-h-[88px] resize-y leading-relaxed', error && 'border-danger', className)}
      {...props}
    />
    {error ? (
      <p className="mt-1 text-xs text-danger">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>
    ) : null}
  </div>
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(({ label, error, className, id, children, ...props }, ref) => (
  <div>
    {label && (
      <label htmlFor={id} className="label">
        {label}
      </label>
    )}
    <select ref={ref} id={id} className={cn('input cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
    {error && <p className="mt-1 text-xs text-danger">{error}</p>}
  </div>
));
Select.displayName = 'Select';

/* ------------------------------- Badge -------------------------------- */

const badgeStyles = cva('chip', {
  variants: {
    tone: {
      neutral: 'border-line bg-surface-2 text-ink-muted',
      brand: 'border-brand/40 bg-brand/12 text-brand',
      accent: 'border-accent/40 bg-accent/12 text-accent',
      success: 'border-success/40 bg-success/12 text-success',
      warning: 'border-warning/40 bg-warning/12 text-warning',
      danger: 'border-danger/40 bg-danger/12 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({
  className,
  tone,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return (
    <span className={cn(badgeStyles({ tone }), className)} {...props}>
      {children}
    </span>
  );
}

/** Marks output produced without a live AI provider, so it is never mistaken for real. */
export function DemoBadge({ source }: { source?: string }) {
  if (source !== 'demo') return null;
  return (
    <Badge tone="warning" title="Produced without an AI provider — see Settings">
      <AlertTriangle className="h-3 w-3" />
      Demo
    </Badge>
  );
}

/* ------------------------------ Feedback ------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 text-sm text-ink-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin text-brand" />
      {label}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-ink-faint">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------- Dialog ------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'card max-h-[90vh] w-full animate-fade-up overflow-y-auto',
          wide ? 'max-w-3xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="px-5 py-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = 'Delete', loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/* -------------------------------- Tabs -------------------------------- */

export function Tabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: { id: T; label: string; icon?: React.ComponentType<{ className?: string }>; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-line', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
            value === tab.id
              ? 'border-brand text-ink'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {tab.icon && <tab.icon className="h-4 w-4" />}
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Copy button ---------------------------- */

export function CopyButton({
  text,
  className,
  label = 'Copy',
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The Clipboard API needs a secure context; fall back to a temporary textarea.
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } finally {
        area.remove();
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button variant="ghost" size="sm" className={className} onClick={copy} aria-live="polite">
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}
