import { Section } from '@/components/layout/page-shell';
import { GlassBubbleButton } from '@/components/chat/glass-bubble-button';
import { useTheme } from '@/hooks/use-theme';
import { useIsDark } from '@/hooks/use-is-dark';
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  SparklesIcon,
  SunsetIcon,
  EclipseIcon,
  FlameIcon,
} from 'lucide-react';

const THEMES: { id: string; label: string; icon: React.ElementType }[] = [
  { id: 'light', label: 'Light', icon: SunIcon },
  { id: 'dark', label: 'Dark', icon: MoonIcon },
  { id: 'oled', label: 'OLED', icon: EclipseIcon },
  { id: 'cosmic', label: 'Cosmic', icon: SparklesIcon },
  { id: 'sunny', label: 'Sunny', icon: FlameIcon },
  { id: 'sunset', label: 'Sunset', icon: SunsetIcon },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { isDark, isOled } = useIsDark();

  const isSystem = theme === 'system';
  const mutedColor = isOled ? 'rgba(160,160,160,0.6)' : isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  return (
    <Section title="Appearance">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem',
        marginBottom: '0.75rem',
      }}>
        {THEMES.map((t) => {
          const Icon = t.icon;
          return (
            <GlassBubbleButton
              key={t.id}
              active={theme === t.id}
              onClick={() => setTheme(t.id)}
              size="md"
              fullWidth
            >
              <Icon style={{ width: 14, height: 14 }} />
              {t.label}
            </GlassBubbleButton>
          );
        })}
      </div>

      {/* System auto toggle */}
      <GlassBubbleButton
        active={isSystem}
        onClick={() => setTheme(isSystem ? 'dark' : 'system')}
        size="md"
        fullWidth
      >
        <MonitorIcon style={{ width: 14, height: 14 }} />
        System Auto
      </GlassBubbleButton>

      {isSystem && (
        <p style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '0.5rem' }}>
          Following OS appearance preference
        </p>
      )}
    </Section>
  );
}
