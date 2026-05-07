const XAI_CLIENT_SECRETS_URL = 'https://api.x.ai/v1/realtime/client_secrets';

const noStoreHeaders = { 'Cache-Control': 'no-store' } as const;

async function handleTokenRequest(): Promise<Response> {
  const apiKey = process.env.XAI_API_KEY?.trim();

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

export async function GET(): Promise<Response> {
  return handleTokenRequest();
}

export async function POST(): Promise<Response> {
  return handleTokenRequest();
}
