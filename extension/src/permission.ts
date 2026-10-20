export {};

const params = new URLSearchParams(location.search);
const origin = params.get('origin') ?? '';
const purpose =
  params.get('purpose') === 'feed'
    ? 'read its blog feed'
    : 'take screenshots and read its colours and fonts';
document.getElementById('site')!.textContent = origin.replace(/^https?:\/\//, '');
document.getElementById('purpose')!.textContent = purpose;

const reply = (granted: boolean) =>
  chrome.runtime
    .sendMessage({ type: 'permission-result', origin, granted })
    .finally(() => window.close());

document.getElementById('allow')!.addEventListener('click', async () => {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  } catch {
    granted = false;
  }
  await reply(granted);
});
document.getElementById('deny')!.addEventListener('click', () => reply(false));
