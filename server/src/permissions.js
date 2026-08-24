// Полный список прав. Используется и при сидинге, и в интерфейсе настроек ролей.
export const PERMISSIONS = [
  { key: "clients_view", label: "Видеть клиентов" },
  { key: "clients_edit", label: "Редактировать клиентов" },
  { key: "schedule_view", label: "Видеть расписание" },
  { key: "schedule_edit", label: "Редактировать расписание" },
  { key: "attendance_view", label: "Видеть посещаемость" },
  { key: "attendance_mark", label: "Отмечать посещаемость" },
  { key: "access_use", label: "Проход / СКУД" },
  { key: "subs_manage", label: "Абонементы (тарифы и выдача)" },
  { key: "finance_view", label: "Видеть оплаты и долги" },
  { key: "payments_manage", label: "Проводить оплаты" },
  { key: "settings_manage", label: "Настройки центра" },
  { key: "employees_manage", label: "Управление сотрудниками и ролями" },
  { key: "reports_salary", label: "Зарплата (отчёты)" },
  { key: "loyalty_view", label: "Лояльность и рефералы" },
  { key: "content_manage", label: "Контент кабинета (акции, тренеры)" },
  { key: "leads_manage", label: "Воронка продаж (заявки и лиды)" },
];

const all = (val) => Object.fromEntries(PERMISSIONS.map((p) => [p.key, val]));

export const PRESET_OWNER = all(true);

export const PRESET_ADMIN = {
  ...all(false),
  clients_view: true, clients_edit: true,
  schedule_view: true, schedule_edit: true,
  attendance_view: true, attendance_mark: true,
  access_use: true, subs_manage: true,
  finance_view: true, payments_manage: true, loyalty_view: true,
  content_manage: true, leads_manage: true,
};

export const PRESET_TRAINER = {
  ...all(false),
  clients_view: true, schedule_view: true,
  attendance_view: true, attendance_mark: true,
  finance_view: true,
};
