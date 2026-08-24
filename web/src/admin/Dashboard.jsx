import { Header, Panel } from "../ui.jsx";
import { useSettings } from "../settings.jsx";

export default function Dashboard() {
  const { clubName } = useSettings();
  const name = localStorage.getItem("name");
  return (
    <div className="space-y-5">
      <Header title="Дашборд" subtitle={clubName} />
      <Panel title={`Добро пожаловать, ${name || "коллега"}!`}>
        <p className="text-sm text-slate-600">
          Каркас системы установлен: авторизация сотрудников и клиентов работает,
          база данных подключена. Разделы админки будут включаться по этапам —
          следующими появятся «Клиенты», «Абонементы» и «Оплаты и долги».
        </p>
      </Panel>
    </div>
  );
}
