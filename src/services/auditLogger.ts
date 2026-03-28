import { supabase } from '@/lib/supabase';

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
  log(event: AuditEventInput) {
    if (!event.action || !event.entity) return;
    // Assíncrono — nunca bloqueia o fluxo principal
    queueMicrotask(() => this.dispatch(event));
  }

  private async dispatch(event: AuditEventInput) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = event.userId ?? session?.user?.id ?? null;

      const { error } = await supabase.from('audit_logs').insert({
        user_id: userId,
        action: String(event.action).slice(0, 80),
        entity: String(event.entity).slice(0, 80),
        entity_id: event.entityId ?? null,
        metadata: {
          ...(event.metadata ?? {}),
          // Inclui info do dispositivo automaticamente
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
      });

      if (error) {
        console.warn('[audit] Falha ao gravar evento:', error.message);
      }
    } catch (err) {
      console.warn('[audit] Erro ao gravar evento', err);
    }
  }
}

export const auditLogger = new AuditLogger();
export const logAuditEvent = (input: AuditEventInput) => auditLogger.log(input);
