'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsDark } from '@/hooks/use-is-dark';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import type { Vault } from '@/lib/notes/types';
import {
  FolderOpenIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ChevronRightIcon,
  FolderIcon,
  XIcon,
  CheckIcon,
} from 'lucide-react';

import { ease } from '@/lib/motion/motion-config';

const CUPERTINO = ease.cupertino;

interface VaultPickerProps {
  onClose?: () => void;
}

export const VaultPicker = memo(function VaultPicker({ onClose }: VaultPickerProps) {
  const { isDark } = useIsDark();

  const vaults = usePFCStore((s) => s.vaults);
  const activeVaultId = usePFCStore((s) => s.activeVaultId);
  const createVault = usePFCStore((s) => s.createVault);
  const switchVault = usePFCStore((s) => s.switchVault);
  const deleteVault = usePFCStore((s) => s.deleteVault);
  const renameVault = usePFCStore((s) => s.renameVault);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelectVault = useCallback((vaultId: string) => {
    switchVault(vaultId);
    onClose?.();
  }, [switchVault, onClose]);

  const handleCreate = useCallback(() => {
    const name = newName.trim() || 'New Vault';
    const id = createVault(name);
    switchVault(id);
    setCreating(false);
    setNewName('');
    onClose?.();
  }, [newName, createVault, switchVault, onClose]);

  const handleRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameVault(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renameVault]);

  const glassBackground = isDark
    ? 'rgba(20,19,17,0.97)'
    : 'rgba(248,244,238,0.97)';
  const cardBg = isDark
    ? 'rgba(35,32,28,0.95)'
    : 'rgba(255,255,255,0.95)';
  const border = isDark
    ? 'rgba(79,69,57,0.3)'
    : 'rgba(208,196,180,0.3)';
  const text = isDark
    ? 'rgba(237,224,212,0.95)'
    : 'rgba(28,27,31,0.9)';
  const muted = isDark
    ? 'rgba(156,143,128,0.5)'
    : 'rgba(0,0,0,0.35)';
  const accent = 'var(--pfc-accent)';

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-vault-picker)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: glassBackground,
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: CUPERTINO }}
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '2rem',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `${accent}15`,
            border: `1px solid ${accent}25`,
            marginBottom: '0.75rem',
          }}>
            <FolderOpenIcon style={{ width: 24, height: 24, color: accent }} />
          </div>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: text,
            margin: 0,
          }}>
            Open a Vault
          </h1>
          <p style={{
            fontSize: '0.8125rem',
            color: muted,
            margin: '0.375rem 0 0',
            lineHeight: 1.5,
          }}>
            Vaults are isolated workspaces stored in your browser.
          </p>
        </div>

        {/* Vault list */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxHeight: 320,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}>
          {vaults.map((vault: Vault) => {
            const isActive = vault.id === activeVaultId;
            const isHovered = vault.id === hoveredId;
            const isRenaming = vault.id === renamingId;

            return (
              <motion.div
                key={vault.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onMouseEnter={() => setHoveredId(vault.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => { if (!isRenaming) handleSelectVault(vault.id); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: isActive ? `${accent}10` : isHovered ? cardBg : 'transparent',
                  border: `1px solid ${isActive ? `${accent}30` : border}`,
                  cursor: isRenaming ? 'default' : 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <FolderIcon style={{
                  width: 20,
                  height: 20,
                  color: isActive ? accent : muted,
                  flexShrink: 0,
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') {
                          setRenamingId(null);
                          e.currentTarget.blur();
                          return;
                        }
                      }}
                      onBlur={() => { if (renamingId) handleRename(); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        background: isDark ? 'rgba(79,69,57,0.3)' : 'rgba(208,196,180,0.2)',
                        border: `1px solid ${accent}`,
                        borderRadius: 6,
                        color: text,
                        padding: '2px 8px',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {vault.name}
                      </div>
                      <div style={{
                        fontSize: '0.6875rem',
                        color: muted,
                        marginTop: 2,
                      }}>
                        {vault.pageCount} page{vault.pageCount !== 1 ? 's' : ''}
                        {' · '}
                        {new Date(vault.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </>
                  )}
                </div>

                {isHovered && !isRenaming && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(vault.id);
                        setRenameValue(vault.name);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: 5, border: 'none',
                        background: 'transparent', color: muted, cursor: 'pointer',
                      }}
                    >
                      <PencilIcon style={{ width: 12, height: 12 }} />
                    </button>
                    {vaults.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete vault "${vault.name}"? This cannot be undone.`)) {
                            deleteVault(vault.id);
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 5, border: 'none',
                          background: 'transparent', color: '#E05252', cursor: 'pointer',
                        }}
                      >
                        <TrashIcon style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </div>
                )}

                {isActive && !isHovered && (
                  <span style={{
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    color: accent,
                    background: `${accent}12`,
                    padding: '2px 8px',
                    borderRadius: 10,
                    flexShrink: 0,
                  }}>
                    Active
                  </span>
                )}

                {!isActive && !isHovered && (
                  <ChevronRightIcon style={{
                    width: 14, height: 14, color: muted, flexShrink: 0,
                  }} />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Create new vault */}
        <AnimatePresence>
          {creating ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '4px 0',
              }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') setCreating(false);
                    }}
                    placeholder="Vault name..."
                    style={{
                      flex: 1,
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      background: cardBg,
                      border: `1px solid ${border}`,
                      borderRadius: 8,
                      color: text,
                      padding: '8px 12px',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={handleCreate}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 36, height: 36, borderRadius: 8, border: 'none',
                      background: accent, color: '#fff', cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <CheckIcon style={{ width: 16, height: 16 }} />
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 36, height: 36, borderRadius: 8, border: `1px solid ${border}`,
                      background: 'transparent', color: muted, cursor: 'pointer',
                    }}
                  >
                    <XIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                <p style={{
                  fontSize: '0.6875rem',
                  color: muted,
                  margin: 0,
                  lineHeight: 1.5,
                  padding: '0 2px',
                }}>
                  Data is saved in your browser automatically.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.button
              onClick={() => setCreating(true)}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: accent,
                background: `${accent}08`,
                border: `1px dashed ${accent}40`,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <PlusIcon style={{ width: 16, height: 16 }} />
              Create New Vault
            </motion.button>
          )}
        </AnimatePresence>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            color: muted,
            background: 'transparent',
            border: `1px solid ${border}`,
            borderRadius: 10,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <XIcon style={{ width: 14, height: 14 }} />
          Close
        </button>
      </motion.div>
    </div>
  );
});
