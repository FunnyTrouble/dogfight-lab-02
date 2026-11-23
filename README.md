# Dogfight — Lab 08

![CI](https://github.com/FunnyTrouble/dogfight-lab-02/actions/workflows/typecheck.yml/badge.svg?branch=lab-08)

Мережева гра для двох гравців із кімнатами, чатом, астероїдами та показниками мережі.

**Публічна адреса:** ще не налаштована. Потрібно розгорнути контейнер на хостингу з HTTPS і WebSocket.

## Як запустити

```bash
npm install
npm run build:production
npm run start:production
```

Відкрити `http://localhost:3000` у двох вікнах. Для розробки — `npm run dev`.
Керування: W / ↑ — газ, A / D — поворот, Space або F — стрільба.

## Що зроблено в Lab 08

- Сервер бере PORT і HOST з оточення, відповідає на `/health`, `/ready` та `/metrics`.
- За SIGTERM завершує підключення через повідомлення shutdown і код 1001, дописує журнали.
- WebSocket перевіряє Origin, ліміт підключень з однієї IP, розмір і частоту повідомлень.
- Логи в JSON через pino, настройки проходять Zod.
- Multi-stage Docker, користувач node, HEALTHCHECK та docker compose.
- GitHub Actions перевіряє тести; тег `v*` збирає образ для GHCR. Автоматичний deploy на хостинг потребує секрету DEPLOY_HOOK_URL.
- Доданий PWA manifest та service worker. У браузері гра використовує wss, якщо сторінка відкрита через https.

## Архітектура

Браузер (Canvas + WebSocket) ↔ Node (HTTP, кімнати, 30 ticks/s) ↔ shared (TypeScript, симуляція, протокол).
Двоє гравців однієї кімнати мають бути на одному екземплярі сервера: стан кімнат зберігається в оперативній пам'яті.

## Вимірювання з попередніх лабораторних

Lab 05: JSON і binary доступні для порівняння. Режим naive дає затримку керування, drift — помітні корекції стану.

Lab 07: 105 тестів пройшли, покриття shared — 93,42 %. Локальний синтетичний тест з 8 ботами: tick p99 ~0,046 мс (Node 24.21.0). Це не вимірювання FPS у браузері й не гарантія пропускної здатності в хмарі.

| Перевірка | Результат |
|---|---|
| TypeScript, ESLint, Vitest, Playwright | У Lab 07 проходили |
| Публічні два гравці з різних мереж, RTT | Потрібна перевірка після деплою |
| Docker image <200 MB, docker stop <10s | Потрібен Docker для вимірювання |
| Flame chart і GC до/після | Не виміряно, вигаданих даних немає |

## Публікація

1. `npm install` для оновлення `package-lock.json` після додавання pino, потім локальні `npm run typecheck`, `npm test`, `npm run build:production`.
2. `docker compose up --build`, перевірити `/health`, `/ready`, `/metrics`, `docker images` і `docker stop`.
3. Підключити хостинг, що підтримує WebSocket, додати production URL до ALLOWED_ORIGINS (наприклад, `https://example.org`) і налаштувати DEPLOY_HOOK_URL як GitHub Actions secret.
4. Лише після перевірок створити теги lab-08 та v1.0.0. В README замінити адресу й додати реальні RTT, GIF та відео.

Обмеження: один процес на кімнату, немає збереження стану між рестартами, немає Redis чи sticky sessions, а перевірка Origin захищає браузерні з’єднання, але не є автентифікацією.

У майбутньому можна додати Redis, збереження матчів та компенсацію мережевої затримки.
