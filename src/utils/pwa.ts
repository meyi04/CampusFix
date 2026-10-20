import { shallowRef } from 'vue';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const installPrompt = shallowRef<InstallPromptEvent | null>(null);

window.addEventListener('beforeinstallprompt', (event: Event) => {
  event.preventDefault();
  installPrompt.value = event as InstallPromptEvent;
});

window.addEventListener('appinstalled', () => {
  installPrompt.value = null;
});

export const canInstallPwa = installPrompt;

export async function promptPwaInstall(): Promise<void> {
  const prompt = installPrompt.value;
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  installPrompt.value = null;
}
