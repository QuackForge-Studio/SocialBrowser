import React from 'react';

export function AnalyticsView() {
  return (
    <div>
      <h2>Analytics</h2>
      <p>
        Engagement trends, timing heatmap, and performance insights will appear here
        once you have captured posts.
      </p>
      <div className="empty-state" style={{ marginTop: 40 }}>
        <p>Insufficient data — capture at least 3 posts to see analytics.</p>
      </div>
    </div>
  );
}
