const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'client_created'
  | 'client_updated'
  | 'client_deleted'
  | 'client_view'
  | 'document_uploaded'
  | 'document_deleted'
  | 'document_downloaded'
  | 'permissions_updated'
  | 'lead_converted'
  | 'sale_updated'
  | 'custom';

export interface AuditEventInput {
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

class AuditLogger {
  private endpoint: string | null;

  constructor() {
    this.endpoint = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/audit-log` : null;
  }

  log(event: AuditEventInput) {
    if (!this.endpoint || !event.action || !event.entity) {
      return;
    }

    const payload = {
      action: event.action,
      entity: event.entity,
      entityId: event.entityId ?? null,
      userId: event.userId ?? null,
      metadata: event.metadata ?? {},
      emittedAt: new Date().toISOString(),
    };

    queueMicrotask(() => this.dispatch(payload));
  }

  private dispatch(payload: any) {
    if (!this.endpoint) return;

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && SUPABASE_ANON_KEY) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(this.endpoint, blob);
        return;
      }
    } catch {
      // Ignora e tenta o fallback abaixo
    }

    if (typeof fetch === 'function') {
      fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        },
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.warn('[audit] Falha ao enviar evento', err);
      });
    }
  }
}

export const auditLogger = new AuditLogger();
export const logAuditEvent = (input: AuditEventInput) => auditLogger.log(input);
