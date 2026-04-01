import React, { useState } from 'react';
import { render, Box } from 'ink';
import { ReportList } from './screens/ReportList.js';
import { Generating } from './screens/Generating.js';
import { ReportView } from './screens/ReportView.js';

type Screen =
  | { name: 'list' }
  | { name: 'generating'; date: string }
  | { name: 'view'; date: string };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [error, setError] = useState<string | null>(null);

  switch (screen.name) {
    case 'list':
      return (
        <ReportList
          error={error}
          onGenerate={(date) => {
            setError(null);
            setScreen({ name: 'generating', date });
          }}
          onView={(date) => {
            setError(null);
            setScreen({ name: 'view', date });
          }}
        />
      );
    case 'generating':
      return (
        <Generating
          date={screen.date}
          onComplete={(date) => setScreen({ name: 'view', date })}
          onError={(msg) => {
            setError(msg);
            setScreen({ name: 'list' });
          }}
        />
      );
    case 'view':
      return (
        <ReportView
          date={screen.date}
          onBack={() => setScreen({ name: 'list' })}
          onRegenerate={(date) => setScreen({ name: 'generating', date })}
        />
      );
  }
}

export default function startApp() {
  render(<App />);
}
