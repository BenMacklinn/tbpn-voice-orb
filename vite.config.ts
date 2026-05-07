import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function xaiRealtimeTokenPlugin(apiKey: string | undefined): Plugin {
  const handleTokenRequest: Connect.NextHandleFunction = (request, response) => {
    void (async () => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      const method = (request as { method?: string }).method;

      if (method !== 'GET' && method !== 'POST') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      if (!apiKey) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: 'Missing XAI_API_KEY in environment.' }));
        return;
      }

      try {
        const xaiResponse = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expires_after: {
              seconds: 300,
            },
          }),
        });

        const body = await xaiResponse.text();
        response.statusCode = xaiResponse.status;
        response.end(body);
      } catch {
        response.statusCode = 502;
        response.end(JSON.stringify({ error: 'Could not create xAI realtime token.' }));
      }
    })();
  };

  return {
    name: 'xai-realtime-token',
    configureServer(server) {
      server.middlewares.use('/api/xai/realtime-token', handleTokenRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/xai/realtime-token', handleTokenRequest);
    },
  };
}

export default defineConfig(({ mode }) => {
  const workspaceRoot = decodeURIComponent(new URL('.', import.meta.url).pathname);
  const env = loadEnv(mode, workspaceRoot, '');

  return {
    plugins: [react(), xaiRealtimeTokenPlugin(env.XAI_API_KEY)],
  };
});
