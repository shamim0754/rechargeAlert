import { corsHeaders, json, optionsResponse } from '../_shared/cors.ts';
import { runBalancePollOnce } from '../_shared/poller.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided =
    req.headers.get('x-cron-secret') ||
    new URL(req.url).searchParams.get('secret') ||
    '';

  if (cronSecret && provided !== cronSecret) {
    return json({ error: 'FORBIDDEN', message: 'Invalid cron secret' }, 403);
  }

  try {
    const result = await runBalancePollOnce();
    return json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: 'SERVER', message: err instanceof Error ? err.message : 'poll failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
