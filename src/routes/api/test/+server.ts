import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    console.log('TypeScript test handler called!');
    return json({ message: 'TypeScript handler is working!' });
};
