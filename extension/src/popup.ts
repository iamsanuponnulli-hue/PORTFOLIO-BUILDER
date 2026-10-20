export {};

const btn = document.getElementById('send') as HTMLButtonElement;
const status = document.getElementById('status')!;

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = 'Capturing this page…';
  const r = (await chrome.runtime.sendMessage({ type: 'capture-active-tab' })) as {
    ok: boolean;
    error?: string;
  };
  status.textContent = r.ok
    ? 'Sent. It appears in the Inspiration step next time you open Portfolio Builder.'
    : `Couldn't capture this page: ${r.error ?? 'unknown error'}`;
  btn.disabled = false;
});
