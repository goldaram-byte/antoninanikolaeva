-- Схема базы данных CRM «Школа каратэ Николаевой Антонины» (PostgreSQL 13+)
-- Файл применяется командой `npm run migrate` и растёт по этапам:
-- каждая новая таблица/колонка добавляется через CREATE TABLE IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS, поэтому миграцию можно запускать сколько угодно раз.
-- gen_random_uuid() входит в ядро PostgreSQL начиная с 13-й версии.

-- ============================== ЭТАП 1: КАРКАС ==============================

-- Сотрудники (владелец, администраторы, тренеры) — вход в админку
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Роли сотрудников с настраиваемыми правами (галочки по разделам)
CREATE TABLE IF NOT EXISTS roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'all',     -- all | own (own = только свои клиенты)
  permissions  JSONB NOT NULL DEFAULT '{}',     -- { "clients_view": true, ... }
  is_protected BOOLEAN NOT NULL DEFAULT false   -- владелец: нельзя удалить/ограничить
);

-- Настройки центра (ключ-значение: название, валюта, проценты бонусов и т.п.)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Направления (в этой школе — каратэ; структура позволяет добавить ещё)
CREATE TABLE IF NOT EXISTS disciplines (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#DC2626'
);

-- Тренеры
CREATE TABLE IF NOT EXISTS trainers (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Клиенты (ученики и их родители)
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT UNIQUE,
  email         TEXT,
  birthdate     DATE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сотрудник: роль и привязка к тренеру (для scope='own' — «только свои клиенты»)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role_id    UUID REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;

-- ==================== ЭТАП 2: ФИЛИАЛЫ, КЛИЕНТЫ, АБОНЕМЕНТЫ, ФИНАНСЫ ====================

-- Филиалы школы (создаются и удаляются в Настройках)
CREATE TABLE IF NOT EXISTS branches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  address    TEXT NOT NULL DEFAULT '',
  sort       INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Привязка клиента к филиалу
ALTER TABLE clients ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Лояльность клиента: скидка, баллы, реферальная связь.
-- Начисление наград — этап 5, но связи фиксируем с первого дня, чтобы их не терять.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS bonus_points     INT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code    TEXT UNIQUE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by      UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  referred_id   UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | rewarded
  reward_points INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewarded_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals(referrer_id);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  points     INT NOT NULL,                        -- + начисление / - списание
  reason     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_client ON loyalty_transactions(client_id, created_at);

-- Направления и тренеры клиента
CREATE TABLE IF NOT EXISTS client_disciplines (
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, discipline_id)
);
CREATE TABLE IF NOT EXISTS client_trainers (
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, trainer_id)
);
CREATE INDEX IF NOT EXISTS idx_ct_trainer ON client_trainers(trainer_id);

-- Зарплата тренера: либо процент от оплат, либо оклад + процент (расчёт — этап 6)
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS salary_mode  TEXT NOT NULL DEFAULT 'percent';  -- percent | salary_percent
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS salary_fixed NUMERIC(10,2) NOT NULL DEFAULT 0; -- оклад в месяц
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS percent      NUMERIC(5,2)  NOT NULL DEFAULT 0; -- процент от оплат

-- Каталог тарифов. Базовая цена + отдельные цены по филиалам (таблица ниже).
CREATE TABLE IF NOT EXISTS subscription_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'sessions',  -- sessions | unlimited
  sessions      INT  NOT NULL DEFAULT 0,
  days          INT  NOT NULL DEFAULT 30,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,  -- базовая цена (если у филиала нет своей)
  discipline_id UUID REFERENCES disciplines(id) ON DELETE SET NULL,
  training_type TEXT NOT NULL DEFAULT 'group',     -- group | personal
  active        BOOLEAN NOT NULL DEFAULT true
);

-- Цены тарифа по филиалам («в каждом филиале разные цены»)
CREATE TABLE IF NOT EXISTS subscription_type_prices (
  sub_type_id UUID NOT NULL REFERENCES subscription_types(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  price       NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (sub_type_id, branch_id)
);

-- Выданные абонементы
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sub_type_id    UUID REFERENCES subscription_types(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL,                     -- sessions | unlimited
  training_type  TEXT NOT NULL DEFAULT 'group',
  sessions_total INT  NOT NULL DEFAULT 0,
  sessions_used  INT  NOT NULL DEFAULT 0,
  price          NUMERIC(10,2) NOT NULL DEFAULT 0,  -- итоговая цена (после скидки/баллов/своей цены)
  paid           NUMERIC(10,2) NOT NULL DEFAULT 0,  -- сколько оплачено (меньше цены = долг)
  purchase_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date    DATE NOT NULL,
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  trainer_id     UUID REFERENCES trainers(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'active'     -- active | pending (оформлен из кабинета, ждёт оплаты)
);
CREATE INDEX IF NOT EXISTS idx_subs_client ON client_subscriptions(client_id);

-- Оплаты и возвраты
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_sub_id  UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  amount         NUMERIC(10,2) NOT NULL,
  method         TEXT NOT NULL DEFAULT 'наличные',  -- наличные | перевод | расчётный счёт | онлайн | бонусы
  status         TEXT NOT NULL DEFAULT 'succeeded', -- pending | succeeded | canceled
  op_type        TEXT NOT NULL DEFAULT 'payment',   -- payment (приход) | refund (возврат)
  counts_revenue BOOLEAN NOT NULL DEFAULT true,     -- бонусы не считаются доходом
  provider       TEXT,                              -- yookassa и т.п.
  provider_id    TEXT,                              -- id платежа в ЮKassa
  payer          TEXT NOT NULL DEFAULT '',          -- кто оплатил (родитель и т.п.)
  note           TEXT NOT NULL DEFAULT '',
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_cli ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_at  ON payments(created_at);

-- ==================== ЭТАП 3: РАСПИСАНИЕ, ПОСЕЩАЕМОСТЬ, ЖУРНАЛ ЗАПИСИ ====================

-- Недельное расписание занятий (по филиалам)
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID REFERENCES branches(id) ON DELETE CASCADE,
  discipline_id UUID REFERENCES disciplines(id) ON DELETE SET NULL,
  trainer_id    UUID REFERENCES trainers(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT '',
  day_of_week   INT  NOT NULL,                     -- 0=Пн .. 6=Вс
  start_time    TEXT NOT NULL,                     -- 'HH:MM'
  end_time      TEXT NOT NULL,
  capacity      INT  NOT NULL DEFAULT 12,
  room          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_branch ON sessions(branch_id, day_of_week);

-- Разовые изменения ОДНОГО занятия на конкретную дату (отмена или перенос).
-- Изменение всей серии — обычное редактирование строки sessions.
CREATE TABLE IF NOT EXISTS session_exceptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'cancelled',  -- cancelled | moved
  new_start  TEXT,                                -- новое время при переносе
  new_end    TEXT,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sess_exc ON session_exceptions(session_id, date);

-- Закрепление клиента за группой (занятием расписания)
CREATE TABLE IF NOT EXISTS client_sessions (
  client_id  UUID NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_session ON client_sessions(session_id);

-- Посещаемость и разовые записи на групповые занятия.
-- «был» списывает занятие с подходящего абонемента (client_sub_id), снятие отметки возвращает.
CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sessions(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booked',    -- booked | attended | noshow | cancelled
  client_sub_id UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  no_sub        BOOLEAN NOT NULL DEFAULT false,    -- был, но подходящего абонемента не нашлось (долг)
  marked_by     TEXT NOT NULL DEFAULT '',          -- кто отметил (тренер/администратор)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, session_id, date)
);
CREATE INDEX IF NOT EXISTS idx_bookings_sess ON bookings(session_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id, date);

-- Журнал записи персональных тренировок
CREATE TABLE IF NOT EXISTS personal_bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  trainer_id    UUID REFERENCES trainers(id) ON DELETE CASCADE,
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  start_time    TEXT NOT NULL,                       -- 'HH:MM'
  end_time      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'booked',      -- booked | attended | noshow | cancelled
  client_sub_id UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_date ON personal_bookings(date, branch_id);
CREATE INDEX IF NOT EXISTS idx_personal_trainer ON personal_bookings(trainer_id, date);

-- ==================== ЭТАП 5: ВОРОНКА, ЗАДАЧИ, ЗАРПЛАТА ====================

-- Этапы воронки продаж
CREATE TABLE IF NOT EXISTS funnel_stages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#3b82f6',
  sort       INT  NOT NULL DEFAULT 0,
  is_won     BOOLEAN NOT NULL DEFAULT false,   -- терминальный успех («Пришёл»)
  is_lost    BOOLEAN NOT NULL DEFAULT false,   -- терминальный отказ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Этапы по умолчанию (создаются один раз)
INSERT INTO funnel_stages (name, color, sort, is_won, is_lost)
SELECT * FROM (VALUES
  ('Новая',     '#3b82f6', 0, false, false),
  ('Связались', '#f59e0b', 1, false, false),
  ('Назначена', '#8b5cf6', 2, false, false),
  ('Пришёл',    '#10b981', 3, true,  false),
  ('Отказ',     '#94a3b8', 4, false, true )
) AS v(name,color,sort,is_won,is_lost)
WHERE NOT EXISTS (SELECT 1 FROM funnel_stages);

-- Заявки / лиды
CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  discipline_id UUID REFERENCES disciplines(id) ON DELETE SET NULL,
  comment       TEXT NOT NULL DEFAULT '',
  -- КРИТИЧНО (урок образца): «кто пригласил» фиксируется в заявке и ПЕРЕНОСИТСЯ
  -- в клиента при конверсии — иначе реферальные бонусы не начислятся.
  referred_by   UUID REFERENCES clients(id) ON DELETE SET NULL,
  stage_id      UUID REFERENCES funnel_stages(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,  -- заполнен после конверсии
  sort          INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage_id, sort);

-- Примечания-история по лиду
CREATE TABLE IF NOT EXISTS lead_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);

-- Задачи/напоминания по лидам
CREATE TABLE IF NOT EXISTS lead_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due_date   DATE,
  note       TEXT NOT NULL DEFAULT '',
  done       BOOLEAN NOT NULL DEFAULT false,
  done_at    TIMESTAMPTZ,
  author     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_open ON lead_tasks(due_date) WHERE done = false;

-- Задачи по клиентам
CREATE TABLE IF NOT EXISTS client_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due_date   DATE,
  note       TEXT NOT NULL DEFAULT '',
  done       BOOLEAN NOT NULL DEFAULT false,
  done_at    TIMESTAMPTZ,
  author     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_tasks ON client_tasks(client_id, done, due_date);
