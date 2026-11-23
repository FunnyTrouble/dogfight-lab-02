import { test, expect } from '@playwright/test';
test('two clients share room and chat, and see moving opponent', async ({ browser }) => {
  const a = await browser.newContext(); const b = await browser.newContext();
  try {
    const pa = await a.newPage(); const pb = await b.newPage();
    await Promise.all([pa.goto('/'), pb.goto('/')]);
    await expect(pa.locator('#join-button')).toBeEnabled();
    await expect(pb.locator('#join-button')).toBeEnabled();
    await pa.locator('#player-name').fill('Alpha');
    await pb.locator('#player-name').fill('Beta');
    await pa.locator('#room-select').selectOption('classic');
    await pb.locator('#room-select').selectOption('classic');
    await pa.locator('#join-button').click(); await pb.locator('#join-button').click();
    await expect(pa.locator('#room-roster')).toContainText('Beta');
    await expect(pb.locator('#room-roster')).toContainText('Alpha');
    await pa.locator('#chat-text').fill('Hello from Alpha');
    await pa.locator('#chat-form button[type=submit]').click();
    await expect(pb.locator('#chat-messages')).toContainText('Hello from Alpha');
    // Observe actual remote coordinates, not just connection status.
    const before = await pb.evaluate(() => Reflect.get(window, 'dogfightRemoteState')());
    await pa.locator('#game').click();
    await pa.keyboard.down('w'); await pa.waitForTimeout(900); await pa.keyboard.up('w');
    await expect.poll(async () => {
      const after = await pb.evaluate(() => Reflect.get(window, 'dogfightRemoteState')());
      const initial = before[0], current = after[0];
      return Boolean(initial && current && (Math.abs(initial.x-current.x)+Math.abs(initial.y-current.y)>5));
    }, {timeout: 5000}).toBe(true);
    await expect(pb.locator('#connection-status')).toContainText('Сервер рахує гру');
    await expect(pb.locator('#room-roster')).toContainText('Alpha');
  } finally { await a.close(); await b.close(); }
});
