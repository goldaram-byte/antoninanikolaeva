import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

// Общие настройки центра (название, валюта) — доступны в обоих приложениях
const Ctx = createContext({ settings: {}, clubName: "", reload: () => {} });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const reload = useCallback(async () => {
    try { setSettings(await api.get("/api/catalog/settings")); } catch { /* пусто */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return (
    <Ctx.Provider value={{
      settings,
      clubName: settings.club_name || "Школа каратэ Николаевой Антонины",
      reload,
    }}>
      {children}
    </Ctx.Provider>
  );
}
