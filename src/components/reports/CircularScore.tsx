import { cn } from '@/lib/utils';

interface CircularScoreProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularScore({ score, size = 40, strokeWidth = 4 }: CircularScoreProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-gold-500';
    return 'text-red-500';
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        <circle
          className="text-surface-200"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={cn("transition-all duration-1000 ease-out", getColor(score))}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className={cn("absolute text-[10px] font-bold", getColor(score))}>
        {score}
      </span>
    </div>
  );
}
