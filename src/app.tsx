import { useState } from 'react';
import { render } from 'ink';
import { ReportList } from './screens/ReportList.js';
import { Generating } from './screens/Generating.js';
import { ReportView } from './screens/ReportView.js';
import type { Lang } from './core/formatter.js';

type Screen =
  | { name: 'list' }
  | { name: 'generating'; date: string }
  | { name: 'view'; date: string };

function App({ initialLang }: { initialLang: Lang }) {
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(initialLang);

  const toggleLang = () => setLang((l) => (l === 'zh' ? 'en' : 'zh'));

  switch (screen.name) {
    case 'list':
      return (
        <ReportList
          lang={lang}
          error={error}
          onToggleLang={toggleLang}
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
          lang={lang}
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

export default function startApp(lang: Lang = 'zh') {
  render(<App initialLang={lang} />);
}
