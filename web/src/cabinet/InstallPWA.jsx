import { useEffect, useState } from "react";
import { Download } from "lucide-react";

// Кнопка «Установить приложение»: Chrome/Android покажет системный диалог,
// на iOS даём подсказку (там установка только через «Поделиться → На экран Домой»).
export default function InstallPWA() {
  const [prompt, setPrompt] = useState(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isIos && !standalone) setIos(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (prompt) {
    return (
      <button
        onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm text-white hover:bg-white/20">
        <Download size={16} /> Установить приложение
      </button>
    );
  }
  if (ios) {
    return (
      <p className="text-center text-xs text-slate-400">
        Чтобы установить приложение на iPhone: «Поделиться» → «На экран Домой»
      </p>
    );
  }
  return null;
}
