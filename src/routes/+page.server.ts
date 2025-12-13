import { env } from '$env/dynamic/private';

export const load = () => {
  // Strip quotes if present (from .env file)
  const clientId = (env.AT_CLIENT_ID ?? '').replace(/^["']|["']$/g, '');
  const projectUrl = (env.PROJECT_URL ?? '').replace(/^["']|["']$/g, '');
  
  console.log('[Server] Loading env vars - Client ID:', clientId, 'URL:', projectUrl);
  
  return {
    clientId,
    projectUrl,
  };
};

