import { useCallback } from 'react';

const ICONS = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

export default function Toast({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <div className="toast-icon">{ICONS[toast.type]}</div>
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => onRemove(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
