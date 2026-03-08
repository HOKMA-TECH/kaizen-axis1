export interface LeaderboardEntry {
    user_id: string;
    user_name: string;
    avatar_url: string | null;
    total_sales: number;
    total_value: number;
    total_points: number;
    current_streak: number;
    longest_streak: number;
    ranking_score: number;
}

export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string;
    condition_type: string;
    condition_value: number;
    created_at: string;
}

export interface UserAchievement {
    id: string;
    user_id: string;
    achievement_id: string;
    unlocked_at: string;
    achievements?: Achievement;
}

export interface SystemEvent {
    id: string;
    type: 'sale_completed' | 'goal_achieved' | 'mission_completed' | 'achievement_unlocked';
    user_id: string;
    payload: any;
    created_at: string;
}
