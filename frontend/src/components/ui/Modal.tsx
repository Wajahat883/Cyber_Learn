import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

/**
 * Native <dialog> based modal: focus trapping and Escape handling come from the browser.
 * Every user-initiated close (X button, backdrop, Escape) goes through `dialog.close()`, so
 * `onClose` fires exactly once from the native `close` event. When the parent closes the
 * modal by setting `open={false}`, `onClose` is not called back.
 */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => ref.current?.close();
  const handleClose = () => {
    // Closed because the parent already set open=false: nothing to report.
    if (openRef.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={(e) => e.target === ref.current && requestClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl border border-border bg-surface text-text p-0 shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 id={titleId} className="font-semibold text-lg">
              {title}
            </h2>
            <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close dialog">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-5 py-4 overflow-y-auto">{children}</div>
          {footer && <div className="px-5 py-4 border-t border-border flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** In-page confirmation (the app never relies on window.confirm). */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirm',
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted">{children}</div>
    </Modal>
  );
}
