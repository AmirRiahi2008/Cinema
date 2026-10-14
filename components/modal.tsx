"use client";
import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export function Modal({ title, subtitle, onClose, children, wide = false }: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null), titleId = useId();
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const getTargets = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex='0']") || []).filter(v => v.tabIndex >= 0 && v.getClientRects().length);
        getTargets().find(v => v.tagName === "INPUT")?.focus();
        if (!ref.current?.contains(document.activeElement))
            ref.current?.focus();
        function key(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                close.current();
            }
            if (event.key === "Tab") {
                const nodes = getTargets(), first = nodes[0], last = nodes[nodes.length - 1];
                if (!first) {
                    event.preventDefault();
                    return;
                }
                if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
                    event.preventDefault();
                    last.focus();
                }
                else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("keydown", key); document.body.style.overflow = previous; before?.focus(); };
    }, []);
    return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget)
        onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`modal ${wide ? "modal-wide" : ""}`}>
      <div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="بستن" onClick={onClose}><X size={20}/></button></div>
      {children}
    </div>
  </div>;
}
