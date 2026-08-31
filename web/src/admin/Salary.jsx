import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Header, Empty, Spinner, inputCls, money } from "../ui.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");

// Зарплата тренеров за месяц: процент от оплат ИЛИ оклад + процент.
// База — оплаты по абонементам, привязанным к тренеру (тренер выбирается при выдаче).
export default function Salary() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [details, setDetails] = useState({});     // trainerId -> rows

  const load = useCallback(async () => {
    setDetails({});
    setData(await api.get(`/api/salary?month=${month}`));
  }, [month]);
  useEffect(() => { load().catch(() => setData({ trainers: [], total: 0 })); }, [load]);

  const toggleDetails = async (id) => {
    if (details[id]) { setDetails((p) => ({ ...p, [id]: null })); return; }
    const rows = await api.get(`/api/salary/${id}/details?month=${month}`);
    setDetails((p) => ({ ...p, [id]: rows }));
  };

  return (
    <div className="space-y-5">
      <Header title="Зарплата" subtitle="Расчёт по тренерам за месяц"
        action={<input type="month" className={inputCls + " w-auto"} value={month} onChange={(e) => setMonth(e.target.value)} />} />

      {!data ? <Spinner /> : data.trainers.length === 0 ? <Empty text="Тренеров пока нет — добавьте их в Настройках." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Тренер</th><th className="px-4 py-2.5">Схема</th>
                <th className="px-4 py-2.5 text-right">Оплаты учеников</th>
                <th className="px-4 py-2.5 text-right">Оклад</th>
                <th className="px-4 py-2.5 text-right">От оплат</th>
                <th className="px-4 py-2.5 text-right">Итого</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.trainers.map((t) => (
                <>
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <button className="hover:text-brand" onClick={() => toggleDetails(t.id)}>{t.name}</button>
                      {t.ops > 0 && <span className="ml-2 text-xs text-slate-400">({t.ops} оплат — нажмите для деталей)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {t.salary_mode === "salary_percent" ? `оклад + ${t.percent}%` : `${t.percent}% от оплат`}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{money(t.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{t.base > 0 ? money(t.base) : "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{money(t.from_percent)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{money(t.total)}</td>
                  </tr>
                  {details[t.id] && (
                    <tr key={t.id + "-d"}>
                      <td colSpan={6} className="bg-slate-50 px-6 py-3">
                        {details[t.id].length === 0 ? <span className="text-xs text-slate-400">Оплат за месяц нет.</span>
                          : <ul className="space-y-1 text-xs text-slate-600">
                            {details[t.id].map((p) => (
                              <li key={p.id} className="flex items-center gap-3">
                                <span className="w-20 text-slate-400">{fmtDate(p.created_at)}</span>
                                <Link to={`/admin/clients/${p.client_id}`} className="font-medium hover:text-brand">{p.client_name}</Link>
                                <span className="text-slate-400">{p.sub_name}</span>
                                <span className="ml-auto font-semibold text-emerald-600">{money(p.amount)}</span>
                              </li>
                            ))}
                          </ul>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-slate-500">Фонд оплаты за месяц:</td>
                <td className="px-4 py-3 text-right text-lg font-bold text-brand-dark">{money(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">
        В расчёт идут реальные оплаты (без бонусов и возвратов) за месяц по абонементам, у которых при выдаче указан тренер.
        Схема зарплаты каждого тренера настраивается в Настройки → Тренеры.
      </p>
    </div>
  );
}
