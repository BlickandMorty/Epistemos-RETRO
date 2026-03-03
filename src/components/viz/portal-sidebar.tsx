import { useMemo } from 'react';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { useIsDark } from '@/hooks/use-is-dark';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XIcon,
  CodeIcon,
  EyeIcon,
  ChevronLeftIcon,
  FileCodeIcon,
  FileTextIcon,
  ImageIcon,
  DatabaseIcon,
  CopyIcon,
  CheckIcon,
} from 'lucide-react';
import type { PortalArtifact, ArtifactType } from '@/lib/store/slices/portal';

const ARTIFACT_ICONS: Record<ArtifactType, typeof FileCodeIcon> = {
  code: FileCodeIcon,
  document: FileTextIcon,
  html: CodeIcon,
  react: CodeIcon,
  image: ImageIcon,
  data: DatabaseIcon,
  text: FileTextIcon,
};

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  code: 'Code',
  document: 'Document',
  html: 'HTML',
  react: 'React',
  image: 'Image',
  data: 'Data',
  text: 'Text',
};

export function PortalSidebar() {
  const { isDark } = useIsDark();
  const showPortal = usePFCStore((s) => s.showPortal);
  const portalStack = usePFCStore((s) => s.portalStack);
  const portalDisplayMode = usePFCStore((s) => s.portalDisplayMode);
  const closePortal = usePFCStore((s) => s.closePortal);
  const portalGoBack = usePFCStore((s) => s.portalGoBack);
  const setPortalDisplayMode = usePFCStore((s) => s.setPortalDisplayMode);

  const mutedColor = isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';
  const panelBg = isDark ? 'rgba(20,19,24,0.98)' : 'rgba(255,255,255,0.98)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const currentView = useMemo(() => {
    if (portalStack.length === 0) return null;
    return portalStack[portalStack.length - 1];
  }, [portalStack]);

  const artifact = currentView?.artifact;

  if (!showPortal || !artifact) {
    return null;
  }

  const Icon = ARTIFACT_ICONS[artifact.type];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          width: '28rem',
          height: '100vh',
          zIndex: 100,
          background: panelBg,
          backdropFilter: 'blur(20px)',
          borderLeft: `1px solid ${borderColor}`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isDark
            ? '-10px 0 40px rgba(0,0,0,0.5)'
            : '-10px 0 40px rgba(0,0,0,0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '0.875rem 1rem',
            borderBottom: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {/* Back button */}
          {portalStack.length > 1 && (
            <button
              onClick={portalGoBack}
              style={{
                padding: '0.375rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: mutedColor,
              }}
              title="Go back"
            >
              <ChevronLeftIcon style={{ width: 16, height: 16 }} />
            </button>
          )}

          {/* Icon & Title */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '0.5rem',
              background: isDark ? 'rgba(94,158,255,0.15)' : 'rgba(94,158,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5E9EFF',
            }}
          >
            <Icon style={{ width: 16, height: 16 }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {artifact.title}
            </h3>
            <span style={{ fontSize: '0.625rem', color: mutedColor }}>
              {ARTIFACT_LABELS[artifact.type]}
              {artifact.language && ` · ${artifact.language}`}
            </span>
          </div>

          {/* Display mode toggle */}
          <div
            style={{
              display: 'flex',
              borderRadius: '0.375rem',
              overflow: 'hidden',
              border: `1px solid ${borderColor}`,
            }}
          >
            <button
              onClick={() => setPortalDisplayMode('code')}
              style={{
                padding: '0.375rem',
                border: 'none',
                background:
                  portalDisplayMode === 'code'
                    ? isDark
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(0,0,0,0.05)'
                    : 'transparent',
                cursor: 'pointer',
                color: portalDisplayMode === 'code' ? '#5E9EFF' : mutedColor,
              }}
              title="View code"
            >
              <CodeIcon style={{ width: 14, height: 14 }} />
            </button>
            <button
              onClick={() => setPortalDisplayMode('preview')}
              style={{
                padding: '0.375rem',
                border: 'none',
                background:
                  portalDisplayMode === 'preview'
                    ? isDark
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(0,0,0,0.05)'
                    : 'transparent',
                cursor: 'pointer',
                color: portalDisplayMode === 'preview' ? '#5E9EFF' : mutedColor,
              }}
              title="View preview"
            >
              <EyeIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={closePortal}
            style={{
              padding: '0.375rem',
              borderRadius: '0.375rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: mutedColor,
            }}
          >
            <XIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {portalDisplayMode === 'code' ? (
            <CodeView content={artifact.content} isDark={isDark} />
          ) : (
            <PreviewView artifact={artifact} isDark={isDark} />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.5rem 1rem',
            borderTop: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.625rem',
            color: mutedColor,
          }}
        >
          <span>
            {artifact.content.length.toLocaleString()} characters
          </span>
          <span>ID: {artifact.identifier.slice(0, 8)}…</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface CodeViewProps {
  content: string;
  isDark: boolean;
}

function CodeView({ content, isDark }: CodeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Copy button */}
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          padding: '0.375rem 0.625rem',
          borderRadius: '0.375rem',
          border: 'none',
          background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
          cursor: 'pointer',
          color: copied ? '#30D158' : isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
          fontSize: '0.6875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          zIndex: 10,
        }}
      >
        {copied ? (
          <>
            <CheckIcon style={{ width: 12, height: 12 }} /> Copied
          </>
        ) : (
          <>
            <CopyIcon style={{ width: 12, height: 12 }} /> Copy
          </>
        )}
      </button>

      {/* Code content */}
      <pre
        style={{
          margin: 0,
          padding: '1rem',
          fontSize: '0.8125rem',
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono, monospace)',
          color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          minHeight: '100%',
        }}
      >
        <code>{content}</code>
      </pre>
    </div>
  );
}

interface PreviewViewProps {
  artifact: PortalArtifact;
  isDark: boolean;
}

function PreviewView({ artifact, isDark }: PreviewViewProps) {
  const mutedColor = isDark ? 'rgba(156,143,128,0.6)' : 'rgba(0,0,0,0.4)';

  // HTML preview
  if (artifact.type === 'html') {
    return (
      <iframe
        srcDoc={artifact.content}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#fff',
        }}
        sandbox="allow-scripts"
        title={artifact.title}
      />
    );
  }

  // React component preview (simplified - just show as code for now)
  if (artifact.type === 'react') {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: mutedColor,
        }}
      >
        <CodeIcon style={{ width: 32, height: 32, opacity: 0.3, marginBottom: '0.75rem' }} />
        <p style={{ fontSize: '0.8125rem' }}>React component preview</p>
        <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.7 }}>
          Switch to Code view to see the implementation
        </p>
      </div>
    );
  }

  // Image preview
  if (artifact.type === 'image') {
    return (
      <div
        style={{
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <img
          src={artifact.content}
          alt={artifact.title}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: '0.5rem',
            objectFit: 'contain',
          }}
        />
      </div>
    );
  }

  // Data preview
  if (artifact.type === 'data') {
    try {
      const data = JSON.parse(artifact.content);
      return (
        <div style={{ padding: '1rem' }}>
          <pre
            style={{
              margin: 0,
              padding: '1rem',
              borderRadius: '0.5rem',
              background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              overflow: 'auto',
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      );
    } catch {
      return (
        <div style={{ padding: '1rem' }}>
          <pre
            style={{
              margin: 0,
              padding: '1rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono, monospace)',
              color: mutedColor,
            }}
          >
            {artifact.content}
          </pre>
        </div>
      );
    }
  }

  // Default text/document preview
  return (
    <div style={{ padding: '1.5rem' }}>
      <div
        style={{
          fontSize: '0.875rem',
          lineHeight: 1.6,
          color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {artifact.content}
      </div>
    </div>
  );
}

// Import useState for the copy button
import { useState } from 'react';
