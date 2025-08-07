import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

// Load environment variables in development
if (dev) {
	import('dotenv').then(({ config }) => {
		config();
	});
}
