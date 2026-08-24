import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";

export const METHODS = ["наличные", "перевод", "расчётный счёт", "онлайн"];

// Выдача абонемента клиенту.
// Цена: тариф (с учётом филиала) − персональная скидка − баллы, ЛИБО «своя цена»
// (например, клиент пришёл с середины месяца — сумма вводится вручную,
// скидка к своей цене не применяется, баллы применимы).
export default function BuyModal({ client, branches, trainers, onClose, onDone }) {
  const { currency } = useSettings();
  const [types, setTypes] = useState([]);
  const [f, setF] = useState({
    sub_type_id: "", branch_id: client.branch_id || "", trainer_id: "",
    paidNow: true, method: "наличные", use_points: 0, custom: false, custom_price: "",
    start_date: new Date().toISOString().slice(0, 10), payer: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/api/catalog/subscription-types").then(setTypes).catch(() => {}); }, []);

  const type = types.find((t) => t.id === f.sub_type_id);
  const pointsRate = 1; // показываем оценку; точный расчёт делает сервер

  // Цена тарифа для выбранного филиала (своя цена филиала или базовая)
  const basePrice = useMemo(() => {
    if (!type) return 0;
    const bp = type.branch_prices || {};
    if (f.branch_id && bp[f.branch_id] != null) return Number(bp[f.branch_id]);
    return Number(type.price);
  }, [type, f.branch_id]);

  const disc = f.custom ? 0 : Number(client.discount_percent || 0);
  const afterDiscount = f.custom
    ? Math.max(0, Math.round(Number(f.custom_price) || 0))
    : Math.max(0, Math.round(basePrice * (1 - disc / 100)));
  const usePts = Math.max(0, Math.min(Number(f.use_points) || 0, Number(client.bonus_points || 0), afterDiscount));
  const final = afterDiscount - usePts * pointsRate;

  const submit = async () => {
    if (!f.sub_type_id) return setErr("Выберите тариф");
    setErr(""); setBusy(true);
    try {
      await api.post("/api/subscriptions", {
        client_id: client.id, sub_type_id: f.sub_type_id,
        branch_id: f.branch_id || null, trainer_id: f.trainer_id || null,
        paidNow: f.paidNow, method: f.method, use_points: usePts,
        custom_price: f.custom ? (f.custom_price === "" ? null : Number(f.custom_price)) : null,
        start_date: f.start_date || null, payer: f.payer,
      });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Выдать абонемент — ${client.name}`} onClose={onClose}
      footer={<>
        <button className={btnGhost} onClick={onClose}>Отмена</button>
        <button className={btnPrimary} disabled={busy || !type} onClick={submit}>
          {busy ? "Оформляем…" : f.paidNow ? `Выдать за ${money(final, currency)}` : "Выдать в долг"}
        </button>
      </>}>
      <div className="space-y-4">
        <Field label="Тариф">
          <select className={inputCls} value={f.sub_type_id} onChange={(e) => setF({ ...f, sub_type_id: e.target.value })} autoFocus>
            <option value="">— выберите —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.kind === "unlimited" ? "безлимит" : `${t.sessions} зан.`} · {t.days} дн.
              </option>
            ))}
          </select>
          {types.length === 0 && <span className="mt-1 block text-xs text-slate-400">Сначала создайте тарифы в разделе «Абонементы»</span>}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Филиал">
            <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">— без филиала —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Тренер (для зарплаты)">
            <select className={inputCls} value={f.trainer_id} onChange={(e) => setF({ ...f, trainer_id: e.target.value })}>
              <option value="">— не указан —</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Дата начала">
          <input type="date" className={inputCls} value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        </Field>

        {/* Своя цена */}
        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4" checked={f.custom} onChange={(e) => setF({ ...f, custom: e.target.checked })} />
            Своя цена (ввести сумму вручную)
          </label>
          {f.custom ? (
            <div className="mt-3">
              <input type="number" className={inputCls} placeholder="Сумма" value={f.custom_price}
                onChange={(e) => setF({ ...f, custom_price: e.target.value })} autoFocus />
              <p className="mt-1 text-xs text-slate-400">Например, клиент пришёл с середины месяца. Персональная скидка к своей цене не применяется, баллами оплатить можно.</p>
            </div>
          ) : (
            type && <p className="mt-2 text-xs text-slate-500">
              Цена по тарифу: <b>{money(basePrice, currency)}</b>
              {disc > 0 && <> · скидка {disc}% → <b>{money(afterDiscount, currency)}</b></>}
            </p>
          )}
        </div>

        {Number(client.bonus_points) > 0 && (
          <Field label={`Оплата баллами (доступно ${client.bonus_points})`}>
            <input type="number" min="0" max={client.bonus_points} className={inputCls} value={f.use_points}
              onChange={(e) => setF({ ...f, use_points: e.target.value })} />
          </Field>
        )}

        {/* Оплата */}
        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4" checked={f.paidNow} onChange={(e) => setF({ ...f, paidNow: e.target.checked })} />
            Оплачен сейчас
          </label>
          {f.paidNow ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Способ оплаты">
                <select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Кто оплатил (не обяз.)">
                <input className={inputCls} placeholder="мама, папа…" value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })} />
              </Field>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-600">Абонемент будет выдан в долг и попадёт в «Оплаты и долги» → «Должники».</p>
          )}
        </div>

        {type && (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            К оплате: <b className="text-lg text-brand-dark">{money(final, currency)}</b>
            {usePts > 0 && <span className="text-slate-500"> (баллами: {usePts})</span>}
          </div>
        )}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
