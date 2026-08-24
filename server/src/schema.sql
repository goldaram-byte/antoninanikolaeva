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
  card_id       TEXT UNIQUE,                 -- карта/QR для прохода (СКУД)
  password_hash TEXT,                        -- для входа в личный кабинет
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сотрудник: роль и привязка к тренеру (для scope='own' — «только свои клиенты»)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role_id    UUID REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL;
