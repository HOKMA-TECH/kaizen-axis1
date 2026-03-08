import React from 'react';
import { Trophy, Medal, Flame, TrendingUp } from 'lucide-react';
import { useGamification } from '../../hooks/useGamification';

export function LeaderboardPanel() {
    const { leaderboard, loading } = useGamification();

    if (loading) {
        return (
            <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-6 flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-br from-indigo-50 to-white">
                <div className="flex items-center space-x-3 mb-2">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                        <Trophy className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">Ranking Global</h2>
                </div>
                <p className="text-sm text-gray-500">
                    Posição baseada em valor de vendas, pontos e consistência (Streaks).
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {leaderboard.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 flex flex-col items-center">
                        <Trophy className="w-12 h-12 text-gray-300 mb-3" />
                        <p>Nenhuma venda registrada no ranking ainda.</p>
                    </div>
                ) : (
                    leaderboard.map((entry, index) => {
                        const isTop3 = index < 3;
                        return (
                            <div
                                key={entry.user_id}
                                className={`relative flex items-center p-4 rounded-xl border transition-all duration-300 hover:shadow-md ${index === 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50/50 border-amber-200' :
                                        index === 1 ? 'bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200' :
                                            index === 2 ? 'bg-gradient-to-r from-orange-50 to-amber-50/30 border-orange-200' :
                                                'bg-white border-gray-100 hover:border-indigo-100'
                                    }`}
                            >
                                {/* Pos */}
                                <div className="w-10 flex-shrink-0 flex flex-col items-center justify-center">
                                    {index === 0 ? <Medal className="w-6 h-6 text-amber-500" /> :
                                        index === 1 ? <Medal className="w-6 h-6 text-slate-400" /> :
                                            index === 2 ? <Medal className="w-6 h-6 text-orange-400" /> :
                                                <span className="text-lg font-bold text-gray-400">#{index + 1}</span>}
                                </div>

                                {/* Avatar & Name */}
                                <div className="ml-2 flex items-center flex-1">
                                    {entry.avatar_url ? (
                                        <img src={entry.avatar_url} alt={entry.user_name} className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover" />
                                    ) : (
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-orange-400' : 'bg-gray-300'
                                            }`}>
                                            {entry.user_name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="ml-3">
                                        <p className={`font-semibold ${isTop3 ? 'text-gray-900' : 'text-gray-700'}`}>
                                            {entry.user_name}
                                        </p>
                                        <div className="flex items-center text-xs space-x-3 mt-0.5">
                                            <span className="flex items-center text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded-md">
                                                {entry.total_points.toLocaleString()} pts
                                            </span>
                                            {entry.current_streak > 1 && (
                                                <span className="flex items-center text-orange-600 font-medium bg-orange-50 px-1.5 py-0.5 rounded-md" title={`Streak de ${entry.current_streak} dias diretos!`}>
                                                    <Flame className="w-3 h-3 mr-1" /> {entry.current_streak} dias
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Score & Volume */}
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-indigo-700">
                                        {Math.floor(entry.ranking_score).toLocaleString()} Score
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 flex items-center justify-end">
                                        <TrendingUp className="w-3 h-3 mr-1" />
                                        R$ {(entry.total_value / 1000).toFixed(0)}k vol.
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
