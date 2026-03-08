import React from 'react';
import { Flame, Star, Trophy, Target, Shield, Award } from 'lucide-react';
import { useGamification } from '../../hooks/useGamification';

export function GamificationProfile() {
    const { myLeaderboardEntry, myAchievements, loading } = useGamification();

    if (loading) {
        return (
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-6 flex items-center justify-center min-h-[150px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    const points = myLeaderboardEntry?.total_points || 0;
    const streak = myLeaderboardEntry?.current_streak || 0;
    const score = myLeaderboardEntry?.ranking_score || 0;

    let RankIcon = Shield;
    let rankColor = 'text-slate-400';
    let rankLabel = 'Iniciante';

    if (score > 5000) {
        RankIcon = Trophy;
        rankColor = 'text-amber-500';
        rankLabel = 'Elite Ouro';
    } else if (score > 1000) {
        RankIcon = Star;
        rankColor = 'text-emerald-500';
        rankLabel = 'Profissional Prata';
    } else if (score > 100) {
        RankIcon = Target;
        rankColor = 'text-blue-500';
        rankLabel = 'Corretor Ativo';
    }

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">

                    {/* Rank & Pontos */}
                    <div className="flex items-center space-x-4 flex-1">
                        <div className={`p-4 rounded-2xl bg-gray-50 flex items-center justify-center ${rankColor} shadow-inner`}>
                            <RankIcon className="w-10 h-10" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Rank Atual</p>
                            <h3 className={`text-2xl font-black ${rankColor}`}>{rankLabel}</h3>
                            <p className="text-gray-600 font-medium">{points.toLocaleString()} Pontos XP</p>
                        </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="flex items-center justify-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 w-full md:w-auto">
                        <div className="flex flex-col items-center px-4">
                            <span className="text-xs text-gray-500 font-medium uppercase mb-1">Score Global</span>
                            <span className="text-xl font-bold text-indigo-700">{Math.floor(score).toLocaleString()}</span>
                        </div>
                        <div className="w-px h-10 bg-gray-200"></div>
                        <div className="flex flex-col items-center px-4">
                            <span className="text-xs text-gray-500 font-medium uppercase mb-1 flex items-center">
                                <Flame className="w-3 h-3 mr-1 text-orange-500" /> Dias Seguidos
                            </span>
                            <span className="text-xl font-bold text-orange-600">{streak}</span>
                        </div>
                    </div>
                </div>

                {/* Conquistas Recentes */}
                {myAchievements.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide flex items-center">
                                <Award className="w-4 h-4 mr-2 text-amber-500" />
                                Minhas Conquistas ({myAchievements.length})
                            </h4>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {myAchievements.slice(0, 5).map((userAch) => (
                                <div
                                    key={userAch.id}
                                    className="group relative flex items-center px-3 py-2 bg-gradient-to-br from-amber-50 to-amber-100/30 border border-amber-200 rounded-lg hover:shadow-md transition-all cursor-default"
                                >
                                    <Star className="w-4 h-4 text-amber-500 mr-2" />
                                    <span className="text-sm font-semibold text-gray-800">{userAch.achievements?.title || 'Conquista'}</span>

                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 text-center pointer-events-none">
                                        <p className="text-xs text-white pb-1">{userAch.achievements?.description}</p>
                                        <p className="text-[10px] text-gray-400 border-t border-gray-700 pt-1 mt-1">
                                            Desbloqueado em: {new Date(userAch.unlocked_at).toLocaleDateString()}
                                        </p>
                                        {/* Arrow for Tooltip */}
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                    </div>
                                </div>
                            ))}
                            {myAchievements.length > 5 && (
                                <div className="flex items-center justify-center px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-600">
                                    +{myAchievements.length - 5}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
