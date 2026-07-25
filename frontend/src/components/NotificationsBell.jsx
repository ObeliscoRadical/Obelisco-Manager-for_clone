import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X, MessageSquare, Calendar, Truck, Receipt } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

const TYPE_ICON = {
  chat: MessageSquare,
  agenda: Calendar,
  guide: Truck,
  invoice: Receipt,
};

const TYPE_COLOR = {
  chat: 'text-blue-400',
  agenda: 'text-emerald-400',
  guide: 'text-amber-400',
  invoice: 'text-red-400',
};

function timeAgo(iso) {
  if (!iso) return '';
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff/60)} min`;
    if (diff < 86400) return `${Math.floor(diff/3600)} h`;
    return `${Math.floor(diff/86400)} d`;
  } catch { return ''; }
}

/**
 * Sino de notificações + dropdown. Use isTech=true para o portal técnico.
 */
export default function NotificationsBell({ isTech = false }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { items, unread, markRead, markAllRead, removeOne, refresh } = useNotifications({ isTech });

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const openNotification = async (n) => {
    if (!n.read) await markRead(n.id);
    if (n.link) nav(n.link);
    setOpen(false);
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="notifications-bell"
        onClick={toggleOpen}
        className="relative p-2 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            data-testid="notifications-badge"
            className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notifications-dropdown"
          className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 flex flex-col max-h-[70vh]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-yellow-400" />
              <p className="text-sm font-semibold text-white">Notificações</p>
              {unread > 0 && <span className="text-[10px] text-zinc-500">({unread} não lidas)</span>}
            </div>
            {items.length > 0 && (
              <button
                data-testid="notifications-mark-all"
                onClick={markAllRead}
                className="text-[11px] text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-zinc-900">
            {items.length === 0 && (
              <p className="text-xs text-zinc-500 italic text-center py-10" data-testid="notifications-empty">
                Sem notificações.
              </p>
            )}
            {items.map((n) => {
              const Icon = TYPE_ICON[n.type] || Bell;
              const color = TYPE_COLOR[n.type] || 'text-zinc-400';
              return (
                <div
                  key={n.id}
                  data-testid={`notification-${n.id}`}
                  className={`group px-4 py-3 flex gap-3 hover:bg-zinc-900/60 transition-colors cursor-pointer ${n.read ? 'opacity-60' : ''}`}
                  onClick={() => openNotification(n)}
                >
                  <div className={`shrink-0 h-8 w-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${n.read ? 'text-zinc-400' : 'text-white font-medium'}`}>{n.title}</p>
                      <span className="text-[10px] text-zinc-500 shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2">{n.message}</p>
                  </div>
                  {!isTech && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeOne(n.id); }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity shrink-0"
                      title="Remover"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
