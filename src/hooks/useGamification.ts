import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { LeaderboardEntry, UserAchievement } from '../types/gamification';
import { useApp } from '../context/AppContext';

export function useGamification() {
    const { user } = useApp();
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [myLeaderboardEntry, setMyLeaderboardEntry] = useState<LeaderboardEntry | null>(null);
    const [myAchievements, setMyAchievements] = useState<UserAchievement[]>([]);
    const [loading, setLoading] = useState(true);

    // Keep track of whether we've done the initial load
    const initializedRef = useRef(false);

    const fetchGamificationData = useCallback(async () => {
        if (!user) return;
        try {
            // Fetch leaderboard (view aggregating user_points + sales_events)
            const { data: boardData, error: boardError } = await supabase
                .from('leaderboard')
                .select('*')
                .order('ranking_score', { ascending: false })
                .limit(50);

            if (!boardError && boardData) {
                setLeaderboard(boardData);
                const me = boardData.find((entry) => entry.user_id === user.id);
                setMyLeaderboardEntry(me ? (me as LeaderboardEntry) : null);
            }

            // Fetch achievements
            const { data: achData, error: achError } = await supabase
                .from('user_achievements')
                .select('*, achievements(*)')
                .eq('user_id', user.id)
                .order('unlocked_at', { ascending: false });

            if (!achError && achData) {
                setMyAchievements(achData as UserAchievement[]);
            }
        } catch (err) {
            console.error('Error fetching gamification data:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Initial fetch
    useEffect(() => {
        if (!user) return;
        initializedRef.current = false;
        fetchGamificationData().then(() => { initializedRef.current = true; });
    }, [user, fetchGamificationData]);

    // ── Realtime: re-fetch when XP or achievements change ───────────────────
    useEffect(() => {
        if (!user) return;

        // Subscribe to user_points — any INSERT means XP was awarded
        const pointsChannel = supabase
            .channel('gamification:user_points')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_points',
                    filter: `user_id=eq.${user.id}`,
                },
                () => { fetchGamificationData(); }
            )
            .subscribe();

        // Subscribe to user_achievements — any INSERT means new badge
        const achChannel = supabase
            .channel('gamification:user_achievements')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_achievements',
                    filter: `user_id=eq.${user.id}`,
                },
                () => { fetchGamificationData(); }
            )
            .subscribe();

        // Subscribe to system_events for goal/mission completion
        // (so leaderboard score updates even when XP goes to another user via global goals)
        const eventsChannel = supabase
            .channel('gamification:system_events')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'system_events',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload: any) => {
                    const t = payload.new?.type;
                    if (
                        t === 'goal_achieved' ||
                        t === 'mission_completed' ||
                        t === 'sale_completed' ||
                        t === 'achievement_unlocked'
                    ) {
                        fetchGamificationData();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(pointsChannel);
            supabase.removeChannel(achChannel);
            supabase.removeChannel(eventsChannel);
        };
    }, [user, fetchGamificationData]);

    return { leaderboard, myLeaderboardEntry, myAchievements, loading, refresh: fetchGamificationData };
}
