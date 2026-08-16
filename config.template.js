// Шаблон конфигурации для нового окружения
// Скопируйте этот файл в config.js и заполните значения

const PROD = true; // Установите true для продакшена, false для тестирования

const CONFIGS = {
  // Основные параметры подключения
  baseUrl: PROD
    ? '*'              // Адрес WMS-сервера (продакшен)
    : '*',      // Адрес WMS-сервера (тест)
  
  instance: PROD ? '*' : '*', // Имя инстанса
  
  idReport: PROD ? '1' : '1',   // ID отчёта для скачивания
  
  // Параметры отправки в отбор
  pickStrategyPolicyId: {
    standard: '1',      // ID стандартной стратегии
    simplified: '2'     // ID упрощённой стратегии
  },
  
  taskReleasePhases: ['1', '8'], // Фазы выпуска задач
  actions: 7,                      // Действие
  
  // Очередь RabbitMQ
  rabbitQueuePrefix: 'pref',
  rabbitQueueSuffix: 'AllOC'
};

window.APP_CONFIG = CONFIGS;
