import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

interface ToastValue {
  showToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
}
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' | 'info'; key: number } | null>(null);
  const showToast = useCallback((message: string, kind: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, kind, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className={`toast toast--${toast.kind}`} key={toast.key} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : toast.kind === 'error' ? <CircleAlert size={18} /> : <Info size={18} />}
          <span>{toast.message}</span>
          <button className="toast-close" aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast precisa estar dentro de ToastProvider.');
  return value;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`.trim()} {...props}>
      {icon && <span className="button-icon">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <section className={`card ${className}`.trim()} {...props}>{children}</section>;
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
      {action}
    </div>
  );
}

export function DemoBadge({ children = 'DADO FICTÍCIO' }: { children?: ReactNode }) {
  return <span className="demo-badge"><span />{children}</span>;
}

export function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}><span style={{ width: `${bounded}%`, backgroundColor: color }} /></div>;
}

export function SearchInput({ value, onChange, placeholder = 'Buscar...', label = 'Buscar' }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);
  const shortcutLabel = navigator.platform.includes('Mac') ? '⌘ K' : 'Ctrl K';
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <span className="search-shortcut">{shortcutLabel}</span>
    </label>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon"><Info size={19} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Modal({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Fechar janela" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button className={`checkbox-control ${checked ? 'checkbox-control--checked' : ''}`} type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>
      {checked && <Check size={13} strokeWidth={3} />}
    </button>
  );
}
