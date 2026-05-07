declare const process: {
  env: Record<string, string | undefined>;
};

type VercelRequest = {
  method?: string;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: string) => void;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    response.status(500).json({ error: 'Missing XAI_API_KEY in environment.' });
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
    response.setHeader('Content-Type', 'application/json');
    response.status(xaiResponse.status).send(body);
  } catch {
    response.status(502).json({ error: 'Could not create xAI realtime token.' });
  }
}
