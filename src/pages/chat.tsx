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
    commands.getMessages(chatId).then((msgs) => {
      if (!cancelled) {
        loadMessages(msgs.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'system',
          text: m.content,
          timestamp: new Date(m.created_at).getTime(),
        })));
      }
    }).catch(() => {
      // Backend not ready yet — messages will load when available
    });

    return () => { cancelled = true; };
  }, [chatId, setCurrentChat, loadMessages]);

  return <Chat mode="conversation" />;
}
