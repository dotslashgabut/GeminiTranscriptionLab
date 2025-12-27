
import React from 'react';

const SkeletonLoader: React.FC = () => {
  return (
    <div className="space-y-4 p-4 animate-pulse w-full">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-slate-200 rounded w-1/4"></div>
          <div className="h-4 bg-slate-200 rounded w-full"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
