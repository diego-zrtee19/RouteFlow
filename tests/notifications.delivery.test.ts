import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {processNotifications} from '@/services/operationsService';

const mocks = vi.hoisted(() => ({rpc: vi.fn(), update: vi.fn(), eq: vi.fn()}));
vi.mock('@/lib/supabaseAdmin', () => ({getSupabaseAdmin: () => ({
  rpc: mocks.rpc, from: () => ({update: mocks.update}),
})}));

const job = {id: 'notification-fixture', recipient: 'buyer@example.com', subject: 'Compra de prueba',
  body: 'Pedido RF-TEST: pago confirmado', kind: 'PAID', audience: 'buyer', attempts: 1};

beforeEach(() => {
  mocks.rpc.mockResolvedValue({data: [job], error: null});
  mocks.update.mockImplementation(() => ({eq: mocks.eq}));
  mocks.eq.mockResolvedValue({error: null});
  vi.stubEnv('RESEND_API_KEY', 'fixture-api-key');
  vi.stubEnv('ROUTEFLOW_EMAIL_FROM', 'RouteFlow <sales@example.com>');
  vi.stubEnv('ROUTEFLOW_EMAIL_DELIVERY', 'enabled');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture');
});
afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});

describe('notification delivery boundaries', () => {
  it('keeps Stripe TEST notifications in preview even if mail is enabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    expect(await processNotifications()).toEqual({sent: 0, preview: 1, failed: 0});
    expect(request).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({status: 'PREVIEW'}));
  });
  it('does not send with delivery disabled', async () => {
    vi.stubEnv('ROUTEFLOW_EMAIL_DELIVERY', 'preview');
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    expect((await processNotifications()).preview).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });
  it('requires a recipient before contacting the provider', async () => {
    mocks.rpc.mockResolvedValue({data: [{...job, recipient: null}], error: null});
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    expect((await processNotifications()).failed).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });
  it('uses an idempotency key and records success only after provider acceptance', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', {status: 200}));
    vi.stubGlobal('fetch', request);
    expect((await processNotifications()).sent).toBe(1);
    expect(request).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      headers: expect.objectContaining({'Idempotency-Key': 'rf_notification_notification-fixture'}),
    }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({status: 'SENT', last_error: null}));
  });
  it('includes private-order and verified-email recovery links without bearer secrets', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://routeflow.example');
    mocks.rpc.mockResolvedValue({data: [{...job, order_id: 'test-order'}], error: null});
    const request = vi.fn().mockResolvedValue(new Response('{}', {status: 200}));
    vi.stubGlobal('fetch', request);
    await processNotifications();
    const text = JSON.parse(request.mock.calls[0][1].body).text;
    expect(text).toContain('https://routeflow.example/order/test-order');
    expect(text).toContain('https://routeflow.example/mis-compras');
    expect(text).not.toContain('token=');
  });
  it('preserves failed deliveries for retry instead of claiming sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {status: 503})));
    expect(await processNotifications()).toEqual({sent: 0, preview: 0, failed: 1});
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FAILED', locked_at: null, last_error: 'Proveedor de correo: HTTP 503',
      available_at: expect.any(String),
    }));
    expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({status: 'SENT'}));
  });
});
