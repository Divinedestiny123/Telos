import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ title: 'New Chat' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      const lower = message.toLowerCase();
      if (lower.includes('buy') || lower.includes('swap') || lower.includes('trade')) {
        return NextResponse.json({ title: 'Trade Request' });
      }
      return NextResponse.json({ title: 'General Chat' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 20,
      system: "You are a helpful assistant. Generate a very short, punchy 2-4 word title for a chat based on the user's first message. Do not include quotes, periods, or prefixes like 'Title:'. Just the raw title. Capitalize appropriately.",
      messages: [{ role: 'user', content: message }],
    });

    const title = response.content[0].type === 'text' ? response.content[0].text.trim() : 'New Chat';
    
    return NextResponse.json({ title });
  } catch (error) {
    console.error('Title Generation Error:', error);
    return NextResponse.json({ title: 'New Chat' });
  }
}
