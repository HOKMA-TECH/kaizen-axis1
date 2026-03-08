import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LeaderboardEntry, UserAchievement } from '../types/gamification';
import { useApp } from '../context/AppContext';

export function useGamification() {
    const { user } = useApp();
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [myLeaderboardEntry, setMyLeaderboardEntry] = useState<LeaderboardEntry | null>(null);
    const [myAchievements, setMyAchievements] = useState<UserAchievement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchGamificationData() {
            if (!user) return;
            try {
                // Fetch Leaderboard
                const { data: boardData, error: boardError } = await supabase
                    .from('leaderboard')
                    .select('*')
                    .order('ranking_score', { ascending: false })
                    .limit(50);

                if (!boardError && boardData) {
                    setLeaderboard(boardData);
                    const me = boardData.find((entry) => entry.user_id === user.id);
                    if (me) setMyLeaderboardEntry(me as LeaderboardEntry);
                }

                // Fetch User Achievements
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
        }

        fetchGamificationData();
    }, [user]);

    return { leaderboard, myLeaderboardEntry, myAchievements, loading };
}
