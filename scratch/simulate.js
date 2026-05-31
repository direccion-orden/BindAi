const events = [
  {
    "errorCondition": "None",
    "event": "CancelComplete",
    "lowFloatLevelWarning": false,
    "timestamp": "2026-05-22 19:42:14",
    "transaction": {
      "cash_in": 0,
      "cash_out": 0,
      "request_amount": 3000,
      "transaction_id": "d1441a6e-c9d1-4126-86ef-2f7d4bda6a86",
      "transaction_type": ""
    },
    "value": 3000
  }
];

const txId = "774a0cc4-008c-4a86-a03b-c95080f013bd";
const currentTxEvents = txId ? events.filter((e) => e.transaction?.transaction_id === txId) : events;

const isCompleted = currentTxEvents.some((e) => e.EventName === 'PaymentComplete' || e.event === 'PaymentComplete');
const isCanceled = currentTxEvents.some((e) => e.EventName === 'CancelComplete' || e.event === 'CancelComplete' || e.EventName === 'StopComplete' || e.event === 'StopComplete');

console.log("currentTxEvents:", currentTxEvents);
console.log("isCompleted:", isCompleted);
console.log("isCanceled:", isCanceled);
