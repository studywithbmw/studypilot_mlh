import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';

interface RubricRadarProps {
  scores: {
    clarity: number;
    depth: number;
    structure: number;
    confidence: number;
  };
}

export const RubricRadar: React.FC<RubricRadarProps> = ({ scores }) => {
  const data = [
    { subject: 'Clarity', score: scores.clarity, fullMark: 100 },
    { subject: 'Depth', score: scores.depth, fullMark: 100 },
    { subject: 'Structure', score: scores.structure, fullMark: 100 },
    { subject: 'Confidence', score: scores.confidence, fullMark: 100 },
  ];

  return (
    <div className="w-full h-56 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid stroke="#334155" opacity={0.3} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
          />
          <Radar
            name="Interview Performance"
            dataKey="score"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.25}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
