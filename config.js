// Шаблон конфигурации для нового окружения
// Скопируйте этот файл в config.js и заполните значения

const PROD = false; // Установите true для продакшена, false для тестирования

const CONFIGS = {
  // Основные параметры подключения
  baseUrl: PROD
    ? 'wms'              // Адрес WMS-сервера (продакшен)
    : 'fl-v7-test',      // Адрес WMS-сервера (тест)
  
  instance: PROD ? 'PROD' : 'TEST', // Имя инстанса
  
  idReport: PROD ? '324' : '322',   // ID отчёта для скачивания
  
  // Параметры отправки в отбор
  pickStrategyPolicyId: {
    standard: '1',      // ID стандартной стратегии
    simplified: '2'     // ID упрощённой стратегии
  },
  
  taskReleasePhases: ['1', '8'], // Фазы выпуска задач
  actions: 7,                      // Действие
  
  // Очередь RabbitMQ
  rabbitQueuePrefix: 'FARMLEND',
  rabbitQueueSuffix: 'V7-ALLOC-1-0-ALLOCATE'
};

window.APP_CONFIG = CONFIGS;
