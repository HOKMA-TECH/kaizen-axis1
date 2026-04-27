import React from 'react';
import { Flame, Star, Trophy, Target, Shield, Award, Zap } from 'lucide-react';
import { useGamification } from '../../hooks/useGamification';
import { PremiumCard } from '../ui/PremiumComponents';

export function GamificationProfile() {
    const { myLeaderboardEntry, myAchievements, loading } = useGamification();

    if (loading) {
        return (
            <PremiumCard className="p-5 flex items-center justify-center min-h-[96px]">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gold-500" />
            </PremiumCard>
        );
    }

    const points = myLeaderboardEntry?.total_points || 0;
    const streak = myLeaderboardEntry?.current_streak || 0;
    const score = myLeaderboardEntry?.ranking_score || 0;

    let RankIcon = Shield;
    let rankGradient = 'from-surface-200 to-surface-100';
    let rankIconColor = 'text-text-secondary';
    let rankLabel = 'Iniciante';
    let rankBadgeClass = 'text-text-secondary bg-surface-100';

    if (score > 5000) {
        RankIcon = Trophy;
        rankGradient = 'from-gold-100 to-amber-50';
        rankIconColor = 'text-gold-500';
        rankLabel = 'Elite Ouro';
        rankBadgeClass = 'text-gold-600 bg-gold-50 border border-gold-200';
    } else if (score > 1000) {
        RankIcon = Star;
        rankGradient = 'from-emerald-50 to-teal-50';
        rankIconColor = 'text-emerald-500';
        rankLabel = 'Profissional';
        rankBadgeClass = 'text-emerald-600 bg-emerald-50 border border-emerald-200';
    } else if (score > 100) {
        RankIcon = Target;
        rankGradient = 'from-blue-50 to-indigo-50';
        rankIconColor = 'text-blue-500';
        rankLabel = 'Corretor Ativo';
        rankBadgeClass = 'text-blue-600 bg-blue-50 border border-blue-200';
    }

    return (
        <div className="space-y-3">
            {/* ── Main rank card ─────────────────────────────────────── */}
            <PremiumCard className="p-4">
                <div className="flex items-center gap-4">
                    {/* Rank Icon */}
                    <div className={`flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${rankGradient} flex items-center justify-center shadow-sm`}>
                        <RankIcon className={`w-7 h-7 ${rankIconColor}`} />
                    </div>

                    {/* Rank Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-0.5">Rank Atual</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`text-lg font-black leading-none ${rankIconColor}`}>{rankLabel}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rankBadgeClass}`}>
                                {points.toLocaleString('pt-BR')} XP
                            </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-1">Score: {Math.floor(score).toLocaleString('pt-BR')}</p>
                    </div>

                    {/* Streak */}
                    <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1">
                            <Flame className="w-4 h-4 text-orange-500" />
                            <span className="text-xl font-black text-orange-500 leading-none">{streak}</span>
                        </div>
                        <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-wide">Streak</span>
                    </div>
                </div>
            </PremiumCard>

            {/* ── Achievements ───────────────────────────────────────── */}
            {myAchievements.length > 0 && (
                <PremiumCard className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Award className="w-4 h-4 text-gold-500" />
                        <h4 className="text-xs font-bold text-text-primary uppercase tracking-wide">
                            Conquistas ({myAchievements.length})
                        </h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {myAchievements.slice(0, 5).map((userAch) => (
                            <div
                                key={userAch.id}
                                title={userAch.achievements?.description}
                                className="group relative flex items-center gap-1.5 px-2.5 py-1.5 bg-gold-50 dark:bg-gold-900/10 border border-gold-200 dark:border-gold-800 rounded-xl text-xs font-semibold text-gold-700 dark:text-gold-400 hover:bg-gold-100 transition-colors cursor-default"
                            >
                                <Star className="w-3 h-3 text-gold-500" />
                                {userAch.achievements?.title || 'Conquista'}
                            </div>
                        ))}
                        {myAchievements.length > 5 && (
                            <div className="flex items-center justify-center px-2.5 py-1.5 bg-surface-100 border border-surface-200 rounded-xl text-xs font-semibold text-text-secondary">
                                <Zap className="w-3 h-3 mr-1" />+{myAchievements.length - 5}
                            </div>
                        )}
                    </div>
                </PremiumCard>
            )}
        </div>
    );
}
