import React from 'react';

interface MatchGaugeProps {
  score: number; // 0..100
  size?: number;
  label?: string;
}

export const MatchGauge: React.FC<MatchGaugeProps> = ({
  score,
  size = 140,
  label = 'ATS Match Score',
}) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score >= 80) return '#10B981'; // Emerald
    if (score >= 65) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-800"
            fill="transparent"
          />
          {/* Animated Value Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getColor()}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {score}%
          </span>
          <span className="text-[10px] text-slate-400 font-medium">MATCH</span>
        </div>
      </div>
      {label && <span className="mt-2 text-xs font-medium text-slate-500">{label}</span>}
    </div>
  );
};
