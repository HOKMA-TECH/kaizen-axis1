import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from './AppContext';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    target_user_id: string | null;
    target_role: string | null;
    directorate_id: string | null;
    reference_id: string | null;
    reference_route: string | null;
    is_read: boolean;
    created_at: string;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    deleteAllNotifications: () => Promise<void>;
    loading: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { profile, loading: appLoading } = useApp();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    useEffect(() => {
        // Only initialized if we have a valid auth profile
        if (appLoading || !profile?.id) {
            setNotifications([]);
            setLoading(false);
            return;
        }

        let isMounted = true;

        const fetchNotifications = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('is_read', false)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;

                const role = profile.role?.toUpperCase();
                const isLeadership = role === 'ADMIN' || role === 'DIRETOR';

                const filtered = (data as Notification[]).filter(n => {
                    // ADMIN e DIRETOR não recebem notificações de chat de terceiros
                    if (isLeadership && n.type === 'chat' && n.target_user_id !== profile.id) return false;
                    return true;
                });

                if (isMounted) {
                    setNotifications(filtered);
                }
            } catch (error) {
                console.error('Error fetching notifications:', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchNotifications();

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                },
                (payload) => {
                    if (!isMounted) return;

                    if (payload.eventType === 'INSERT') {
                        const newNotif = payload.new as Notification;

                        // Client-side verification is strictly required here because Supabase Realtime
                        // might drop payloads if RLS involves complex joins (like checking profiles table for role).
                        const isForMe = newNotif.target_user_id === profile.id;
                        const isForMyRole = newNotif.target_role === profile.role;
                        const isForMyDirectorate = Boolean(newNotif.directorate_id && newNotif.directorate_id === profile.directorate_id);
                        const isAdmin = profile.role === 'ADMIN';
                        const role = profile.role?.toUpperCase();
                        const isLeadership = role === 'ADMIN' || role === 'DIRETOR';

                        // ADMIN e DIRETOR não recebem notificações de chat de terceiros
                        if (isLeadership && newNotif.type === 'chat' && !isForMe) return;

                        if (isForMe || isForMyRole || isForMyDirectorate || isAdmin) {
                            setNotifications((prev) => {
                                // Prevent duplicates just in case
                                if (prev.some(n => n.id === newNotif.id)) return prev;
                                return [newNotif, ...prev];
                            });
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedNotif = payload.new as Notification;
                        // If notification became read, remove it from list (fetch only shows unread)
                        if (updatedNotif.is_read) {
                            setNotifications((prev) => prev.filter((n) => n.id !== updatedNotif.id));
                        } else {
                            setNotifications((prev) =>
                                prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n))
                            );
                        }
                    } else if (payload.eventType === 'DELETE') {
                        setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(subscription);
        };
    }, [profile?.id, profile?.role, profile?.directorate_id, appLoading]);

    const markAsRead = async (id: string) => {
        try {
            // Optimistic UI update
            setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
            const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error('Error marking as read:', error);
            // Rollback optimism could be implemented here
        }
    };

    const markAllAsRead = async () => {
        if (!profile?.id) return;
        try {
            const idsToMark = notifications.filter(n => !n.is_read).map(n => n.id);
            if (idsToMark.length === 0) return;

            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', idsToMark);

            if (error) throw error;
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    };

    const deleteNotification = async (id: string) => {
        try {
            // Optimistic UI update
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            // Mark as read so it won't come back on next fetch (is_read filter)
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', id);
            if (error) throw error;
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };

    const deleteAllNotifications = async () => {
        if (!profile?.id) return;
        try {
            const ids = notifications.map((n) => n.id);
            if (ids.length === 0) return;

            // Optimistic UI: clear immediately
            setNotifications([]);

            // Use .in('id', ids) with the exact IDs visible to this user.
            // These IDs already passed SELECT RLS, so UPDATE with .in() also passes.
            // Using .eq('is_read', false) without id filter was silently blocked by
            // RLS for role-targeted notifications (target_user_id = null).
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .in('id', ids);

            if (error) throw error;
        } catch (error) {
            console.error('Error clearing all notifications:', error);
        }
    };

    return (
        <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications, loading }}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
