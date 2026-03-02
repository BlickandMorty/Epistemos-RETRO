import { SettingsIcon } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { InferenceSection } from '@/components/settings/inference-section';
import { AppearanceSection } from '@/components/settings/appearance-section';
import { SOARSection } from '@/components/settings/soar-section';
import { ServicesSection } from '@/components/settings/services-section';
import { CostSection } from '@/components/settings/cost-section';
import { DataSection } from '@/components/settings/data-section';
import { AdvancedSection } from '@/components/settings/advanced-section';

export default function SettingsPage() {
  return (
    <PageShell icon={SettingsIcon} title="Settings">
      <InferenceSection />
      <AppearanceSection />
      <SOARSection />
      <ServicesSection />
      <CostSection />
      <DataSection />
      <AdvancedSection />
    </PageShell>
  );
}
