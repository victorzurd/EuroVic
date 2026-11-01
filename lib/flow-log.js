export function logFlow(flow, traceId, step, details = {}) {
  console.info(JSON.stringify({
    service: 'eurovic',
    flow,
    trace_id: traceId,
    step,
    ...details
  }));
}

export function logFlowError(flow, traceId, step, error, details = {}) {
  console.error(JSON.stringify({
    service: 'eurovic',
    flow,
    trace_id: traceId,
    step,
    error_type: error?.name || 'Error',
    ...details
  }));
}
