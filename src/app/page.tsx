import { getChatMessages } from '@/actions/chat';
import { ChatArea } from '@/components/ChatArea';

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const chatId = typeof params.chatId === 'string' ? params.chatId : undefined;

  let initialMessages: any[] = [];
  if (chatId) {
    try {
      const dbMessages = await getChatMessages(chatId);
      initialMessages = dbMessages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        isTransaction: msg.isTransaction,
        transactionData: msg.transactionData
      }));
    } catch (e) {
      console.error('Error fetching messages', e);
    }
  }

  return <ChatArea initialMessages={initialMessages} chatId={chatId} />;
}
