import { useState } from "react";
import { api } from "../api.js";
import { Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";
import { METHODS } from "./BuyModal.jsx";

// Приём оплаты по долгу: по конкретному абонементу (sub) или по всем долгам клиента по очереди.
export default function PaymentModal({ client, sub, onClose, onDone }) {
  const owed = sub
    ? Math.max(0, Number(sub.price) - Number(sub.paid))
    : (client.subs || []).reduce((a, s) => a + Math.max(0, Number(s.price) - Number(s.paid)), 0);
  const [f, setF] = useState({ amount: owed || "", method: "наличные", use_points: 0, payer: "", note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      await api.post("/api/payments", {
        client_id: client.id, client_sub_id: sub?.id || null,
        cash_amount: Number(f.amount) || 0, method: f.method,
        use_points: Number(f.use_points) || 0, payer: f.payer, note: f.note || (sub ? sub.name : "оплата долга"),
      });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={sub ? `Оплата: ${sub.name}` : `Оплата долга — ${client.name}`} onClose={onClose}
      footer={<>
        <button className={btnGhost} onClick={onClose}>Отмена</button>
        <button className={btnPrimary} disabled={busy} onClick={submit}>{busy ? "Проводим…" : "Принять оплату"}</button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Долг: <b className="text-red-600">{money(owed)}</b></p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Сумма"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
          <Field label="Способ оплаты">
            <select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        {Number(client.bonus_points) > 0 && (
          <Field label={`Баллами (доступно ${client.bonus_points})`}>
            <input type="number" min="0" max={client.bonus_points} className={inputCls} value={f.use_points} onChange={(e) => setF({ ...f, use_points: e.target.value })} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Кто оплатил (не обяз.)"><input className={inputCls} value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })} /></Field>
          <Field label="Комментарий"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
