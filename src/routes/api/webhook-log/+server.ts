import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWebhookLog } from '$lib/vectorDb-vercel.js';

export const GET: RequestHandler = async () => {
  return json({ events: getWebhookLog() });
};

