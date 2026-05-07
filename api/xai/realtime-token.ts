const XAI_CLIENT_SECRETS_URL = 'https://api.x.ai/v1/realtime/client_secrets';

const noStoreHeaders = { 'Cache-Control': 'no-store' } as const;

function getEnv(name: string): string | undefined {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return proc?.env?.[name]?.trim();
}

async function handleTokenRequest(): Promise<Response> {
  const apiKey = getEnv('XAI_API_KEY');

  if (!apiKey) {
    return Response.json(
      { error: 'Missing XAI_API_KEY in environment.' },
      { status: 500, headers: noStoreHeaders },
    );
  }

  try {
    const xaiResponse = await fetch(XAI_CLIENT_SECRETS_URL, {
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
    return new Response(body, {
      status: xaiResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...noStoreHeaders,
      },
    });
  } catch (error) {
    console.error('realtime-token: xAI request failed', error);
    return Response.json(
      { error: 'Could not create xAI realtime token.' },
      { status: 502, headers: noStoreHeaders },
    );
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const method = request.method;
    if (method !== 'GET' && method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405, headers: noStoreHeaders },
      );
    }

    return handleTokenRequest();
  },
};
