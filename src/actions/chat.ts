'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createChat(title: string, walletAddress: string) {
  const chat = await prisma.chat.create({
    data: {
      title,
      walletAddress,
    },
  });
  revalidatePath('/');
  redirect(`/?chatId=${chat.id}`);
}

export async function deleteChat(chatId: string) {
  await prisma.chat.delete({
    where: { id: chatId },
  });
  revalidatePath('/');
}

export async function updateChatTitle(chatId: string, title: string) {
  await prisma.chat.update({
    where: { id: chatId },
    data: { title },
  });
  revalidatePath('/');
}

export async function createChatSilent(title: string, walletAddress: string) {
  const chat = await prisma.chat.create({
    data: {
      title,
      walletAddress,
    },
  });
  revalidatePath('/');
  return chat.id;
}

export async function getChats(walletAddress: string) {
  const chats = await prisma.chat.findMany({
    where: { walletAddress },
    orderBy: { createdAt: 'desc' },
  });
  return chats;
}

export async function getChatMessages(chatId: string) {
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
  });
  return messages;
}

export async function saveMessage(chatId: string, role: string, content: string, isTransaction: boolean = false, transactionData?: string) {
  const message = await prisma.message.create({
    data: {
      chatId,
      role,
      content,
      isTransaction,
      transactionData,
    },
  });
  revalidatePath('/');
  return message;
}
