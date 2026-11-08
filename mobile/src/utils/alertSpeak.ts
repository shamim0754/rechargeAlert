/** Speak + optional browser notification for low-balance alerts. */
export async function announceLowBalance(threshold: number, balance: number): Promise<void> {
  const text = `Your recharge below ${threshold}. Balance ${balance.toFixed(2)} taka. Please recharge.`;

  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission === 'granted') {
        new Notification('RechargeAlert', { body: text, tag: 'rechargealert-low-balance' });
      }
    }
  } catch (err) {
    console.warn('[alert] notification failed', err);
  }

  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.warn('[alert] speech failed', err);
  }
}
