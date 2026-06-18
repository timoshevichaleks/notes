// Доменные сервисы кидают Nest HttpException; при передаче через TCP
// сохраняется поле с { statusCode, message }. Gateway маппит его обратно в HTTP.
export interface RpcErrorShape {
  statusCode?: number;
  status?: number;
  message?: string | string[];
}
