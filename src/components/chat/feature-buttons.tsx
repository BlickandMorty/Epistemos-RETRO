'use client';

import { useRef, useCallback, memo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ImagePlusIcon,
  TelescopeIcon,
  BookOpenIcon,
  FlaskConicalIcon,
} from 'lucide-react';
import { usePFCStore } from '@/lib/store/use-pfc-store';

import { spring } from '@/lib/motion/motion-config';

/* M3 emphasized easing for staggered entrance */
const BTN_SPRING = spring.bouncy;

interface FeatureButtonsProps {
  isDark: boolean;
  isSunny?: boolean;
  onSubmit: (query: string) => void;
}

interface FeatureBtn {
  icon: React.ElementType;
  label: string;
  action: 'upload' | 'deep-research' | 'literature' | 'hypothesis';
}

const FEATURES: FeatureBtn[] = [
  { icon: ImagePlusIcon, label: 'Upload File', action: 'upload' },
  { icon: TelescopeIcon, label: 'Deep Research', action: 'deep-research' },
  { icon: BookOpenIcon, label: 'Literature Review', action: 'literature' },
  { icon: FlaskConicalIcon, label: 'Test Hypothesis', action: 'hypothesis' },
];

function fileTypeFromMime(mime: string): 'image' | 'csv' | 'pdf' | 'text' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('csv') || mime.includes('tab-separated')) return 'csv';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

/* Octa-style feature chip with hover shadow + border highlight */
function FeatureChip({ feat, index, isDark, isSunny, onClick }: {
  feat: FeatureBtn;
  index: number;
  isDark: boolean;
  isSunny?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = feat.icon;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...BTN_SPRING, delay: index * 0.04 }}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4375rem',
        padding: '0.4375rem 0.875rem',
        borderRadius: 'var(--shape-full)',
        border: `1px solid ${
          hovered
            ? (isDark ? 'rgba(var(--pfc-accent-rgb), 0.2)' : isSunny ? 'var(--border)' : 'rgba(0,0,0,0.06)')
            : (isDark ? 'var(--border)' : isSunny ? 'var(--border)' : 'rgba(0,0,0,0.04)')
        }`,
        background: isDark
          ? (hovered ? 'var(--glass-hover)' : 'var(--pfc-surface-dark)')
          : isSunny
            ? (hovered ? 'var(--secondary)' : 'var(--card)')
            : (hovered ? '#FFFFFF' : 'rgba(255,255,255,0.92)'),
        color: hovered
          ? (isDark ? 'rgba(232,228,222,0.95)' : isSunny ? 'var(--foreground)' : 'rgba(0,0,0,0.8)')
          : (isDark ? 'rgba(155,150,137,0.75)' : isSunny ? 'var(--muted-foreground)' : 'rgba(0,0,0,0.5)'),
        cursor: 'pointer',
        fontSize: 'var(--type-label-md)',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.01em',
        boxShadow: isDark ? 'none' : isSunny ? 'none' : '0 1px 3px rgba(0,0,0,0.04), 0 1px 6px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
      }}
    >
      <Icon style={{
        height: '0.8125rem',
        width: '0.8125rem',
        flexShrink: 0,
        color: hovered ? (isDark ? '#C4956A' : isSunny ? 'var(--pfc-accent)' : 'rgba(0,0,0,0.7)') : 'inherit',
        transition: 'color 0.15s',
      }} />
      {feat.label}
    </motion.button>
  );
}

export const FeatureButtons = memo(function FeatureButtons({ isDark, isSunny, onSubmit }: FeatureButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachment = usePFCStore((s) => s.addAttachment);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0]!;
    const reader = new FileReader();

    reader.onload = () => {
      const uri = reader.result as string;
      const mimeType = file.type || 'application/octet-stream';

      addAttachment({
        id: crypto.randomUUID(),
        name: file.name,
        type: fileTypeFromMime(mimeType),
        uri,
        size: file.size,
        mimeType,
      });

      onSubmit(`Analyze this uploaded file: ${file.name}`);
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onSubmit, addAttachment]);

  const handleClick = useCallback((action: string) => {
    switch (action) {
      case 'upload':
        fileInputRef.current?.click();
        break;
      case 'deep-research':
        onSubmit(
          '[DEEP RESEARCH MODE] I want a comprehensive, long-form research analysis on the topic I will describe. ' +
          'Execute the following protocol:\n\n' +
          '1. SCOPE: Define the research question precisely. Identify 3-5 sub-questions that must be answered to address the main question.\n' +
          '2. EVIDENCE MAP: For each sub-question, identify the strongest available evidence. Cite specific studies, meta-analyses, or data sources. ' +
          'Rate each piece of evidence (strong/moderate/weak) and explain why.\n' +
          '3. COMPETING FRAMEWORKS: Identify at least 2 fundamentally different ways experts think about this topic. ' +
          'Steel-man each framework — present it at its strongest.\n' +
          '4. SYNTHESIS: Reconcile the evidence across frameworks. Where do they agree? Where do they genuinely conflict? ' +
          'What would change your conclusion?\n' +
          '5. UNCERTAINTY AUDIT: Explicitly state what you don\'t know, what nobody knows, and what we\'d need to find out. ' +
          'Calibrate your confidence with concrete anchors.\n' +
          '6. IMPLICATIONS: What does this mean practically? Who should care? What action should someone take based on this analysis?\n\n' +
          'Be thorough, detailed, and intellectually honest. This should read like a research briefing, not a summary. Go deep.'
        );
        break;
      case 'literature':
        onSubmit(
          '[LITERATURE REVIEW MODE] Conduct a systematic literature review with the following structure:\n\n' +
          '1. Define the search scope and inclusion criteria\n' +
          '2. Identify key studies, meta-analyses, and systematic reviews\n' +
          '3. Report effect sizes (Cohen\'s d, odds ratios, risk ratios) with confidence intervals\n' +
          '4. Assess heterogeneity (I\u00B2) across studies\n' +
          '5. Identify publication bias risks and methodological limitations\n' +
          '6. Synthesize findings with calibrated confidence levels\n\n' +
          'I will describe the topic next.'
        );
        break;
      case 'hypothesis':
        onSubmit(
          '[HYPOTHESIS TESTING MODE] Help me formulate and rigorously test a research hypothesis:\n\n' +
          '1. Formalize the hypothesis (H0 and H1)\n' +
          '2. Identify what evidence would support vs. refute it\n' +
          '3. Evaluate existing evidence using Bayesian reasoning\n' +
          '4. Identify the strongest counterargument\n' +
          '5. Assess the hypothesis on a confidence scale with calibration anchors\n\n' +
          'I will describe my hypothesis next.'
        );
        break;
    }
  }, [onSubmit]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.csv,.tsv,.json,.txt,.pdf,.xlsx,.xls,.doc,.docx"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}>
        {FEATURES.map((feat, i) => {
          return (
            <FeatureChip
              key={feat.action}
              feat={feat}
              index={i}
              isDark={isDark}
              isSunny={isSunny}
              onClick={() => handleClick(feat.action)}
            />
          );
        })}
      </div>
    </>
  );
});
