import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Chat } from '@/components/chat/chat';
import { usePFCStore } from '@/lib/store/use-pfc-store';
import { commands } from '@/lib/bindings';

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const setCurrentChat = usePFCStore((s) => s.setCurrentChat);
  const loadMessages = usePFCStore((s) => s.loadMessages);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;

    setCurrentChat(chatId);
    commands.getMessages(chatId).then((result) => {
      if (!cancelled && result.status === 'ok') {
        loadMessages(result.data.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'system',
          text: m.content,
          timestamp: new Date(m.created_at).getTime(),
          confidence: m.confidence_score ?? undefined,
          evidenceGrade: (m.evidence_grade ?? undefined) as 'A' | 'B' | 'C' | 'D' | 'F' | undefined,
          mode: (m.inference_mode ?? undefined) as 'research' | 'moderate' | 'creative' | undefined,
          dualMessage: m.dual_message_data ? JSON.parse(m.dual_message_data) : undefined,
          truthAssessment: m.truth_assessment_data ? JSON.parse(m.truth_assessment_data) : undefined,
        })));
      }
    }).catch(() => {
      // Backend not ready yet — messages will load when available
    });

    return () => { cancelled = true; };
  }, [chatId, setCurrentChat, loadMessages]);

  return <Chat mode="conversation" />;
}
